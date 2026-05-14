from __future__ import annotations

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_INSECURE_SECRETS = {"change-me-in-production", "secret", "changeme", ""}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="../.env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    cors_origins: str = "*"
    fx_pyg_per_brl: float = 1428.57
    fx_brl_per_usd: float = 5.0
    database_url: str = "postgresql://postgres:postgres@localhost:5432/mamu"
    cache_ttl_minutes: int = 30
    jwt_secret: str = "change-me-in-production"
    jwt_expire_minutes: int = 30  # short-lived; use refresh token to renew

    @field_validator("jwt_secret")
    @classmethod
    def reject_insecure_secret(cls, v: str) -> str:
        if v.lower() in _INSECURE_SECRETS or len(v) < 32:
            raise ValueError(
                "JWT_SECRET is insecure. Set a random secret of at least 32 chars "
                "(e.g. openssl rand -hex 32)."
            )
        return v

    # Google Places API key (optional). If set, maps-search uses Places API.
    # Without it, falls back to Nominatim (OSM, free, lower coverage for CDE).
    google_maps_api_key: str = ""

    # MercadoLivre API credentials (optional).
    # Register a free app at https://developers.mercadolivre.com.br/
    # and set ML_APP_ID + ML_CLIENT_SECRET in your .env file.
    ml_app_id: str = ""
    ml_client_secret: str = ""

    # Field-level encryption for PII columns (email, name, ip, etc.).
    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # Leave empty to disable encryption (dev only — never leave empty in production).
    field_encryption_key: str = ""

    # Initial admin account — set via env on first boot; ignored if admin already exists.
    # Leave blank to skip auto-seeding (manual setup via DB or future endpoint).
    admin_email: str = ""
    admin_password: str = ""


settings = Settings()
