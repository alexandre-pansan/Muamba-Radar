from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import subprocess
import sys
import time
import uuid
import requests
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import BackgroundTasks, Depends, FastAPI, File, Header, HTTPException, Query, Request, Response, UploadFile, status
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.adapters.registry import get_adapters
from app.auth import create_access_token, create_refresh_token, get_current_user, get_current_user_optional, hash_password, require_admin, require_seller_plan, revoke_refresh_token, verify_password, verify_refresh_token
from app.config import settings
from app.crypto import blind_index
from app.database import SessionLocal, get_db, init_db
from app.models import AccessLog, DataReport, ProductOffer, RefreshToken, SearchCache, SellerBannerCampaign, SellerCoupon, SellerProductHighlight, SellerProfile, Store, User, UserCartItem, UserFavorite, UserPrefs, UserSearch
from app.schemas import (
    # CompareByImageResponseModel,  # image detection deferred
    AdminAdapterResult,
    AdminBetaNoticeTextRequest,
    AdminDonateStatsRequest,
    AdminReportResolve,
    AdminTestSearchRequest,
    AdminRawFetchResponse,
    AdminTestSearchResponse,
    BillingStatusResponse,
    BillingSubscribeRequest,
    BillingSubscribeResponse,
    BillingSubscriptionStatus,
    CartCouponItem,
    CartGroupItem,
    CartItemCreate,
    CartItemResponse,
    CompareResponseModel,
    CountryFilter,
    CouponInfo,
    # DetectImageResponseModel,  # image detection deferred
    FavoriteCreate,
    FavoriteResponse,
    LoginRequest,
    OfferModel,
    PriceModel,
    ProductGroupModel,
    RefreshRequest,
    RegisterRequest,
    ReportCreate,
    ReportResponse,
    SellerBannerCreate,
    SellerBannerResponse,
    SellerCouponCreate,
    SellerCouponResponse,
    SellerHighlightCreate,
    SellerHighlightResponse,
    SellerMetrics,
    SellerOfferGroup,
    SellerProfileAdminUpdate,
    SellerProfileAdminView,
    SellerProfileCreate,
    SellerProfileResponse,
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
from app.services.compare import build_compare_response, build_group_model, build_response_from_offers, scrape_offers
# from app.services.image_detect import detect_product_from_image  # image detection deferred
from app.services.fx import build_price
from app.services.matcher import group_offers
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

_wildcard_cors = settings.cors_origins.strip() == "*"
_cors_origins = ["*"] if _wildcard_cors else settings.cors_origins.split()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    # Credentials (cookies/Authorization) require explicit origins — never combine
    # with wildcard or any origin can send credentialed cross-site requests.
    allow_credentials=not _wildcard_cors,
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

_REPO_ROOT = Path(__file__).parent.parent.parent
_CRAWLER_SCRIPT = _REPO_ROOT / "scripts" / "catalog_crawler.py"
_CRAWLER_STATE_DIR = _REPO_ROOT / "scripts" / "catalog_crawler_state"
_CRAWLER_CATEGORIES_FILE = _CRAWLER_STATE_DIR / "categories.json"
_CRAWLER_CHECKPOINT_FILE = _CRAWLER_STATE_DIR / "checkpoint.json"
_CRAWLER_STATUS_FILE = _CRAWLER_STATE_DIR / "status.json"
_CRAWLER_STOP_FLAG = _CRAWLER_STATE_DIR / "stop.flag"
_CRAWLER_LOG_FILE = _CRAWLER_STATE_DIR / "crawler.log"
_STORE_PHOTOS_DIR = _STATIC_DIR / "store-photos"
_STORE_PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(_STATIC_DIR)), name="static")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    return response


@app.on_event("startup")
def on_startup() -> None:
    log.info("MAMU API starting up — DB init")
    init_db()
    _cleanup_expired_tokens()
    log.info("MAMU API ready")




# ── Token cleanup ────────────────────────────────────────────────────────────

def _cleanup_expired_tokens() -> None:
    """Delete revoked and expired refresh tokens — run on startup."""
    try:
        db = SessionLocal()
        now = datetime.now(timezone.utc)
        deleted = (
            db.query(RefreshToken)
            .filter((RefreshToken.revoked == True) | (RefreshToken.expires_at < now))
            .delete(synchronize_session=False)
        )
        if deleted:
            db.commit()
            log.info("cleanup: removed %d stale refresh tokens", deleted)
    except Exception as exc:
        log.warning("cleanup_expired_tokens failed: %s", exc)
    finally:
        db.close()


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
    email_bi = blind_index(body.email)
    username_bi = blind_index(body.username) if body.username else None
    email_exists = (
        db.query(User).filter(User.email_blind == email_bi).first()
        if email_bi else db.query(User).filter(User.email == body.email).first()
    )
    username_exists = (
        db.query(User).filter(User.username_blind == username_bi).first()
        if username_bi else db.query(User).filter(User.username == body.username).first()
    )
    if email_exists or username_exists:
        # Generic message — don't reveal which field caused the conflict
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Conta já existente.")
    user = User(
        email=body.email,
        email_blind=email_bi,
        username=body.username,
        username_blind=username_bi,
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
    identifier_bi = blind_index(body.identifier)
    if "@" in body.identifier:
        user = (
            db.query(User).filter(User.email_blind == identifier_bi).first()
            if identifier_bi else db.query(User).filter(User.email == body.identifier).first()
        )
    else:
        user = (
            db.query(User).filter(User.username_blind == identifier_bi).first()
            if identifier_bi else db.query(User).filter(User.username == body.identifier).first()
        )

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
    _delete_user_data(db, current_user)
    db.commit()


def _delete_user_data(db: Session, user: User) -> None:
    """Apaga o usuário e tudo que aponta pra ele. As FKs não têm ON DELETE CASCADE,
    então sem isso o DELETE em users falhava (500) assim que o usuário tivesse feito
    login (refresh_tokens) ou criado favorito/perfil de lojista. data_reports fica —
    a FK de lá é SET NULL e a denúncia continua útil sem o autor."""
    profile = db.query(SellerProfile).filter(SellerProfile.user_id == user.id).first()
    if profile:
        for model in (SellerProductHighlight, SellerCoupon, SellerBannerCampaign):
            db.query(model).filter(model.seller_profile_id == profile.id).delete()
        db.delete(profile)
    for model in (RefreshToken, UserSearch, UserPrefs, UserCartItem, UserFavorite):
        db.query(model).filter(model.user_id == user.id).delete()
    db.flush()
    db.delete(user)


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


def _sellers_by_store_name(db: Session, store_names: set[str]) -> dict[str, list[SellerProfile]]:
    """Maps each lowercased store name to the seller profiles (on an active plan) that
    claim it. A store name isn't unique — it's self-declared, so more than one seller
    profile can legitimately share the same store_name: matches ALL of them, not the
    first. One query regardless of how many names come in."""
    if not store_names:
        return {}
    sellers = db.query(SellerProfile).filter(SellerProfile.plan_tier != "none").all()
    if not sellers:
        return {}
    out: dict[str, list[SellerProfile]] = {}
    for store in store_names:
        store_lower = store.lower()
        matches = [
            seller for seller in sellers
            if (name_lower := seller.store_name.lower()) in store_lower or store_lower in name_lower
        ]
        if matches:
            out[store_lower] = matches
    return out


def _enrich_with_seller_data(db: Session, groups: list[ProductGroupModel]) -> None:
    """Marks groups as highlighted / attaches a coupon when a seller with an active plan
    matches one of the group's stores — a few batched queries regardless of result-set
    size, not a per-group lookup. Mutates `groups` in place, including re-sorting so
    highlighted groups come first (stable sort — otherwise preserves original order)."""
    if not groups:
        return
    store_names = {offer.store for g in groups for offer in g.offers}
    if not store_names:
        return

    seller_for_store = _sellers_by_store_name(db, store_names)
    if not seller_for_store:
        return

    matched_seller_ids = {s.id for matches in seller_for_store.values() for s in matches}
    today = date.today()
    highlighted_keys = {
        h.product_key
        for h in db.query(SellerProductHighlight).filter(
            SellerProductHighlight.seller_profile_id.in_(matched_seller_ids),
            SellerProductHighlight.cooldown_until.is_(None),
            SellerProductHighlight.end_date >= today,
        ).all()
    }

    coupons_by_seller: dict[int, list[SellerCoupon]] = {}
    for c in db.query(SellerCoupon).filter(
        SellerCoupon.seller_profile_id.in_(matched_seller_ids),
        SellerCoupon.active == True,  # noqa: E712
    ).all():
        coupons_by_seller.setdefault(c.seller_profile_id, []).append(c)

    def coupon_for_group(seller_ids: set[int], product_key: str) -> CouponInfo | None:
        for sid in seller_ids:
            for c in coupons_by_seller.get(sid, []):
                if c.product_key is None or c.product_key == product_key:
                    return CouponInfo(code=c.code, type=c.type, value=c.value)
        return None

    for group in groups:
        group_seller_ids = {
            s.id
            for offer in group.offers
            for s in seller_for_store.get(offer.store.lower(), [])
        }
        if not group_seller_ids:
            continue
        if group.product_key in highlighted_keys:
            group.is_highlighted = True
        group.coupon = coupon_for_group(group_seller_ids, group.product_key)

    groups.sort(key=lambda g: not g.is_highlighted)


# ── Compare ───────────────────────────────────────────────────────────────────

@app.get("/compare", response_model=CompareResponseModel)
@limiter.limit("30/minute")
def compare(
    request: Request,
    response: Response,
    q: str = Query(min_length=1, max_length=200, description="Search query, e.g. iphone 15 128gb"),
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

    # ── 3b. Attach store_info to each offer (batch lookup) ───────────────────
    all_stores = db.query(Store).all()
    store_map: dict[str, Store] = {}
    for s in all_stores:
        store_map[s.name.lower()] = s
        for alias in (s.name_aliases or []):
            store_map[alias.lower()] = s
    for o in all_offers:
        s = store_map.get(o.store.lower())
        if s:
            o.store_info = StoreInfo.model_validate(s)

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
    try:
        _enrich_with_seller_data(db, result.groups)
    except Exception as exc:
        log.warning("  seller enrichment failed (non-fatal): %s", exc)
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


@app.get("/trending")
def trending(
    limit: int = Query(default=8, ge=1, le=20),
    db: Session = Depends(get_db),
) -> list[str]:
    """Real top-searched queries (by SearchCache.hit_count, unexpired rows only — the
    same signal /suggestions already uses for autocomplete ranking). Home's "Mais
    pesquisados" section feeds each of these through /compare, same pattern as its
    "Populares" seed-query carousel. Note: SearchCache rows purge on expiry (~30min TTL
    by default), so this reflects recent traffic, not a long-lived trending history —
    an accepted trade-off already baked into how /suggestions works."""
    now = datetime.now(timezone.utc)
    rows = (
        db.query(SearchCache.query_raw, SearchCache.query_norm, SearchCache.hit_count)
        .filter(SearchCache.expires_at > now)
        .order_by(SearchCache.hit_count.desc(), SearchCache.created_at.desc())
        .all()
    )
    seen: set[str] = set()
    result: list[str] = []
    for row in rows:
        if row.query_norm not in seen:
            seen.add(row.query_norm)
            result.append(row.query_raw)
        if len(result) >= limit:
            break
    return result


@app.get("/highlights", response_model=list[ProductGroupModel])
def get_active_highlights(
    limit: int = Query(default=8, ge=1, le=20),
    db: Session = Depends(get_db),
) -> list[ProductGroupModel]:
    """Real, currently-active seller highlights (backend Phase 2), resolved against each
    seller's live offers — not a fabricated "featured products" list. Empty when no
    seller currently has an active highlight, which Home.jsx shows honestly rather than
    hiding or backfilling with unrelated products."""
    today = date.today()
    now = datetime.now(timezone.utc)
    rows = (
        db.query(SellerProductHighlight)
        .filter(SellerProductHighlight.cooldown_until.is_(None), SellerProductHighlight.end_date >= today)
        .order_by(SellerProductHighlight.created_at.desc())
        .limit(limit * 3)  # a few extra since some product_keys may no longer resolve
        .all()
    )
    if not rows:
        return []

    seller_ids = {r.seller_profile_id for r in rows}
    sellers = {s.id: s for s in db.query(SellerProfile).filter(SellerProfile.id.in_(seller_ids)).all()}

    by_seller: dict[int, list[SellerProductHighlight]] = {}
    for r in rows:
        by_seller.setdefault(r.seller_profile_id, []).append(r)

    result: list[ProductGroupModel] = []
    seen_keys: set[str] = set()
    for seller_id, hl_rows in by_seller.items():
        if len(result) >= limit:
            break
        seller = sellers.get(seller_id)
        if not seller:
            continue
        offers = _load_seller_offers(db, seller.store_name, now)
        if not offers:
            continue
        grouped, _ = group_offers("", offers)
        groups_by_key = {pk: (pk, fk, cn, conf, offs, conc, vol, volt) for pk, fk, cn, conf, offs, conc, vol, volt in grouped}
        for hl in hl_rows:
            if hl.product_key in seen_keys:
                continue
            g = groups_by_key.get(hl.product_key)
            if not g:
                continue
            model = build_group_model(*g)
            model.is_highlighted = True
            result.append(model)
            seen_keys.add(hl.product_key)
            if len(result) >= limit:
                break
    return result


# ── History (requires login) ──────────────────────────────────────────────────

@app.get("/history")
def search_history(
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
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


# ── Admin: search history ─────────────────────────────────────────────────────

@app.get("/admin/search-history")
def admin_search_history(
    limit: int = Query(default=1000, ge=1, le=5000),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> list[dict[str, Any]]:
    from sqlalchemy import func, union
    cache_q = db.query(SearchCache.query_raw.label("query")).distinct()
    user_q  = db.query(UserSearch.query.label("query")).distinct()
    all_queries = sorted(
        {r.query for r in cache_q.all()} | {r.query for r in user_q.all()}
    )
    return [{"query": q} for q in all_queries]


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


def _read_json_safe(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return None


def _crawler_process_alive(pid: int | None) -> bool:
    if not pid:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True  # exists, owned by another user — shouldn't happen here, but it's alive
    except OSError:
        return False
    return True


@app.get("/admin/crawler/status")
def crawler_status(_: User = Depends(require_admin)) -> dict:
    """Status do crawler de catálogo (scripts/catalog_crawler.py) — roda como
    processo separado no host, não dentro do backend, então lemos o estado dele
    via arquivos (status.json escrito a cada produto, checkpoint.json a cada página)."""
    categories_payload = _read_json_safe(_CRAWLER_CATEGORIES_FILE) or {}
    categories = categories_payload.get("categories", [])
    checkpoint = _read_json_safe(_CRAWLER_CHECKPOINT_FILE) or {"category_index": 0, "page": 1, "seen_titles": []}
    status_payload = _read_json_safe(_CRAWLER_STATUS_FILE) or {}

    total_categories = len(categories)
    category_index = status_payload.get("category_index", checkpoint.get("category_index", 0))
    current_page = status_payload.get("current_page", checkpoint.get("page", 1))
    completed_categories = max(0, min(category_index, total_categories))

    is_alive = _crawler_process_alive(status_payload.get("pid"))
    stale = False
    if is_alive and status_payload.get("updated_at"):
        try:
            updated = datetime.fromisoformat(status_payload["updated_at"])
            stale = (datetime.now(timezone.utc) - updated) > timedelta(minutes=3)
        except ValueError:
            stale = True
    running = is_alive and not stale and status_payload.get("state") == "running"

    departments: dict[str, dict] = {}
    for idx, cat in enumerate(categories):
        dep = cat.get("department") or "—"
        d = departments.setdefault(dep, {"total": 0, "done": 0})
        d["total"] += 1
        if idx < category_index:
            d["done"] += 1
    department_list = [{"name": name, "done": d["done"], "total": d["total"]} for name, d in departments.items()]

    current_category = status_payload.get("current_category")
    if not current_category and 0 <= category_index < total_categories:
        cat = categories[category_index]
        current_category = {"department": cat.get("department"), "group": cat.get("group"), "name": cat.get("name"), "url": cat.get("url")}

    log_tail: list[str] = []
    if _CRAWLER_LOG_FILE.exists():
        try:
            with _CRAWLER_LOG_FILE.open("r", errors="replace") as f:
                log_tail = [line.rstrip("\n") for line in f.readlines()[-40:]]
        except OSError:
            pass

    return {
        "running": running,
        "state": status_payload.get("state", "idle"),
        "pid": status_payload.get("pid"),
        "started_at": status_payload.get("started_at"),
        "updated_at": status_payload.get("updated_at"),
        "error": status_payload.get("error"),
        "total_categories": total_categories,
        "completed_categories": completed_categories,
        "current_category": current_category,
        "current_page": current_page,
        "current_product": status_payload.get("current_product"),
        "blocking_streak": status_payload.get("blocking_streak", 0),
        "blocked_warning": status_payload.get("blocked_warning", False),
        "products_mapped": status_payload.get("products_mapped", len(checkpoint.get("seen_titles", []))),
        "offers_this_run": status_payload.get("offers_this_run", 0),
        "departments": department_list,
        "log_tail": log_tail,
        "stop_requested": _CRAWLER_STOP_FLAG.exists(),
    }


@app.post("/admin/crawler/start")
def crawler_start(_: User = Depends(require_admin)) -> dict:
    status_payload = _read_json_safe(_CRAWLER_STATUS_FILE) or {}
    if status_payload.get("state") == "running" and _crawler_process_alive(status_payload.get("pid")):
        return {"status": "already_running", "pid": status_payload.get("pid")}

    _CRAWLER_STATE_DIR.mkdir(parents=True, exist_ok=True)
    _CRAWLER_STOP_FLAG.unlink(missing_ok=True)
    out_log = open(_CRAWLER_STATE_DIR / "crawler.out.log", "a")
    proc = subprocess.Popen(
        [sys.executable, str(_CRAWLER_SCRIPT)],
        cwd=str(_REPO_ROOT / "backend"),
        stdout=out_log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    return {"status": "started", "pid": proc.pid}


@app.post("/admin/crawler/stop")
def crawler_stop(_: User = Depends(require_admin)) -> dict:
    """Pede uma parada graciosa — o crawler salva o checkpoint no próximo produto
    e encerra sozinho (não faz kill, pra não perder progresso não salvo)."""
    _CRAWLER_STATE_DIR.mkdir(parents=True, exist_ok=True)
    _CRAWLER_STOP_FLAG.write_text(datetime.now(timezone.utc).isoformat())
    return {"status": "stop_requested"}


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
    _delete_user_data(db, user)
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


_RAW_FETCH_MAX = 100_000  # chars

@app.get("/admin/raw-fetch", response_model=AdminRawFetchResponse)
def admin_raw_fetch(
    adapter_id: str = Query(min_length=1),
    q: str = Query(min_length=1, max_length=200),
    _: User = Depends(require_admin),
) -> AdminRawFetchResponse:
    """Return the raw HTTP response from an adapter's search URL for debugging."""
    adapter = next((a for a in get_adapters() if a.source_id == adapter_id), None)
    if adapter is None:
        raise HTTPException(status_code=404, detail=f"adapter '{adapter_id}' not found")
    try:
        url, content = adapter.fetch_raw(q)
    except NotImplementedError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"fetch failed: {exc}")

    truncated = len(content) > _RAW_FETCH_MAX
    return AdminRawFetchResponse(
        adapter_id=adapter_id,
        query=q,
        url=url,
        content_length=len(content),
        truncated=truncated,
        content=content[:_RAW_FETCH_MAX],
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


def _cart_item_product_key(item: UserCartItem) -> str | None:
    """product_key of a cart item, derived by the SAME grouper the search uses
    (matcher.group_offers) rather than an ad-hoc keyword match — otherwise a coupon
    restricted to one product would happily attach itself to the wrong cart item."""
    offer = OfferModel(
        offer_id=str(item.id),
        source=item.source,
        country=item.country,
        store=item.store_name,
        title=item.title,
        price=PriceModel(
            amount=item.price_amount,
            currency=item.price_currency,
            amount_brl=item.price_amount,
            fx_rate_used=1.0,
        ),
        url=item.offer_url,
        captured_at=item.added_at,
    )
    groups, _misses = group_offers(item.title, [offer])
    return groups[0][0] if groups else None


@app.get("/cart/coupons", response_model=list[CartCouponItem])
def get_cart_coupons(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CartCouponItem]:
    """Coupons that apply to what's actually in this user's cart — the buyer-facing half
    of the seller coupon feature (sellers create them under /seller/coupons). Redemption
    is in the physical store: the site never applies a discount, it just hands over the
    code so the shopper can show it at the counter."""
    items = (
        db.query(UserCartItem)
        .filter(UserCartItem.user_id == current_user.id)
        .order_by(UserCartItem.store_name, UserCartItem.added_at.desc())
        .all()
    )
    if not items:
        return []

    seller_for_store = _sellers_by_store_name(db, {i.store_name for i in items})
    if not seller_for_store:
        return []

    matched_seller_ids = {s.id for matches in seller_for_store.values() for s in matches}
    coupons_by_seller: dict[int, list[SellerCoupon]] = {}
    for c in db.query(SellerCoupon).filter(
        SellerCoupon.seller_profile_id.in_(matched_seller_ids),
        SellerCoupon.active == True,  # noqa: E712
    ).all():
        coupons_by_seller.setdefault(c.seller_profile_id, []).append(c)
    if not coupons_by_seller:
        return []

    out: list[CartCouponItem] = []
    seen: set[tuple[str, str]] = set()
    for item in items:
        sellers = seller_for_store.get(item.store_name.lower(), [])
        if not sellers:
            continue
        # Only paid for when a product-scoped coupon is actually in play.
        product_key: str | None = None
        product_key_resolved = False
        store_info = _enrich_cart_item(item, db).store
        for seller in sellers:
            for c in coupons_by_seller.get(seller.id, []):
                if c.product_key is not None:
                    if not product_key_resolved:
                        product_key = _cart_item_product_key(item)
                        product_key_resolved = True
                    if c.product_key != product_key:
                        continue
                dedup = (c.code, item.store_name)
                if dedup in seen:
                    continue
                seen.add(dedup)
                out.append(CartCouponItem(
                    code=c.code,
                    type=c.type,
                    value=c.value,
                    scope="product" if c.product_key else "store",
                    store_name=item.store_name,
                    store=store_info,
                    product_title=item.title,
                ))
    return out


# ── Favorites ────────────────────────────────────────────────────────────────
# Anonymous favoriting stays entirely client-side (localStorage) — these endpoints only
# serve logged-in users, so their favorites sync across devices instead of being stuck
# in one browser's storage.

def _enrich_favorite(item: UserFavorite, db: Session) -> FavoriteResponse:
    store_info = None
    if item.store_id:
        s = db.get(Store, item.store_id)
        if s:
            store_info = StoreInfo.model_validate(s)
    else:
        s = _find_store_match(db, item.store_name, item.country)
        if s:
            item.store_id = s.id
            try:
                db.commit()
            except Exception:
                db.rollback()
            store_info = StoreInfo.model_validate(s)
    return FavoriteResponse(
        id=item.id,
        offer_url=item.offer_url,
        source=item.source,
        country=item.country,
        store_name=item.store_name,
        title=item.title,
        price_amount=item.price_amount,
        price_currency=item.price_currency,
        price_amount_brl=item.price_amount_brl,
        image_url=item.image_url,
        store_id=item.store_id,
        store=store_info,
        added_at=item.added_at,
    )


@app.get("/favorites", response_model=list[FavoriteResponse])
def get_favorites(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[FavoriteResponse]:
    items = (
        db.query(UserFavorite)
        .filter(UserFavorite.user_id == current_user.id)
        .order_by(UserFavorite.added_at.desc())
        .all()
    )
    return [_enrich_favorite(item, db) for item in items]


@app.post("/favorites", response_model=FavoriteResponse, status_code=status.HTTP_201_CREATED)
def add_favorite(
    body: FavoriteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FavoriteResponse:
    existing = (
        db.query(UserFavorite)
        .filter(UserFavorite.user_id == current_user.id, UserFavorite.offer_url == body.offer_url)
        .first()
    )
    if existing:
        return _enrich_favorite(existing, db)

    store = _find_store_match(db, body.store_name, body.country)
    item = UserFavorite(
        user_id=current_user.id,
        offer_url=body.offer_url,
        source=body.source,
        country=body.country,
        store_name=body.store_name,
        title=body.title,
        price_amount=body.price_amount,
        price_currency=body.price_currency,
        price_amount_brl=body.price_amount_brl,
        image_url=body.image_url,
        store_id=store.id if store else None,
        added_at=datetime.now(timezone.utc),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _enrich_favorite(item, db)


@app.delete("/favorites/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_favorite(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    item = (
        db.query(UserFavorite)
        .filter(UserFavorite.id == item_id, UserFavorite.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Favorite not found")
    db.delete(item)
    db.commit()


# ── Seller / Lojista ─────────────────────────────────────────────────────────
# Real backend behind /lojista: a self-declared SellerProfile (no verification gate —
# is_verified exists for a future flow), gated on plan_tier (admin-set for now, real
# billing is backend Phase 3). Highlights/coupons only ever target products the seller
# is confirmed to currently sell (matched against live ProductOffer rows), so nothing
# here can be faked into affecting search results for products they don't actually carry.

_HIGHLIGHT_UNLOCK_COST = {"diario": 4.90, "semana": 19.90, "programado": 19.90}
_HIGHLIGHT_DAYS = {"diario": 1, "semana": 7}


def _highlight_status(row: SellerProductHighlight, today: date) -> str:
    if row.cooldown_until:
        return "cooldown" if row.cooldown_until >= today else "available"
    return "active" if row.end_date >= today else "available"


def _load_seller_offers(db: Session, store_name: str, now: datetime) -> list[OfferModel]:
    rows = (
        db.query(ProductOffer)
        .filter(ProductOffer.expires_at > now, ProductOffer.store.ilike(f"%{store_name}%"))
        .all()
    )
    return [
        OfferModel(
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
        )
        for row in rows
    ]


@app.post("/seller/profile", response_model=SellerProfileResponse, status_code=status.HTTP_201_CREATED)
def create_seller_profile(
    body: SellerProfileCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SellerProfileResponse:
    existing = db.query(SellerProfile).filter(SellerProfile.user_id == current_user.id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Você já tem um perfil de lojista.")
    profile = SellerProfile(
        user_id=current_user.id,
        store_name=body.store_name.strip(),
        created_at=datetime.now(timezone.utc),
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@app.get("/seller/profile", response_model=SellerProfileResponse)
def get_seller_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SellerProfileResponse:
    profile = db.query(SellerProfile).filter(SellerProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Nenhum perfil de lojista encontrado.")
    return profile


@app.get("/seller/store-suggestions", response_model=list[str])
def seller_store_suggestions(
    q: str = Query("", max_length=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[str]:
    """Autocomplete over store names that actually appear in live scraped data — helps
    sellers pick a name their real offers will match, instead of typing freely and
    getting zero results back from GET /seller/offers."""
    now = datetime.now(timezone.utc)
    query = db.query(ProductOffer.store).filter(ProductOffer.expires_at > now).distinct()
    if q:
        query = query.filter(ProductOffer.store.ilike(f"%{q}%"))
    return [row[0] for row in query.limit(10).all()]


@app.get("/seller/offers", response_model=list[SellerOfferGroup])
def get_seller_offers(
    profile: SellerProfile = Depends(require_seller_plan),
    db: Session = Depends(get_db),
) -> list[SellerOfferGroup]:
    now = datetime.now(timezone.utc)
    offers = _load_seller_offers(db, profile.store_name, now)
    grouped, _ = group_offers("", offers)
    result = []
    for product_key, family_key, canonical_name, confidence, group_offers_list, concentration, volume_ml, voltage in grouped:
        cheapest = min(group_offers_list, key=lambda o: o.price.amount_brl)
        result.append(SellerOfferGroup(
            product_key=product_key,
            canonical_name=canonical_name,
            price_amount=cheapest.price.amount,
            price_currency=cheapest.price.currency,
        ))
    return result


@app.get("/seller/highlights", response_model=list[SellerHighlightResponse])
def list_seller_highlights(
    profile: SellerProfile = Depends(require_seller_plan),
    db: Session = Depends(get_db),
) -> list[SellerHighlightResponse]:
    return (
        db.query(SellerProductHighlight)
        .filter(SellerProductHighlight.seller_profile_id == profile.id)
        .all()
    )


@app.post("/seller/highlights", response_model=SellerHighlightResponse, status_code=status.HTTP_201_CREATED)
def create_seller_highlight(
    body: SellerHighlightCreate,
    profile: SellerProfile = Depends(require_seller_plan),
    db: Session = Depends(get_db),
) -> SellerHighlightResponse:
    today = date.today()
    existing = (
        db.query(SellerProductHighlight)
        .filter(
            SellerProductHighlight.seller_profile_id == profile.id,
            SellerProductHighlight.product_key == body.product_key,
        )
        .first()
    )
    if existing:
        current_status = _highlight_status(existing, today)
        if current_status == "active":
            raise HTTPException(status_code=409, detail="Este produto já está em destaque.")
        if current_status == "cooldown":
            raise HTTPException(status_code=403, detail="Produto em carência — libere o cooldown antes de destacar novamente.")

    if body.duration in ("diario", "semana"):
        start = today
        end = start + timedelta(days=_HIGHLIGHT_DAYS[body.duration])
    else:  # programado
        if not body.start_date or not body.end_date:
            raise HTTPException(status_code=422, detail="Informe data de início e término.")
        start, end = body.start_date, body.end_date
        days = (end - start).days
        if not (0 < days <= 7):
            raise HTTPException(status_code=422, detail="O período deve ser de 1 a 7 dias.")
    cost = _HIGHLIGHT_UNLOCK_COST[body.duration]

    if existing:
        existing.duration = body.duration
        existing.start_date = start
        existing.end_date = end
        existing.cooldown_until = None
        existing.unlock_cost = cost
        row = existing
    else:
        row = SellerProductHighlight(
            seller_profile_id=profile.id,
            product_key=body.product_key,
            duration=body.duration,
            start_date=start,
            end_date=end,
            cooldown_until=None,
            unlock_cost=cost,
            created_at=datetime.now(timezone.utc),
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


@app.delete("/seller/highlights/{highlight_id}", response_model=SellerHighlightResponse)
def remove_seller_highlight(
    highlight_id: int,
    profile: SellerProfile = Depends(require_seller_plan),
    db: Session = Depends(get_db),
) -> SellerHighlightResponse:
    """Not a hard delete — the highlight row transitions into its cooldown period
    (same length as the highlight that just ended), matching the pre-existing frontend
    fixture's exact business rule, now enforced server-side."""
    row = (
        db.query(SellerProductHighlight)
        .filter(SellerProductHighlight.id == highlight_id, SellerProductHighlight.seller_profile_id == profile.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Destaque não encontrado.")
    today = date.today()
    is_daily = row.duration == "diario"
    row.cooldown_until = today + timedelta(days=1 if is_daily else 7)
    row.unlock_cost = 4.90 if is_daily else 19.90
    db.commit()
    db.refresh(row)
    return row


@app.post("/seller/highlights/{highlight_id}/unlock", response_model=SellerHighlightResponse)
def unlock_seller_highlight(
    highlight_id: int,
    profile: SellerProfile = Depends(require_seller_plan),
    db: Session = Depends(get_db),
) -> SellerHighlightResponse:
    row = (
        db.query(SellerProductHighlight)
        .filter(SellerProductHighlight.id == highlight_id, SellerProductHighlight.seller_profile_id == profile.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Destaque não encontrado.")
    if not row.cooldown_until:
        raise HTTPException(status_code=400, detail="Este produto não está em carência.")
    # No real payment gateway yet (backend Phase 3) — clears the cooldown directly,
    # same "simulated payment" the frontend fixture already did, just server-side now.
    row.cooldown_until = None
    db.commit()
    db.refresh(row)
    return row


@app.get("/seller/coupons", response_model=list[SellerCouponResponse])
def list_seller_coupons(
    profile: SellerProfile = Depends(require_seller_plan),
    db: Session = Depends(get_db),
) -> list[SellerCouponResponse]:
    return (
        db.query(SellerCoupon)
        .filter(SellerCoupon.seller_profile_id == profile.id)
        .order_by(SellerCoupon.created_at.desc())
        .all()
    )


@app.post("/seller/coupons", response_model=SellerCouponResponse, status_code=status.HTTP_201_CREATED)
def create_seller_coupon(
    body: SellerCouponCreate,
    profile: SellerProfile = Depends(require_seller_plan),
    db: Session = Depends(get_db),
) -> SellerCouponResponse:
    code = body.code.strip().upper()
    existing = (
        db.query(SellerCoupon)
        .filter(SellerCoupon.seller_profile_id == profile.id, SellerCoupon.code == code)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Você já tem um cupom com esse código.")
    coupon = SellerCoupon(
        seller_profile_id=profile.id,
        code=code,
        type=body.type,
        value=body.value,
        product_key=body.product_key,
        active=True,
        created_at=datetime.now(timezone.utc),
    )
    db.add(coupon)
    db.commit()
    db.refresh(coupon)
    return coupon


@app.delete("/seller/coupons/{coupon_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_seller_coupon(
    coupon_id: int,
    profile: SellerProfile = Depends(require_seller_plan),
    db: Session = Depends(get_db),
) -> None:
    coupon = (
        db.query(SellerCoupon)
        .filter(SellerCoupon.id == coupon_id, SellerCoupon.seller_profile_id == profile.id)
        .first()
    )
    if not coupon:
        raise HTTPException(status_code=404, detail="Cupom não encontrado.")
    db.delete(coupon)
    db.commit()


@app.get("/seller/banners", response_model=list[SellerBannerResponse])
def list_seller_banners(
    profile: SellerProfile = Depends(require_seller_plan),
    db: Session = Depends(get_db),
) -> list[SellerBannerResponse]:
    return (
        db.query(SellerBannerCampaign)
        .filter(SellerBannerCampaign.seller_profile_id == profile.id)
        .order_by(SellerBannerCampaign.created_at.desc())
        .all()
    )


@app.post("/seller/banners", response_model=SellerBannerResponse, status_code=status.HTTP_201_CREATED)
def create_seller_banner(
    body: SellerBannerCreate,
    profile: SellerProfile = Depends(require_seller_plan),
    db: Session = Depends(get_db),
) -> SellerBannerResponse:
    banner = SellerBannerCampaign(
        seller_profile_id=profile.id,
        title=body.title.strip(),
        start_date=body.start_date,
        end_date=body.end_date,
        created_at=datetime.now(timezone.utc),
    )
    db.add(banner)
    db.commit()
    db.refresh(banner)
    return banner


@app.delete("/seller/banners/{banner_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_seller_banner(
    banner_id: int,
    profile: SellerProfile = Depends(require_seller_plan),
    db: Session = Depends(get_db),
) -> None:
    banner = (
        db.query(SellerBannerCampaign)
        .filter(SellerBannerCampaign.id == banner_id, SellerBannerCampaign.seller_profile_id == profile.id)
        .first()
    )
    if not banner:
        raise HTTPException(status_code=404, detail="Campanha não encontrada.")
    db.delete(banner)
    db.commit()


@app.get("/seller/metrics", response_model=SellerMetrics)
def get_seller_metrics(
    profile: SellerProfile = Depends(require_seller_plan),
    db: Session = Depends(get_db),
) -> SellerMetrics:
    """Real signals, not the fixture's fabricated views/purchase-intent formula — counts
    of live offers, real Favorites (backend Phase 1) and Cart adds matching this store."""
    now = datetime.now(timezone.utc)
    today = date.today()
    pattern = f"%{profile.store_name}%"
    active_offers = (
        db.query(ProductOffer)
        .filter(ProductOffer.expires_at > now, ProductOffer.store.ilike(pattern))
        .count()
    )
    favorites_count = db.query(UserFavorite).filter(UserFavorite.store_name.ilike(pattern)).count()
    cart_adds_count = db.query(UserCartItem).filter(UserCartItem.store_name.ilike(pattern)).count()
    active_highlights = (
        db.query(SellerProductHighlight)
        .filter(
            SellerProductHighlight.seller_profile_id == profile.id,
            SellerProductHighlight.cooldown_until.is_(None),
            SellerProductHighlight.end_date >= today,
        )
        .count()
    )
    return SellerMetrics(
        active_offers=active_offers,
        favorites_count=favorites_count,
        cart_adds_count=cart_adds_count,
        active_highlights=active_highlights,
    )


@app.get("/admin/sellers", response_model=list[SellerProfileAdminView])
def admin_list_sellers(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[SellerProfileAdminView]:
    rows = db.query(SellerProfile).order_by(SellerProfile.created_at.desc()).all()
    result = []
    for row in rows:
        seller_user = db.get(User, row.user_id)
        result.append(SellerProfileAdminView(
            id=row.id,
            store_name=row.store_name,
            store_id=row.store_id,
            is_verified=row.is_verified,
            plan_tier=row.plan_tier,
            plan_expires_at=row.plan_expires_at,
            created_at=row.created_at,
            user_id=row.user_id,
            user_email=seller_user.email if seller_user else "?",
            user_username=seller_user.username if seller_user else None,
        ))
    return result


@app.patch("/admin/sellers/{seller_id}", response_model=SellerProfileResponse)
def admin_update_seller(
    seller_id: int,
    body: SellerProfileAdminUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> SellerProfileResponse:
    profile = db.get(SellerProfile, seller_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Seller profile not found")
    if body.plan_tier is not None:
        profile.plan_tier = body.plan_tier
    if body.is_verified is not None:
        profile.is_verified = body.is_verified
    if body.plan_expires_at is not None:
        profile.plan_expires_at = body.plan_expires_at
    db.commit()
    db.refresh(profile)
    return profile


# ── Billing (Mercado Pago) ──────────────────────────────────────────────────
# Backend Phase 3 — real seller subscriptions. Disabled (503) until MP_ACCESS_TOKEN is
# set in .env — see config.py. No card data ever touches this server; delegated 100%
# to Mercado Pago's own hosted checkout. Until this is configured (or for a seller who
# hasn't subscribed), the Phase 2 admin-manual plan_tier grant via /admin/sellers keeps
# working exactly as before — this doesn't replace it, just automates it going forward.

_MP_API = "https://api.mercadopago.com"
_PLAN_PRICES_BRL = {"visibilidade": 99.0, "destaque_pro": 249.0, "dominio_total": 499.0}


def _mp_enabled() -> bool:
    return bool(settings.mp_access_token)


def _require_mp_configured() -> None:
    if not _mp_enabled():
        raise HTTPException(status_code=503, detail="Pagamentos ainda não configurados neste servidor.")


def _verify_mp_signature(x_signature: str | None, x_request_id: str | None, data_id: str) -> bool:
    """Verifies Mercado Pago's HMAC-SHA256 webhook signature. Manifest format and header
    parsing per MP's documented scheme — required so a forged POST to this public
    endpoint can't grant a free plan. Returns False (reject) on any missing piece."""
    if not settings.mp_webhook_secret or not x_signature or not x_request_id or not data_id:
        return False
    parts: dict[str, str] = {}
    for kv in x_signature.split(","):
        if "=" in kv:
            k, v = kv.split("=", 1)
            parts[k.strip()] = v.strip()
    ts, v1 = parts.get("ts"), parts.get("v1")
    if not ts or not v1:
        return False
    manifest = f"id:{data_id.lower()};request-id:{x_request_id};ts:{ts};"
    expected = hmac.new(settings.mp_webhook_secret.encode(), manifest.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, v1)


@app.get("/billing/status", response_model=BillingStatusResponse)
def billing_status() -> BillingStatusResponse:
    """Public — lets the frontend decide upfront whether to offer real checkout or fall
    back to the lead-capture flow, instead of optimistically trying and swapping UI on 503."""
    return BillingStatusResponse(enabled=_mp_enabled())


@app.post("/billing/subscribe", response_model=BillingSubscribeResponse)
def billing_subscribe(
    body: BillingSubscribeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BillingSubscribeResponse:
    _require_mp_configured()
    profile = db.query(SellerProfile).filter(SellerProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Crie um perfil de lojista primeiro.")

    payload = {
        "reason": f"MuambaRADAR — Plano {body.plan_tier}",
        "external_reference": f"{profile.id}:{body.plan_tier}",
        "payer_email": current_user.email,
        "auto_recurring": {
            "frequency": 1,
            "frequency_type": "months",
            "transaction_amount": _PLAN_PRICES_BRL[body.plan_tier],
            "currency_id": "BRL",
        },
        "back_url": "https://muambaradar.com/lojista",
        "status": "pending",
    }
    try:
        resp = requests.post(
            f"{_MP_API}/preapproval",
            headers={"Authorization": f"Bearer {settings.mp_access_token}"},
            json=payload,
            timeout=15,
        )
    except requests.RequestException as exc:
        log.warning("MP subscribe request failed: %s", exc)
        raise HTTPException(status_code=502, detail="Erro ao conectar com o Mercado Pago.")
    if not resp.ok:
        log.warning("MP subscribe rejected: %s %s", resp.status_code, resp.text[:300])
        raise HTTPException(status_code=502, detail="Erro ao criar assinatura no Mercado Pago.")

    data = resp.json()
    profile.subscription_id = data["id"]
    profile.subscription_status = "pending"
    db.commit()
    return BillingSubscribeResponse(checkout_url=data["init_point"])


@app.get("/billing/subscription", response_model=BillingSubscriptionStatus)
def billing_subscription_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BillingSubscriptionStatus:
    profile = db.query(SellerProfile).filter(SellerProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Nenhum perfil de lojista encontrado.")
    return BillingSubscriptionStatus(
        plan_tier=profile.plan_tier,
        subscription_status=profile.subscription_status,
        plan_expires_at=profile.plan_expires_at,
    )


@app.post("/billing/cancel", response_model=BillingSubscriptionStatus)
def billing_cancel(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BillingSubscriptionStatus:
    _require_mp_configured()
    profile = db.query(SellerProfile).filter(SellerProfile.user_id == current_user.id).first()
    if not profile or not profile.subscription_id:
        raise HTTPException(status_code=404, detail="Nenhuma assinatura ativa encontrada.")
    try:
        resp = requests.put(
            f"{_MP_API}/preapproval/{profile.subscription_id}",
            headers={"Authorization": f"Bearer {settings.mp_access_token}"},
            json={"status": "cancelled"},
            timeout=15,
        )
    except requests.RequestException as exc:
        log.warning("MP cancel request failed: %s", exc)
        raise HTTPException(status_code=502, detail="Erro ao conectar com o Mercado Pago.")
    if not resp.ok:
        log.warning("MP cancel rejected: %s %s", resp.status_code, resp.text[:300])
        raise HTTPException(status_code=502, detail="Erro ao cancelar assinatura no Mercado Pago.")
    profile.subscription_status = "cancelled"
    profile.plan_tier = "none"
    db.commit()
    return BillingSubscriptionStatus(
        plan_tier=profile.plan_tier,
        subscription_status=profile.subscription_status,
        plan_expires_at=profile.plan_expires_at,
    )


@app.post("/billing/webhook")
async def billing_webhook(
    request: Request,
    x_signature: str | None = Header(default=None),
    x_request_id: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    if not _mp_enabled():
        raise HTTPException(status_code=503, detail="Pagamentos ainda não configurados neste servidor.")

    body = await request.json()
    data_id = str((body.get("data") or {}).get("id") or request.query_params.get("data.id") or "")
    if not _verify_mp_signature(x_signature, x_request_id, data_id):
        log.warning("MP webhook: assinatura ausente ou inválida — descartado")
        raise HTTPException(status_code=401, detail="Invalid signature")

    topic = body.get("type") or request.query_params.get("type")
    if topic not in ("subscription_preapproval", "preapproval"):
        return {"ok": True}  # unrelated event type — ack and ignore

    try:
        resp = requests.get(
            f"{_MP_API}/preapproval/{data_id}",
            headers={"Authorization": f"Bearer {settings.mp_access_token}"},
            timeout=15,
        )
    except requests.RequestException as exc:
        log.warning("MP webhook: falha ao consultar preapproval %s: %s", data_id, exc)
        raise HTTPException(status_code=502, detail="Erro ao consultar assinatura no Mercado Pago.")
    if not resp.ok:
        log.warning("MP webhook: preapproval %s retornou %s", data_id, resp.status_code)
        raise HTTPException(status_code=502, detail="Erro ao consultar assinatura no Mercado Pago.")

    mp_data = resp.json()
    mp_status = mp_data.get("status")
    external_ref = mp_data.get("external_reference") or ""

    profile = db.query(SellerProfile).filter(SellerProfile.subscription_id == data_id).first()
    if not profile and ":" in external_ref:
        seller_id_str, _, _ = external_ref.partition(":")
        if seller_id_str.isdigit():
            profile = db.get(SellerProfile, int(seller_id_str))
    if not profile:
        log.warning("MP webhook: nenhum SellerProfile para preapproval %s (external_reference=%r)", data_id, external_ref)
        return {"ok": True}

    profile.subscription_status = mp_status
    if mp_status == "authorized":
        _, _, tier = external_ref.partition(":")
        if tier in _PLAN_PRICES_BRL:
            profile.plan_tier = tier
        # Monthly recurrence — small buffer past the next charge date so a slow/missed
        # webhook doesn't lapse access early; require_seller_plan re-checks every request.
        profile.plan_expires_at = datetime.now(timezone.utc) + timedelta(days=32)
    elif mp_status in ("cancelled", "paused"):
        profile.plan_tier = "none"
    db.commit()
    return {"ok": True}


# ── Reports ──────────────────────────────────────────────────────────────────

@app.post("/reports", response_model=ReportResponse, status_code=201)
@limiter.limit("10/minute")
def submit_report(
    request: Request,
    body: ReportCreate,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> ReportResponse:
    report = DataReport(
        user_id=current_user.id if current_user else None,
        report_type=body.report_type,
        product_title=body.product_title,
        offer_url=body.offer_url,
        description=body.description,
        reporter_email=body.reporter_email if not current_user else None,
        snapshot=body.snapshot,
        created_at=datetime.now(timezone.utc),
        resolved=False,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return ReportResponse.model_validate(report)


@app.get("/admin/reports", response_model=list[ReportResponse])
def admin_list_reports(
    resolved: bool | None = Query(default=None),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[ReportResponse]:
    q = db.query(DataReport)
    if resolved is not None:
        q = q.filter(DataReport.resolved == resolved)
    reports = q.order_by(DataReport.created_at.desc()).all()
    return [ReportResponse.model_validate(r) for r in reports]


@app.patch("/admin/reports/{report_id}/resolve", response_model=ReportResponse)
def admin_resolve_report(
    report_id: int,
    body: AdminReportResolve,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ReportResponse:
    report = db.get(DataReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    report.resolved = True
    if body.admin_notes is not None:
        report.admin_notes = body.admin_notes
    db.commit()
    db.refresh(report)
    return ReportResponse.model_validate(report)


# ── Admin: Maps search ────────────────────────────────────────────────────────

class MapsSearchResult(BaseModel):
    name: str
    address: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    google_maps_url: str | None = None
    photo_url: str | None = None
    source: str  # "google" | "nominatim"


def _maps_search_google(q: str) -> MapsSearchResult | None:
    key = settings.google_maps_api_key
    # 1. Text Search to get place_id
    r = requests.get(
        "https://maps.googleapis.com/maps/api/place/textsearch/json",
        params={"query": q, "key": key},
        timeout=6,
    )
    data = r.json()
    results = data.get("results", [])
    if not results:
        return None
    place = results[0]
    place_id = place.get("place_id")
    loc = place.get("geometry", {}).get("location", {})

    # 2. Place Details for address components + maps URL
    details_r = requests.get(
        "https://maps.googleapis.com/maps/api/place/details/json",
        params={"place_id": place_id, "fields": "name,formatted_address,geometry,url,address_components,photos", "key": key},
        timeout=6,
    )
    det = details_r.json().get("result", {})

    # Extract city from address_components
    city = None
    for comp in det.get("address_components", []):
        if "locality" in comp.get("types", []):
            city = comp["long_name"]
            break

    # Photo (first one, via Places Photo API)
    photo_url = None
    photos = det.get("photos", [])
    if photos:
        ref = photos[0].get("photo_reference")
        if ref:
            photo_url = (
                f"https://maps.googleapis.com/maps/api/place/photo"
                f"?maxwidth=800&photo_reference={ref}&key={key}"
            )

    loc2 = det.get("geometry", {}).get("location", loc)
    return MapsSearchResult(
        name=det.get("name") or place.get("name", q),
        address=det.get("formatted_address") or place.get("formatted_address"),
        city=city,
        lat=loc2.get("lat"),
        lng=loc2.get("lng"),
        google_maps_url=det.get("url"),
        photo_url=photo_url,
        source="google",
    )


def _maps_search_nominatim(q: str) -> list[MapsSearchResult]:
    r = requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={"q": q, "format": "json", "limit": 5, "addressdetails": 1},
        headers={"User-Agent": "MuambaRadar/1.0"},
        timeout=6,
    )
    out = []
    for p in r.json():
        addr = p.get("address", {})
        city = addr.get("city") or addr.get("town") or addr.get("municipality")
        osm_id = p.get("osm_id")
        osm_type = p.get("osm_type", "node")
        maps_url = f"https://www.openstreetmap.org/{osm_type}/{osm_id}" if osm_id else None
        out.append(MapsSearchResult(
            name=p.get("display_name", q).split(",")[0],
            address=p.get("display_name"),
            city=city,
            lat=float(p["lat"]),
            lng=float(p["lon"]),
            google_maps_url=maps_url,
            source="nominatim",
        ))
    return out


@app.get("/admin/maps-search", response_model=list[MapsSearchResult])
def admin_maps_search(
    q: str,
    _: User = Depends(require_admin),
) -> list[MapsSearchResult]:
    """Search for a store by name — returns up to 5 candidates from Google Places or Nominatim."""
    query = f"{q} Ciudad del Este Paraguay"
    try:
        if settings.google_maps_api_key:
            g = _maps_search_google(query)
            results = [g] if g else []
        else:
            results = _maps_search_nominatim(query)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Maps search failed: {exc}") from exc

    if not results:
        raise HTTPException(status_code=404, detail="Nenhum resultado encontrado.")
    return results


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
    # Carrinho, favoritos e lojistas só referenciam a loja (store_id é opcional) —
    # solta a referência em vez de deixar a FK barrar o DELETE com 500.
    for model in (UserCartItem, UserFavorite, SellerProfile):
        db.query(model).filter(model.store_id == store_id).update({model.store_id: None})
    db.delete(store)
    db.commit()


@app.post("/admin/stores/{store_id}/photo", response_model=StoreInfo)
async def admin_upload_store_photo(
    store_id: int,
    file: UploadFile = File(...),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> StoreInfo:
    _MAX_PHOTO_BYTES = 5 * 1024 * 1024  # 5 MB

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
    content = await file.read(_MAX_PHOTO_BYTES + 1)
    if len(content) > _MAX_PHOTO_BYTES:
        raise HTTPException(status_code=413, detail="Imagem excede o limite de 5MB.")
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
            # Update photo: always if photo_data provided, otherwise only if store has none
            if item.photo_data or not existing.photo_url:
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
