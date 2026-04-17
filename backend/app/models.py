from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, SmallInteger, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(Text, nullable=False)
    username: Mapped[str | None] = mapped_column(Text, nullable=True)
    name: Mapped[str | None] = mapped_column(Text, nullable=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("email", name="uq_users_email"),
        UniqueConstraint("username", name="uq_users_username"),
    )


class SearchCache(Base):
    __tablename__ = "search_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    query_raw: Mapped[str] = mapped_column(Text, nullable=False)
    query_norm: Mapped[str] = mapped_column(Text, nullable=False)
    country: Mapped[str] = mapped_column(Text, nullable=False)
    sort: Mapped[str] = mapped_column(Text, nullable=False)
    # result_json kept for backwards compat with old rows; new rows leave it NULL
    result_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    hit_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    __table_args__ = (
        Index("ix_search_cache_lookup", "query_norm", "country", "sort", "expires_at"),
    )


class ProductOffer(Base):
    """One row per scraped listing URL — the live offer catalogue."""
    __tablename__ = "product_offers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    country: Mapped[str] = mapped_column(Text, nullable=False)
    store: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    title_norm: Mapped[str] = mapped_column(Text, nullable=False)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    price_amount: Mapped[float] = mapped_column(Float, nullable=False)
    price_currency: Mapped[str] = mapped_column(Text, nullable=False)
    brand: Mapped[str | None] = mapped_column(Text, nullable=True)
    model: Mapped[str | None] = mapped_column(Text, nullable=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint("url", name="uq_product_offers_url"),
        Index("ix_product_offers_expires", "expires_at"),
        Index("ix_product_offers_country_norm", "country", "title_norm"),
    )


class UserPrefs(Base):
    """One row per user — stores user preferences. Add new pref columns here."""
    __tablename__ = "user_prefs"

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), primary_key=True)
    show_margin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    hide_beta_notice: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    tax_rates: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


class UserSearch(Base):
    """Per-user search history — one row per unique query, updated on repeat."""
    __tablename__ = "user_searches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    query: Mapped[str] = mapped_column(Text, nullable=False)
    searched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("ix_user_searches_user_time", "user_id", "searched_at"),
    )


class AccessLog(Base):
    """HTTP access log — Marco Civil art. 15 exige 6 meses de retenção."""
    __tablename__ = "access_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    method: Mapped[str] = mapped_column(Text, nullable=False)
    path: Mapped[str] = mapped_column(Text, nullable=False)
    status_code: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    ip: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    __table_args__ = (
        Index("ix_access_logs_created_at", "created_at"),
    )


class GlobalConfig(Base):
    """Single-row table for app-wide settings managed by admins."""
    __tablename__ = "global_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    beta_notice_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    beta_notice_title: Mapped[str] = mapped_column(Text, default="🚧 Versão Beta", nullable=False)
    beta_notice_body1: Mapped[str] = mapped_column(Text, default="O <strong>MuambaRadar</strong> está em desenvolvimento ativo. Algumas funcionalidades podem estar incompletas, os preços são obtidos automaticamente e podem conter inconsistências.", nullable=False)
    beta_notice_body2: Mapped[str] = mapped_column(Text, default="Use as informações como referência e sempre confirme o preço final diretamente na loja antes de comprar.", nullable=False)
    donate_goal: Mapped[int] = mapped_column(Integer, default=80, nullable=False)
    donate_raised: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    donate_supporters: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class RefreshToken(Base):
    """Opaque refresh tokens — one active token per session, revocable."""
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("ix_refresh_tokens_user_id", "user_id"),
        Index("ix_refresh_tokens_expires_at", "expires_at"),
    )


class Store(Base):
    """Loja física — endereço e coordenadas para o mapa do carrinho."""
    __tablename__ = "stores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    name_aliases: Mapped[list | None] = mapped_column(JSONB, nullable=True)  # list[str]
    country: Mapped[str] = mapped_column(Text, nullable=False)  # "py" or "br"
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    city: Mapped[str | None] = mapped_column(Text, nullable=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    google_maps_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class UserCartItem(Base):
    """Item salvo no carrinho de compras de um usuário."""
    __tablename__ = "user_cart_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    offer_url: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    country: Mapped[str] = mapped_column(Text, nullable=False)
    store_name: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    price_amount: Mapped[float] = mapped_column(Float, nullable=False)
    price_currency: Mapped[str] = mapped_column(Text, nullable=False)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    store_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("stores.id"), nullable=True)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "offer_url", name="uq_user_cart_items_user_offer"),
        Index("ix_user_cart_items_user_id", "user_id"),
    )


class UnknownProduct(Base):
    """Títulos que não bateram na LUT — alimenta a fila de novos produtos a catalogar."""
    __tablename__ = "unknown_products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title_norm: Mapped[str] = mapped_column(Text, nullable=False)
    query: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False)  # "perfume", "gaming", etc.
    hit_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint("title_norm", "category", name="uq_unknown_products_title_category"),
        Index("ix_unknown_products_category_hits", "category", "hit_count"),
    )
