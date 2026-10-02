from __future__ import annotations

import re
from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, EmailStr, Field, field_validator


class CountryFilter(str, Enum):
    ALL = "all"
    PY = "py"
    BR = "br"


class SortOption(str, Enum):
    BEST_MATCH = "best_match"
    LOWEST_PRICE = "lowest_price"


class SourceInfoModel(BaseModel):
    source: str
    country: str
    enabled: bool = True


class RawOfferModel(BaseModel):
    source: str
    country: str
    store: str
    title: str
    url: str
    image_url: str | None = None
    price_amount: float
    price_currency: str
    captured_at: datetime


class PriceModel(BaseModel):
    amount: float
    currency: str
    amount_brl: float
    fx_rate_used: float
    fx_rate_timestamp: datetime | None = None


class OfferModel(BaseModel):
    offer_id: str
    source: str
    country: str
    store: str
    store_info: "StoreInfo | None" = None
    title: str
    brand: str | None = None
    model: str | None = None
    image_url: str | None = None
    price: PriceModel
    url: str
    captured_at: datetime


class CheapestModel(BaseModel):
    overall_offer_id: str | None = None
    py_offer_id: str | None = None
    br_offer_id: str | None = None


class CouponInfo(BaseModel):
    """Public-facing coupon summary attached to a ProductGroupModel — marketing-facing
    by design, carries no seller identity/PII."""
    code: str
    type: str  # percent|usd
    value: float


class ProductGroupModel(BaseModel):
    product_key: str
    family_key: str = ""          # base model without storage/RAM, for UI clustering
    canonical_name: str
    match_confidence: float = Field(ge=0.0, le=1.0)
    product_image_url: str | None = None
    offers: list[OfferModel]
    preview_offers: list[OfferModel] = Field(default_factory=list)
    cheapest: CheapestModel
    # Perfume-specific (None for non-perfume groups)
    concentration: str | None = None   # e.g. "EDP", "EDT", "Elixir"
    volume_ml: str | None = None       # e.g. "100ml"
    # Appliance voltage variant (None for non-appliance groups)
    voltage: str | None = None         # e.g. "127V", "220V", "Bivolt"
    # Seller highlight/coupon enrichment (backend Phase 2) — both intentionally public.
    is_highlighted: bool = False
    coupon: CouponInfo | None = None


class CompareResponseModel(BaseModel):
    query: str
    generated_at: datetime
    groups: list[ProductGroupModel]


class ImageCandidateModel(BaseModel):
    text: str
    confidence: float = Field(ge=0.0, le=1.0)


class DetectImageResponseModel(BaseModel):
    filename: str
    content_type: str
    detected_candidates: list[ImageCandidateModel]
    top_query: str
    generated_at: datetime


class CompareByImageResponseModel(BaseModel):
    detection: DetectImageResponseModel
    comparison: CompareResponseModel


# ── Auth ────────────────────────────────────────────────────────────────────

_PASSWORD_RE = re.compile(
    r'^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};\':"\\|,.<>\/?`~]).{8,}$'
)


def _validate_password(v: str) -> str:
    if not _PASSWORD_RE.match(v):
        raise ValueError(
            "A senha deve ter ao menos 8 caracteres, uma letra maiúscula, um número e um caractere especial."
        )
    return v


_USERNAME_RE = re.compile(r'^[a-zA-Z0-9_\-]+$')


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str | None = Field(default=None, max_length=255)

    @field_validator("username")
    @classmethod
    def username_safe_chars(cls, v: str) -> str:
        if not _USERNAME_RE.match(v):
            raise ValueError("Username pode conter apenas letras, números, _ e -.")
        return v

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        return _validate_password(v)


class LoginRequest(BaseModel):
    identifier: str = Field(max_length=255)
    password: str = Field(max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    email: str
    username: str | None = None
    name: str | None
    is_admin: bool = False
    created_at: datetime


class UpdateProfileRequest(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str | None) -> str | None:
        if v is not None:
            return _validate_password(v)
        return v


class UserPrefsModel(BaseModel):
    show_margin: bool = False
    hide_beta_notice: bool = False
    tax_rates: dict | None = None


def _validate_small_dict(v: dict | None, max_bytes: int = 8192) -> dict | None:
    if v is not None and len(str(v).encode()) > max_bytes:
        raise ValueError(f"Payload excede o limite de {max_bytes} bytes.")
    return v


class UpdatePrefsRequest(BaseModel):
    show_margin: bool | None = None
    hide_beta_notice: bool | None = None
    tax_rates: dict | None = None

    @field_validator("tax_rates")
    @classmethod
    def tax_rates_size(cls, v: dict | None) -> dict | None:
        return _validate_small_dict(v)


class UserSearchItem(BaseModel):
    query: str
    searched_at: datetime


# ── Cart ────────────────────────────────────────────────────────────────────

class CartItemCreate(BaseModel):
    offer_url: str
    source: str
    country: str
    store_name: str
    title: str
    price_amount: float
    price_currency: str
    image_url: str | None = None
    # Oferta BR mais barata do grupo comparado de onde o item veio (opcional).
    br_price_brl: float | None = Field(default=None, gt=0)
    br_store: str | None = Field(default=None, max_length=200)
    br_url: str | None = Field(default=None, max_length=2000)


class StoreInfo(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    name: str
    country: str
    name_aliases: list[str] | None = None
    address: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    photo_url: str | None = None
    google_maps_url: str | None = None


class CartItemResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    offer_url: str
    source: str
    country: str
    store_name: str
    title: str
    price_amount: float
    price_currency: str
    image_url: str | None = None
    store_id: int | None = None
    store: StoreInfo | None = None
    quantity: int = 1
    added_at: datetime
    # Atributos lidos do título (storage, color, ...) — chips no carrinho.
    specs: dict[str, str] = {}
    # Referência BR gravada ao adicionar (ver CartItemCreate). None = sem referência.
    br_price_brl: float | None = None
    br_store: str | None = None
    br_url: str | None = None


class CartQuantityUpdate(BaseModel):
    quantity: int = Field(ge=1, le=99)


class CartGroupItem(BaseModel):
    store_name: str
    store: StoreInfo | None = None
    items: list[CartItemResponse]


class CartCouponItem(BaseModel):
    """Um cupom de lojista que vale para algum item do carrinho do usuário. O resgate é
    presencial na loja física — o site não processa desconto nenhum, só mostra o código."""
    code: str
    type: str  # percent|usd
    value: float
    scope: str  # "product" (cupom de um produto específico) | "store" (vale pra loja toda)
    store_name: str
    store: StoreInfo | None = None
    product_title: str  # item do carrinho que disparou o cupom


# ── Favorites ────────────────────────────────────────────────────────────────

class FavoriteCreate(BaseModel):
    offer_url: str
    source: str
    country: str
    store_name: str
    title: str
    price_amount: float
    price_currency: str
    price_amount_brl: float | None = None
    image_url: str | None = None


class FavoriteResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    offer_url: str
    source: str
    country: str
    store_name: str
    title: str
    price_amount: float
    price_currency: str
    price_amount_brl: float | None = None
    image_url: str | None = None
    store_id: int | None = None
    store: StoreInfo | None = None
    added_at: datetime


# ── Seller / Lojista ─────────────────────────────────────────────────────────

class SellerProfileCreate(BaseModel):
    store_name: str = Field(min_length=1, max_length=200)


class SellerProfileResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    store_name: str
    store_id: int | None = None
    is_verified: bool
    plan_tier: str
    subscription_id: str | None = None
    subscription_status: str | None = None
    plan_expires_at: datetime | None = None
    created_at: datetime


class SellerProfileAdminView(SellerProfileResponse):
    user_id: int
    user_email: str
    user_username: str | None = None


class SellerProfileAdminUpdate(BaseModel):
    plan_tier: str | None = Field(default=None, pattern=r"^(none|visibilidade|destaque_pro|dominio_total)$")
    is_verified: bool | None = None
    plan_expires_at: datetime | None = None


class SellerOfferGroup(BaseModel):
    """A seller's own current live offers, grouped the same way /compare groups results —
    what they can actually highlight, since it's sourced from real scraped inventory."""
    product_key: str
    canonical_name: str
    price_amount: float
    price_currency: str


class SellerCouponCreate(BaseModel):
    code: str = Field(min_length=2, max_length=30)
    type: str = Field(pattern=r"^(percent|usd)$")
    value: float = Field(gt=0)
    product_key: str | None = None


class SellerCouponResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    code: str
    type: str
    value: float
    product_key: str | None = None
    active: bool
    created_at: datetime


class SellerHighlightCreate(BaseModel):
    product_key: str
    duration: str = Field(pattern=r"^(diario|semana|programado)$")
    start_date: date | None = None
    end_date: date | None = None


class SellerHighlightResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    product_key: str
    duration: str
    start_date: date
    end_date: date
    cooldown_until: date | None = None
    unlock_cost: float | None = None
    created_at: datetime


class SellerBannerCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    start_date: date
    end_date: date


class SellerBannerResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    title: str
    start_date: date
    end_date: date
    created_at: datetime


class SellerMetrics(BaseModel):
    active_offers: int
    favorites_count: int
    cart_adds_count: int
    active_highlights: int


# ── Billing (Mercado Pago) ───────────────────────────────────────────────────

class BillingSubscribeRequest(BaseModel):
    plan_tier: str = Field(pattern=r"^(visibilidade|destaque_pro|dominio_total)$")


class BillingSubscribeResponse(BaseModel):
    checkout_url: str


class BillingSubscriptionStatus(BaseModel):
    plan_tier: str
    subscription_status: str | None = None
    plan_expires_at: datetime | None = None


class BillingStatusResponse(BaseModel):
    enabled: bool


# ── Admin Stores ─────────────────────────────────────────────────────────────

class StoreCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    name_aliases: list[str] = []
    country: str = Field(pattern="^(py|br)$")
    address: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    photo_url: str | None = None
    google_maps_url: str | None = None


class StoreImportItem(BaseModel):
    """One store entry from an export JSON. photo_data carries the photo as base64."""
    name: str = Field(min_length=1, max_length=200)
    country: str = "py"
    name_aliases: list[str] = []
    address: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    photo_url: str | None = None   # fallback: kept only if https://
    photo_data: str | None = None  # base64-encoded photo (preferred)
    photo_mime: str | None = None  # e.g. "image/jpeg"
    google_maps_url: str | None = None


class StoreImportResult(BaseModel):
    created: int
    updated: int
    skipped: int


class StoreUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    name_aliases: list[str] | None = None
    country: str | None = Field(default=None, pattern="^(py|br)$")
    address: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    photo_url: str | None = None
    google_maps_url: str | None = None


# ── Admin ────────────────────────────────────────────────────────────────────

class AdminDonateStatsRequest(BaseModel):
    donate_goal:       int | None = Field(default=None, ge=0, le=10_000_000)
    donate_raised:     int | None = Field(default=None, ge=0, le=10_000_000)
    donate_supporters: int | None = Field(default=None, ge=0, le=1_000_000)


class AdminBetaNoticeTextRequest(BaseModel):
    beta_notice_title: str | None = Field(default=None, max_length=200)
    beta_notice_body1: str | None = Field(default=None, max_length=1000)
    beta_notice_body2: str | None = Field(default=None, max_length=1000)


class AdminAdapterResult(BaseModel):
    adapter_id: str
    country: str
    raw_count: int
    filtered_count: int
    raw_offers: list[dict] = []
    error: str | None = None
    timing_ms: float
    sample_offers: list[dict]


class AdminTestSearchRequest(BaseModel):
    query: str
    adapter_ids: list[str] = []  # empty = run all
    raw: bool = False  # if True, skip post-adapter filtering and show all offers


class AdminTestSearchResponse(BaseModel):
    query: str
    total_raw: int
    total_filtered: int
    adapters: list[AdminAdapterResult]


class AdminRawFetchResponse(BaseModel):
    adapter_id: str
    query: str
    url: str
    content_length: int
    truncated: bool
    content: str


# ── Reports ──────────────────────────────────────────────────────────────────

class ReportCreate(BaseModel):
    report_type: str = Field(..., pattern=r'^(wrong_price|wrong_store|missing_info|other)$')
    product_title: str = Field(..., min_length=1, max_length=300)
    offer_url: str | None = Field(default=None, max_length=2000)
    description: str = Field(..., min_length=5, max_length=1000)
    reporter_email: str | None = Field(default=None, max_length=200)
    snapshot: dict | None = None

    @field_validator("snapshot")
    @classmethod
    def snapshot_size(cls, v: dict | None) -> dict | None:
        return _validate_small_dict(v, max_bytes=4096)


class ReportResponse(BaseModel):
    id: int
    user_id: int | None
    report_type: str
    product_title: str
    offer_url: str | None
    description: str
    reporter_email: str | None
    snapshot: dict | None
    created_at: datetime
    resolved: bool
    admin_notes: str | None

    model_config = {"from_attributes": True}


class AdminReportResolve(BaseModel):
    admin_notes: str | None = Field(default=None, max_length=1000)
