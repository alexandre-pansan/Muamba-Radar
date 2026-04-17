from __future__ import annotations

import base64
import logging
import os
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.adapters.registry import get_adapters
from app.auth import create_access_token, create_refresh_token, get_current_user, get_current_user_optional, hash_password, require_admin, revoke_refresh_token, verify_password, verify_refresh_token
from app.config import settings
from app.database import SessionLocal, get_db, init_db
from app.models import AccessLog, ProductOffer, SearchCache, Store, User, UserCartItem, UserPrefs, UserSearch
from app.schemas import (
    # CompareByImageResponseModel,  # image detection deferred
    AdminAdapterResult,
    AdminBetaNoticeTextRequest,
    AdminDonateStatsRequest,
    AdminTestSearchRequest,
    AdminTestSearchResponse,
    CartGroupItem,
    CartItemCreate,
    CartItemResponse,
    CompareResponseModel,
    CountryFilter,
    # DetectImageResponseModel,  # image detection deferred
    LoginRequest,
    OfferModel,
    RefreshRequest,
    RegisterRequest,
    SortOption,
    SourceInfoModel,
    StoreCreate,
    StoreImportItem,
    StoreImportResult,
    StoreInfo,
    StoreUpdate,
    TokenResponse,
    UpdatePrefsRequest,
    UpdateProfileRequest,
    UserPrefsModel,
    UserResponse,
    UserSearchItem,
)
from app.services.compare import build_compare_response, build_response_from_offers, scrape_offers
# from app.services.image_detect import detect_product_from_image  # image detection deferred
from app.services.fx import build_price
from app.services.normalization import matches_query, normalize_text, slugify

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("mamu")

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="MAMU API", version="0.6.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_cors_origins = ["*"] if settings.cors_origins.strip() == "*" else settings.cors_origins.split()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    cache_header = response.headers.get("X-Cache", "")
    cache_tag = f" [{cache_header}]" if cache_header else ""
    log.info(
        "%s %s%s → %d  (%.0fms)",
        request.method,
        request.url.path,
        f"?{request.url.query}" if request.url.query else "",
        response.status_code,
        elapsed_ms,
    )
    if cache_tag:
        log.debug("  Cache: %s", cache_header)

    # Persistir log no banco (Marco Civil art. 15 — 6 meses)
    # Ignorar health check e rotas de assets para não poluir
    if not request.url.path.startswith("/static") and request.url.path != "/health":
        ip = request.headers.get("x-forwarded-for", request.client.host if request.client else None)
        if ip:
            ip = ip.split(",")[0].strip()
        try:
            db = SessionLocal()
            db.add(AccessLog(
                created_at=datetime.now(timezone.utc),
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
                ip=ip,
                user_id=None,  # sem decodificar JWT no middleware por performance
            ))
            db.commit()
        except Exception:
            pass
        finally:
            db.close()

    return response


_STATIC_DIR = Path(__file__).parent.parent / "static"
_STORE_PHOTOS_DIR = _STATIC_DIR / "store-photos"
_STORE_PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(_STATIC_DIR)), name="static")


@app.on_event("startup")
def on_startup() -> None:
    log.info("MAMU API starting up — DB init")
    init_db()
    log.info("MAMU API ready")




# ── Offer DB helpers ──────────────────────────────────────────────────────────

def _load_db_offers(
    db: Session,
    query_norm: str,
    country_val: str,
    now: datetime,
) -> list[OfferModel]:
    """Load fresh ProductOffer rows from DB that match the query."""
    tokens = [t for t in query_norm.split() if len(t) > 1]
    if not tokens:
        return []

    # SQL pre-filter: title must contain the primary token (usually brand/model)
    primary = tokens[0]
    q = db.query(ProductOffer).filter(
        ProductOffer.expires_at > now,
        ProductOffer.title_norm.contains(primary),
    )
    if country_val != "all":
        q = q.filter(ProductOffer.country == country_val)

    rows = q.all()
    log.debug("  db  %d rows pre-filtered on %r", len(rows), primary)

    offers: list[OfferModel] = []
    for row in rows:
        if not matches_query(query_norm, row.title):
            continue
        offers.append(OfferModel(
            offer_id=f"{row.source}-{slugify(row.title)}-{int(row.price_amount)}",
            source=row.source,
            country=row.country,
            store=row.store,
            title=row.title,
            brand=row.brand,
            model=row.model,
            image_url=row.image_url,
            price=build_price(row.price_amount, row.price_currency),
            url=row.url,
            captured_at=row.captured_at,
        ))
    return offers


def _purge_expired(db: Session, now: datetime) -> None:
    """Delete expired rows from product_offers and search_cache."""
    deleted_offers = (
        db.query(ProductOffer)
        .filter(ProductOffer.expires_at <= now)
        .delete(synchronize_session=False)
    )
    deleted_cache = (
        db.query(SearchCache)
        .filter(SearchCache.expires_at <= now)
        .delete(synchronize_session=False)
    )
    if deleted_offers or deleted_cache:
        db.commit()
        log.debug("purge: removed %d expired offers, %d stale cache entries", deleted_offers, deleted_cache)


def _upsert_offers(db: Session, offers: list[OfferModel], now: datetime) -> None:
    """Save/update offers in ProductOffer table. Live price always wins on conflict."""
    if not offers:
        return
    expires_at = now + timedelta(minutes=settings.cache_ttl_minutes)
    for offer in offers:
        stmt = (
            pg_insert(ProductOffer)
            .values(
                url=offer.url,
                source=offer.source,
                country=offer.country,
                store=offer.store,
                title=offer.title,
                title_norm=normalize_text(offer.title),
                image_url=offer.image_url,
                price_amount=offer.price.amount,
                price_currency=offer.price.currency,
                brand=offer.brand,
                model=offer.model,
                captured_at=now,
                expires_at=expires_at,
            )
            .on_conflict_do_update(
                index_elements=["url"],
                set_=dict(
                    price_amount=offer.price.amount,
                    price_currency=offer.price.currency,
                    image_url=offer.image_url,
                    captured_at=now,
                    expires_at=expires_at,
                ),
            )
        )
        db.execute(stmt)
    db.commit()
    log.debug("  upserted %d offers to product_offers", len(offers))


# ── User search history helper ────────────────────────────────────────────────

def _save_user_search(db: Session, user_id: int, query: str, now: datetime) -> None:
    """Upsert a user search entry (update timestamp if query already exists)."""
    existing = (
        db.query(UserSearch)
        .filter(UserSearch.user_id == user_id, UserSearch.query == query)
        .first()
    )
    if existing:
        existing.searched_at = now
    else:
        db.add(UserSearch(user_id=user_id, query=query, searched_at=now))
    db.commit()
    # Trim to 50 most recent per user
    old_rows = (
        db.query(UserSearch)
        .filter(UserSearch.user_id == user_id)
        .order_by(UserSearch.searched_at.desc())
        .offset(50)
        .all()
    )
    if old_rows:
        for row in old_rows:
            db.delete(row)
        db.commit()


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/config")
def get_config(db: Session = Depends(get_db)) -> dict:
    from app.models import GlobalConfig
    cfg = db.get(GlobalConfig, 1)
    return {
        "beta_notice_version": cfg.beta_notice_version if cfg else 1,
        "beta_notice_title":   cfg.beta_notice_title   if cfg else "🚧 Versão Beta",
        "beta_notice_body1":   cfg.beta_notice_body1   if cfg else "",
        "beta_notice_body2":   cfg.beta_notice_body2   if cfg else "",
        "donate_goal":         cfg.donate_goal         if cfg else 80,
        "donate_raised":       cfg.donate_raised       if cfg else 0,
        "donate_supporters":   cfg.donate_supporters   if cfg else 0,
    }


@app.patch("/admin/donate-stats")
def admin_update_donate_stats(
    body: AdminDonateStatsRequest,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    from app.models import GlobalConfig
    cfg = db.get(GlobalConfig, 1)
    if not cfg:
        cfg = GlobalConfig(id=1, beta_notice_version=1, donate_goal=80, donate_raised=0, donate_supporters=0)
        db.add(cfg)
    if body.donate_goal       is not None: cfg.donate_goal       = body.donate_goal
    if body.donate_raised     is not None: cfg.donate_raised     = body.donate_raised
    if body.donate_supporters is not None: cfg.donate_supporters = body.donate_supporters
    db.commit()
    return {
        "donate_goal":       cfg.donate_goal,
        "donate_raised":     cfg.donate_raised,
        "donate_supporters": cfg.donate_supporters,
    }


# ── Sources ───────────────────────────────────────────────────────────────────

@app.get("/sources", response_model=list[SourceInfoModel])
def list_sources() -> list[SourceInfoModel]:
    return [adapter.info() for adapter in get_adapters()]


# ── FX rate ───────────────────────────────────────────────────────────────────

@app.get("/fx")
def fx_rate() -> dict:
    """Return the current USD→BRL rate fetched from comprasparaguai.com.br."""
    from app.services.fx import get_brl_per_usd
    return {"brl_per_usd": get_brl_per_usd()}


# ── Featured images (for loading scene) ───────────────────────────────────────

@app.get("/featured-images")
def featured_images(
    limit: int = Query(default=8, ge=1, le=20),
    db: Session = Depends(get_db),
) -> list[str]:
    """Return random product image URLs from the DB to seed the loading animation."""
    from sqlalchemy import func
    now = datetime.now(timezone.utc)
    rows = (
        db.query(ProductOffer.image_url)
        .filter(
            ProductOffer.image_url.isnot(None),
            ProductOffer.expires_at > now,
        )
        .order_by(func.random())
        .limit(limit)
        .all()
    )
    return [url for (url,) in rows if url]


# ── Auth ──────────────────────────────────────────────────────────────────────

@app.post("/auth/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def register(request: Request, body: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    email_exists = db.query(User).filter(User.email == body.email).first()
    username_exists = db.query(User).filter(User.username == body.username).first()
    if email_exists or username_exists:
        # Generic message — don't reveal which field caused the conflict
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Conta já existente.")
    user = User(
        email=body.email,
        username=body.username,
        name=body.name,
        password_hash=hash_password(body.password),
        created_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id, db),
    )


_LOGIN_MAX_ATTEMPTS = 5
_LOGIN_LOCKOUT_MINUTES = 15


@app.post("/auth/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, body: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    # Accept email or username in the identifier field
    if "@" in body.identifier:
        user = db.query(User).filter(User.email == body.identifier).first()
    else:
        user = db.query(User).filter(User.username == body.identifier).first()

    now = datetime.now(timezone.utc)

    # Check lockout (check before password to avoid timing oracle)
    if user and user.locked_until:
        locked_until_aware = user.locked_until.replace(tzinfo=timezone.utc) if user.locked_until.tzinfo is None else user.locked_until
        if locked_until_aware > now:
            retry_after = int((locked_until_aware - now).total_seconds())
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Conta bloqueada temporariamente. Tente novamente em {_LOGIN_LOCKOUT_MINUTES} minutos.",
                headers={"Retry-After": str(retry_after)},
            )

    if not user or not verify_password(body.password, user.password_hash):
        if user:
            user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
            if user.failed_login_attempts >= _LOGIN_MAX_ATTEMPTS:
                user.locked_until = now + timedelta(minutes=_LOGIN_LOCKOUT_MINUTES)
            db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # Success — reset lockout counters
    user.failed_login_attempts = 0
    user.locked_until = None
    db.commit()

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id, db),
    )


@app.post("/auth/refresh", response_model=TokenResponse)
@limiter.limit("20/minute")
def refresh_token(request: Request, body: RefreshRequest, db: Session = Depends(get_db)) -> TokenResponse:
    rt = verify_refresh_token(body.refresh_token, db)
    # Rotate: revoke old token, issue new pair
    rt.revoked = True
    db.commit()
    return TokenResponse(
        access_token=create_access_token(rt.user_id),
        refresh_token=create_refresh_token(rt.user_id, db),
    )


@app.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(body: RefreshRequest, db: Session = Depends(get_db)) -> None:
    revoke_refresh_token(body.refresh_token, db)


@app.get("/auth/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        username=current_user.username,
        name=current_user.name,
        is_admin=current_user.is_admin,
        created_at=current_user.created_at,
    )


@app.patch("/auth/me", response_model=UserResponse)
def update_profile(
    body: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserResponse:
    if body.name is not None:
        current_user.name = body.name
    if body.password is not None:
        current_user.password_hash = hash_password(body.password)
    db.commit()
    db.refresh(current_user)
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        username=current_user.username,
        name=current_user.name,
        is_admin=current_user.is_admin,
        created_at=current_user.created_at,
    )


@app.get("/auth/me/prefs", response_model=UserPrefsModel)
def get_prefs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserPrefsModel:
    prefs = db.get(UserPrefs, current_user.id)
    if not prefs:
        return UserPrefsModel()
    return UserPrefsModel(show_margin=prefs.show_margin, hide_beta_notice=prefs.hide_beta_notice, tax_rates=prefs.tax_rates)


@app.patch("/auth/me/prefs", response_model=UserPrefsModel)
def update_prefs(
    body: UpdatePrefsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserPrefsModel:
    prefs = db.get(UserPrefs, current_user.id)
    if not prefs:
        prefs = UserPrefs(user_id=current_user.id, show_margin=False, hide_beta_notice=False)
        db.add(prefs)
    if body.show_margin is not None:
        prefs.show_margin = body.show_margin
    if body.hide_beta_notice is not None:
        prefs.hide_beta_notice = body.hide_beta_notice
    if body.tax_rates is not None:
        prefs.tax_rates = body.tax_rates
    db.commit()
    return UserPrefsModel(show_margin=prefs.show_margin, hide_beta_notice=prefs.hide_beta_notice, tax_rates=prefs.tax_rates)


@app.get("/auth/me/export")
def export_account(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """LGPD art. 18 — portabilidade de dados. Retorna todos os dados pessoais do titular em JSON."""
    prefs = db.get(UserPrefs, current_user.id)
    searches = (
        db.query(UserSearch)
        .filter(UserSearch.user_id == current_user.id)
        .order_by(UserSearch.searched_at.desc())
        .all()
    )
    cart_items = (
        db.query(UserCartItem)
        .filter(UserCartItem.user_id == current_user.id)
        .order_by(UserCartItem.added_at.desc())
        .all()
    )
    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "user": {
            "id": current_user.id,
            "email": current_user.email,
            "username": current_user.username,
            "name": current_user.name,
            "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
        },
        "preferences": {
            "show_margin": prefs.show_margin if prefs else False,
            "tax_rates": prefs.tax_rates if prefs else None,
        },
        "search_history": [
            {"query": s.query, "searched_at": s.searched_at.isoformat()}
            for s in searches
        ],
        "cart": [
            {
                "title": c.title,
                "store": c.store_name,
                "price": c.price_amount,
                "currency": c.price_currency,
                "url": c.offer_url,
                "added_at": c.added_at.isoformat(),
            }
            for c in cart_items
        ],
    }


@app.delete("/auth/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """LGPD art. 18 — direito à exclusão. Apaga todos os dados pessoais do titular."""
    db.query(UserSearch).filter(UserSearch.user_id == current_user.id).delete()
    db.query(UserPrefs).filter(UserPrefs.user_id == current_user.id).delete()
    db.query(UserCartItem).filter(UserCartItem.user_id == current_user.id).delete()
    db.delete(current_user)
    db.commit()


@app.get("/auth/me/searches", response_model=list[UserSearchItem])
def user_searches(
    limit: int = Query(default=20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[UserSearchItem]:
    rows = (
        db.query(UserSearch)
        .filter(UserSearch.user_id == current_user.id)
        .order_by(UserSearch.searched_at.desc())
        .limit(limit)
        .all()
    )
    return [UserSearchItem(query=r.query, searched_at=r.searched_at) for r in rows]


# ── Compare ───────────────────────────────────────────────────────────────────

@app.get("/compare", response_model=CompareResponseModel)
def compare(
    response: Response,
    q: str = Query(min_length=1, description="Search query, e.g. iphone 15 128gb"),
    country: CountryFilter = Query(default=CountryFilter.ALL),
    sort: SortOption = Query(default=SortOption.BEST_MATCH),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
) -> CompareResponseModel:
    query_norm = normalize_text(q)
    country_val = country.value
    sort_val = sort.value
    now = datetime.now(timezone.utc)
    t0 = time.perf_counter()

    log.info("compare  q=%r  country=%s  sort=%s", q, country_val, sort_val)

    # ── 1. Load fresh individual offers from DB ───────────────────────────────
    db_offers = _load_db_offers(db, query_norm, country_val, now)
    log.info("  db offers: %d", len(db_offers))

    # ── 2. Scrape live adapters ───────────────────────────────────────────────
    live_offers: list[OfferModel] = []
    try:
        live_offers = scrape_offers(query=q, country=country)
        log.info("  live offers: %d", len(live_offers))
    except Exception as exc:
        log.warning("  live scrape error: %s", exc)

    # ── 3. Merge — live wins when URL already exists in DB ────────────────────
    url_map: dict[str, OfferModel] = {o.url: o for o in db_offers}
    for o in live_offers:
        url_map[o.url] = o
    all_offers = list(url_map.values())
    log.info("  merged: %d unique offers", len(all_offers))

    # ── 4. Persist new/updated live offers to DB + purge expired rows ────────
    if live_offers:
        _upsert_offers(db, live_offers, now)
        _purge_expired(db, now)

    # ── 5. Record search query for suggestions / history ──────────────────────
    existing = (
        db.query(SearchCache)
        .filter(
            SearchCache.query_norm == query_norm,
            SearchCache.country == country_val,
            SearchCache.sort == sort_val,
        )
        .first()
    )
    if existing:
        existing.hit_count += 1
        existing.created_at = now
        existing.expires_at = now + timedelta(minutes=settings.cache_ttl_minutes)
    else:
        db.add(SearchCache(
            query_raw=q,
            query_norm=query_norm,
            country=country_val,
            sort=sort_val,
            result_json=None,
            created_at=now,
            expires_at=now + timedelta(minutes=settings.cache_ttl_minutes),
            hit_count=1,
        ))
    db.commit()

    # ── 5b. Record per-user search history ───────────────────────────────────
    if current_user:
        _save_user_search(db, current_user.id, q, now)

    # ── 6. Set cache header and build response ────────────────────────────────
    if not all_offers:
        log.warning("  → EMPTY  no results anywhere  (%.0fms)", (time.perf_counter() - t0) * 1000)
        return CompareResponseModel(query=q, generated_at=now, groups=[])

    if live_offers:
        response.headers["X-Cache"] = "MISS"
    else:
        response.headers["X-Cache"] = "FALLBACK"

    result = build_response_from_offers(query=q, offers=all_offers, sort=sort, country=country)
    log.info(
        "  → %s  groups=%d  (%.0fms)",
        "MISS" if live_offers else "FALLBACK",
        len(result.groups),
        (time.perf_counter() - t0) * 1000,
    )
    return result


# ── Suggestions (autocomplete) ────────────────────────────────────────────────

@app.get("/suggestions")
def suggestions(
    q: str = Query(min_length=1),
    db: Session = Depends(get_db),
) -> list[str]:
    q_norm = normalize_text(q)
    rows = (
        db.query(SearchCache.query_raw, SearchCache.query_norm, SearchCache.hit_count)
        .filter(SearchCache.query_norm.like(q_norm + "%"))
        .order_by(SearchCache.hit_count.desc(), SearchCache.created_at.desc())
        .all()
    )
    # Deduplicate by query_norm, keep the most popular query_raw for each
    seen: set[str] = set()
    result: list[str] = []
    for row in rows:
        if row.query_norm not in seen:
            seen.add(row.query_norm)
            result.append(row.query_raw)
        if len(result) >= 8:
            break
    return result


# ── History (requires login) ──────────────────────────────────────────────────

@app.get("/history")
def search_history(
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    rows = (
        db.query(
            SearchCache.query_raw,
            SearchCache.country,
            SearchCache.sort,
            SearchCache.created_at,
            SearchCache.expires_at,
            SearchCache.hit_count,
        )
        .order_by(SearchCache.created_at.desc())
        .limit(limit)
        .all()
    )
    now = datetime.now(timezone.utc)
    return [
        {
            "query": r.query_raw,
            "country": r.country,
            "sort": r.sort,
            "searched_at": r.created_at.isoformat(),
            "expires_at": r.expires_at.isoformat(),
            "hit_count": r.hit_count,
            "cached": r.expires_at > now,
        }
        for r in rows
    ]


# ── Admin: cache refresh ──────────────────────────────────────────────────────

_refresh_progress: dict = {"running": False, "done": 0, "total": 0, "current": ""}


def _refresh_all_cached_queries() -> None:
    """Re-scrape every saved query and upsert individual offers to ProductOffer."""
    global _refresh_progress
    db = SessionLocal()
    try:
        rows = (
            db.query(SearchCache.query_raw, SearchCache.country, SearchCache.sort)
            .distinct()
            .all()
        )
        total = len(rows)
        _refresh_progress = {"running": True, "done": 0, "total": total, "current": ""}
        log.info("refresh  starting — %d unique queries", total)
        now = datetime.now(timezone.utc)
        for i, row in enumerate(rows, 1):
            _refresh_progress["done"] = i - 1
            _refresh_progress["current"] = row.query_raw
            log.info("refresh  [%d/%d]  q=%r  country=%s", i, total, row.query_raw, row.country)
            try:
                live_offers = scrape_offers(
                    query=row.query_raw,
                    country=CountryFilter(row.country),
                )
                if live_offers:
                    _upsert_offers(db, live_offers, now)
                    log.info("  upserted %d offers", len(live_offers))
                else:
                    log.warning("  no results — skipped")
                time.sleep(2)  # be polite to scraped sites
            except Exception as exc:
                log.warning("  error refreshing %r: %s", row.query_raw, exc)
                continue
        log.info("refresh  done")
    finally:
        _refresh_progress = {"running": False, "done": _refresh_progress.get("total", 0), "total": _refresh_progress.get("total", 0), "current": ""}
        db.close()


@app.post("/admin/beta-notice/bump")
def admin_bump_beta_notice(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    from app.models import GlobalConfig
    cfg = db.get(GlobalConfig, 1)
    if not cfg:
        cfg = GlobalConfig(id=1, beta_notice_version=1)
        db.add(cfg)
    cfg.beta_notice_version += 1
    db.commit()
    return {"beta_notice_version": cfg.beta_notice_version}


@app.patch("/admin/beta-notice/text")
def admin_update_beta_notice_text(
    body: AdminBetaNoticeTextRequest,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    import bleach
    from app.models import GlobalConfig
    _ALLOWED_TAGS = ["strong", "em", "u", "br", "a"]
    _ALLOWED_ATTRS = {"a": ["href", "rel"]}

    cfg = db.get(GlobalConfig, 1)
    if not cfg:
        cfg = GlobalConfig(id=1)
        db.add(cfg)
    if body.beta_notice_title is not None:
        cfg.beta_notice_title = bleach.clean(body.beta_notice_title, tags=[], strip=True)
    if body.beta_notice_body1 is not None:
        cfg.beta_notice_body1 = bleach.clean(body.beta_notice_body1, tags=_ALLOWED_TAGS, attributes=_ALLOWED_ATTRS, strip=True)
    if body.beta_notice_body2 is not None:
        cfg.beta_notice_body2 = bleach.clean(body.beta_notice_body2, tags=_ALLOWED_TAGS, attributes=_ALLOWED_ATTRS, strip=True)
    db.commit()
    return {
        "beta_notice_title": cfg.beta_notice_title,
        "beta_notice_body1": cfg.beta_notice_body1,
        "beta_notice_body2": cfg.beta_notice_body2,
    }


@app.post("/admin/refresh-cache")
def trigger_refresh_cache(
    background_tasks: BackgroundTasks,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    if _refresh_progress.get("running"):
        return {"status": "already_running", **_refresh_progress}
    count = db.query(SearchCache.query_norm).distinct().count()
    background_tasks.add_task(_refresh_all_cached_queries)
    return {"status": "started", "unique_queries": count}


@app.get("/admin/refresh-cache/status")
def refresh_cache_status(_: User = Depends(require_admin)) -> dict:
    return _refresh_progress


@app.get("/admin/users", response_model=list[UserResponse])
def admin_list_users(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[UserResponse]:
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [UserResponse.model_validate(u) for u in users]


@app.delete("/admin/users/{user_id}")
def admin_delete_user(
    user_id: int,
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    if user_id == current_admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"status": "deleted"}


@app.patch("/admin/users/{user_id}/toggle-admin", response_model=UserResponse)
def admin_toggle_admin(
    user_id: int,
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> UserResponse:
    if user_id == current_admin.id:
        raise HTTPException(status_code=400, detail="Cannot change your own admin status")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_admin = not user.is_admin
    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@app.post("/admin/test-search", response_model=AdminTestSearchResponse)
def admin_test_search(
    body: AdminTestSearchRequest,
    _: User = Depends(require_admin),
) -> AdminTestSearchResponse:
    """Run a test search against selected adapters and return per-adapter debug info."""
    from app.services.normalization import is_refurbished_or_used, matches_query

    all_adapters = get_adapters()
    selected = [
        a for a in all_adapters
        if not body.adapter_ids or a.source_id in body.adapter_ids
    ]
    query_norm = normalize_text(body.query)
    results: list[AdminAdapterResult] = []

    for adapter in selected:
        t0 = time.perf_counter()
        error: str | None = None
        raw_offers = []
        try:
            raw_offers = adapter.search(body.query)
        except Exception as exc:
            error = str(exc)
        timing_ms = round((time.perf_counter() - t0) * 1000, 1)

        filtered = [
            r for r in raw_offers
            if not is_refurbished_or_used(r.title) and matches_query(query_norm, r.title)
        ]
        def to_dict(o):
            return {"title": o.title, "price": o.price_amount, "currency": o.price_currency, "url": o.url}

        results.append(AdminAdapterResult(
            adapter_id=adapter.source_id,
            country=adapter.country,
            raw_count=len(raw_offers),
            filtered_count=len(filtered),
            error=error,
            timing_ms=timing_ms,
            sample_offers=[to_dict(o) for o in filtered],
            raw_offers=[to_dict(o) for o in raw_offers],
        ))

    return AdminTestSearchResponse(
        query=body.query,
        total_raw=sum(r.raw_count for r in results),
        total_filtered=sum(r.filtered_count for r in results),
        adapters=results,
    )


# ── Cart helpers ──────────────────────────────────────────────────────────────

def _find_store_match(db: Session, store_name: str, country: str) -> Store | None:
    """Try to match a store_name against stores.name_aliases (case-insensitive)."""
    stores = db.query(Store).filter(Store.country == country).all()
    name_lower = store_name.lower()
    for store in stores:
        check_names = [store.name.lower()]
        if store.name_aliases:
            check_names.extend(a.lower() for a in store.name_aliases)
        if any(name_lower in alias or alias in name_lower for alias in check_names):
            return store
    return None


def _enrich_cart_item(item: UserCartItem, db: Session) -> CartItemResponse:
    store_info = None
    if item.store_id:
        s = db.get(Store, item.store_id)
        if s:
            store_info = StoreInfo.model_validate(s)
    else:
        # Lazy match: store was registered after this item was added to cart
        s = _find_store_match(db, item.store_name, item.country)
        if s:
            item.store_id = s.id
            try:
                db.commit()
            except Exception:
                db.rollback()
            store_info = StoreInfo.model_validate(s)
    return CartItemResponse(
        id=item.id,
        offer_url=item.offer_url,
        source=item.source,
        country=item.country,
        store_name=item.store_name,
        title=item.title,
        price_amount=item.price_amount,
        price_currency=item.price_currency,
        image_url=item.image_url,
        store_id=item.store_id,
        store=store_info,
        added_at=item.added_at,
    )


# ── Cart endpoints ────────────────────────────────────────────────────────────

@app.get("/cart", response_model=list[CartItemResponse])
def get_cart(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CartItemResponse]:
    items = (
        db.query(UserCartItem)
        .filter(UserCartItem.user_id == current_user.id)
        .order_by(UserCartItem.added_at.desc())
        .all()
    )
    return [_enrich_cart_item(item, db) for item in items]


@app.post("/cart", response_model=CartItemResponse, status_code=status.HTTP_201_CREATED)
def add_to_cart(
    body: CartItemCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CartItemResponse:
    existing = (
        db.query(UserCartItem)
        .filter(UserCartItem.user_id == current_user.id, UserCartItem.offer_url == body.offer_url)
        .first()
    )
    if existing:
        return _enrich_cart_item(existing, db)

    store = _find_store_match(db, body.store_name, body.country)
    item = UserCartItem(
        user_id=current_user.id,
        offer_url=body.offer_url,
        source=body.source,
        country=body.country,
        store_name=body.store_name,
        title=body.title,
        price_amount=body.price_amount,
        price_currency=body.price_currency,
        image_url=body.image_url,
        store_id=store.id if store else None,
        added_at=datetime.now(timezone.utc),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _enrich_cart_item(item, db)


@app.delete("/cart", status_code=status.HTTP_204_NO_CONTENT)
def clear_cart(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    db.query(UserCartItem).filter(UserCartItem.user_id == current_user.id).delete()
    db.commit()


@app.delete("/cart/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_from_cart(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    item = (
        db.query(UserCartItem)
        .filter(UserCartItem.id == item_id, UserCartItem.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()


@app.get("/cart/grouped", response_model=list[CartGroupItem])
def get_cart_grouped(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CartGroupItem]:
    items = (
        db.query(UserCartItem)
        .filter(UserCartItem.user_id == current_user.id)
        .order_by(UserCartItem.store_name, UserCartItem.added_at.desc())
        .all()
    )
    groups: dict[str, CartGroupItem] = {}
    for item in items:
        key = item.store_name
        if key not in groups:
            store_info = None
            if item.store_id:
                s = db.get(Store, item.store_id)
                if s:
                    store_info = StoreInfo.model_validate(s)
            groups[key] = CartGroupItem(store_name=key, store=store_info, items=[])
        groups[key].items.append(_enrich_cart_item(item, db))
    return list(groups.values())


# ── Admin: Stores ─────────────────────────────────────────────────────────────

@app.get("/admin/stores", response_model=list[StoreInfo])
def admin_list_stores(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[StoreInfo]:
    stores = db.query(Store).order_by(Store.country, Store.name).all()
    return [StoreInfo.model_validate(s) for s in stores]


@app.post("/admin/stores", response_model=StoreInfo, status_code=status.HTTP_201_CREATED)
def admin_create_store(
    body: StoreCreate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> StoreInfo:
    now = datetime.now(timezone.utc)
    store = Store(
        name=body.name,
        name_aliases=body.name_aliases or [],
        country=body.country,
        address=body.address,
        city=body.city,
        lat=body.lat,
        lng=body.lng,
        photo_url=body.photo_url,
        google_maps_url=body.google_maps_url,
        created_at=now,
        updated_at=now,
    )
    db.add(store)
    db.commit()
    db.refresh(store)
    return StoreInfo.model_validate(store)


@app.patch("/admin/stores/{store_id}", response_model=StoreInfo)
def admin_update_store(
    store_id: int,
    body: StoreUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> StoreInfo:
    store = db.get(Store, store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    if body.name is not None: store.name = body.name
    if body.name_aliases is not None: store.name_aliases = body.name_aliases
    if body.country is not None: store.country = body.country
    if body.address is not None: store.address = body.address
    if body.city is not None: store.city = body.city
    if body.lat is not None: store.lat = body.lat
    if body.lng is not None: store.lng = body.lng
    if body.photo_url is not None: store.photo_url = body.photo_url
    if body.google_maps_url is not None: store.google_maps_url = body.google_maps_url
    store.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(store)
    return StoreInfo.model_validate(store)


@app.delete("/admin/stores/{store_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_store(
    store_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    store = db.get(Store, store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    db.delete(store)
    db.commit()


@app.post("/admin/stores/{store_id}/photo", response_model=StoreInfo)
async def admin_upload_store_photo(
    store_id: int,
    file: UploadFile = File(...),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> StoreInfo:
    store = db.get(Store, store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    content_type = file.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    ext = content_type.split("/")[-1].split(";")[0].strip()
    if ext not in ("jpeg", "jpg", "png", "webp"):
        ext = "jpg"
    filename = f"{uuid.uuid4().hex}.{ext}"
    dest = _STORE_PHOTOS_DIR / filename
    content = await file.read()
    dest.write_bytes(content)
    # Remove old photo if it was a local upload
    if store.photo_url and store.photo_url.startswith("/static/store-photos/"):
        old_file = _STATIC_DIR / store.photo_url.removeprefix("/static/")
        if old_file.exists():
            old_file.unlink(missing_ok=True)
    store.photo_url = f"/static/store-photos/{filename}"
    store.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(store)
    return StoreInfo.model_validate(store)


# ── Admin: unmatched store names ─────────────────────────────────────────────

@app.get("/admin/stores/unmatched")
def admin_unmatched_stores(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Return distinct store names from product_offers + cart items that have no matching Store row."""
    from sqlalchemy import func, select, union_all, literal

    # All known store names (exact + aliases)
    known_stores = db.query(Store).all()
    known_names: set[str] = set()
    for s in known_stores:
        known_names.add(s.name.lower())
        for alias in (s.name_aliases or []):
            known_names.add(alias.lower())

    # Collect candidates from product_offers (live catalogue) — PY only
    offer_rows = (
        db.query(ProductOffer.store, ProductOffer.country, func.count().label("cnt"))
        .filter(ProductOffer.country == "py")
        .group_by(ProductOffer.store, ProductOffer.country)
        .all()
    )

    # Collect candidates from cart items without a store_id — PY only
    cart_rows = (
        db.query(UserCartItem.store_name, UserCartItem.country, func.count().label("cnt"))
        .filter(UserCartItem.store_id.is_(None), UserCartItem.country == "py")
        .group_by(UserCartItem.store_name, UserCartItem.country)
        .all()
    )

    # Merge counts by (store_name, country), skip already-known stores
    merged: dict[tuple[str, str], int] = {}
    for r in offer_rows:
        key = (r.store, r.country)
        if r.store.lower() not in known_names:
            merged[key] = merged.get(key, 0) + r.cnt
    for r in cart_rows:
        key = (r.store_name, r.country)
        if r.store_name.lower() not in known_names:
            merged[key] = merged.get(key, 0) + r.cnt

    result = [
        {"store_name": name, "country": country, "occurrences": cnt}
        for (name, country), cnt in sorted(merged.items(), key=lambda x: -x[1])
    ]
    return result


# ── Admin: export / import stores ─────────────────────────────────────────────

@app.get("/admin/stores/export")
def admin_export_stores(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Export all stores as JSON with photos embedded as base64."""
    stores = db.query(Store).order_by(Store.name).all()
    result = []
    for s in stores:
        row = StoreInfo.model_validate(s).model_dump()
        # Embed photo as base64 if it's a local file
        if s.photo_url and s.photo_url.startswith("/static/"):
            photo_path = _STATIC_DIR / s.photo_url.removeprefix("/static/").lstrip("/")
            if photo_path.exists():
                raw = photo_path.read_bytes()
                suffix = photo_path.suffix.lower()
                mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
                        "webp": "image/webp", "gif": "image/gif"}.get(suffix.lstrip("."), "image/jpeg")
                row["photo_data"] = base64.b64encode(raw).decode()
                row["photo_mime"] = mime
        result.append(row)
    return result


@app.post("/admin/stores/import", response_model=StoreImportResult)
def admin_import_stores(
    body: list[StoreImportItem],
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> StoreImportResult:
    """Import stores from JSON. Upserts by name (case-insensitive).
    photo_url: kept only if it's an external https:// URL; local /static/ paths are dropped."""
    now = datetime.now(timezone.utc)
    created = updated = skipped = 0

    def _decode_photo(item: StoreImportItem) -> str | None:
        """Decode base64 photo → save to disk → return /static/... URL."""
        if item.photo_data:
            try:
                raw = base64.b64decode(item.photo_data)
                ext = {"image/jpeg": "jpg", "image/png": "png",
                       "image/webp": "webp", "image/gif": "gif"}.get(item.photo_mime or "", "jpg")
                filename = f"{uuid.uuid4().hex}.{ext}"
                ((_STORE_PHOTOS_DIR) / filename).write_bytes(raw)
                return f"/static/store-photos/{filename}"
            except Exception:
                pass
        if item.photo_url and item.photo_url.startswith("https://"):
            return item.photo_url
        return None

    for item in body:
        existing = (
            db.query(Store)
            .filter(Store.name.ilike(item.name))
            .first()
        )
        if existing:
            changed = False
            for field in ("name_aliases", "country", "address", "city", "lat", "lng", "google_maps_url"):
                val = getattr(item, field)
                if val is not None and val != getattr(existing, field):
                    setattr(existing, field, val)
                    changed = True
            # Update photo only if the store has none
            if not existing.photo_url:
                decoded = _decode_photo(item)
                if decoded:
                    existing.photo_url = decoded
                    changed = True
            if changed:
                existing.updated_at = now
                updated += 1
            else:
                skipped += 1
        else:
            db.add(Store(
                name=item.name,
                name_aliases=item.name_aliases or None,
                country=item.country,
                address=item.address,
                city=item.city,
                lat=item.lat,
                lng=item.lng,
                photo_url=_decode_photo(item),
                google_maps_url=item.google_maps_url,
                created_at=now,
                updated_at=now,
            ))
            created += 1

    db.commit()
    return StoreImportResult(created=created, updated=updated, skipped=skipped)


# ── Image (deferred — placeholder only, uncomment when real vision is ready) ──

# @app.post("/detect-product-image", response_model=DetectImageResponseModel)
# async def detect_product_image(file: UploadFile = File(...)) -> DetectImageResponseModel:
#     content_type = file.content_type or "application/octet-stream"
#     if not content_type.startswith("image/"):
#         raise HTTPException(status_code=400, detail="Uploaded file must be an image.")
#     return detect_product_from_image(filename=file.filename or "upload", content_type=content_type)

# @app.post("/compare/image", response_model=CompareByImageResponseModel)
# async def compare_by_image(
#     file: UploadFile = File(...),
#     country: CountryFilter = Query(default=CountryFilter.ALL),
#     sort: SortOption = Query(default=SortOption.BEST_MATCH),
# ) -> CompareByImageResponseModel:
#     content_type = file.content_type or "application/octet-stream"
#     if not content_type.startswith("image/"):
#         raise HTTPException(status_code=400, detail="Uploaded file must be an image.")
#     detection = detect_product_from_image(filename=file.filename or "upload", content_type=content_type)
#     comparison = build_compare_response(query=detection.top_query, country=country, sort=sort)
#     return CompareByImageResponseModel(detection=detection, comparison=comparison)
