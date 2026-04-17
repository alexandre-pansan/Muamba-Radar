from __future__ import annotations

import re
from datetime import datetime
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


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str | None = Field(default=None, max_length=255)

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        return _validate_password(v)


class LoginRequest(BaseModel):
    identifier: str  # email or username
    password: str


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


class UpdatePrefsRequest(BaseModel):
    show_margin: bool | None = None
    hide_beta_notice: bool | None = None
    tax_rates: dict | None = None


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
    added_at: datetime


class CartGroupItem(BaseModel):
    store_name: str
    store: StoreInfo | None = None
    items: list[CartItemResponse]


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
