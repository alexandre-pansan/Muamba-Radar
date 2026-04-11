from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


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

class RegisterRequest(BaseModel):
    username: str = Field(min_length=3)
    email: str
    password: str = Field(min_length=8)
    name: str | None = None


class LoginRequest(BaseModel):
    identifier: str  # email or username
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    email: str
    username: str | None = None
    name: str | None
    is_admin: bool = False
    created_at: datetime


class UpdateProfileRequest(BaseModel):
    name: str | None = None
    password: str | None = Field(default=None, min_length=8)


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


# ── Admin ────────────────────────────────────────────────────────────────────

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
