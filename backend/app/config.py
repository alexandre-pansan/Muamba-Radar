from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


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

    # Initial admin account — set via env on first boot; ignored if admin already exists.
    # Leave blank to skip auto-seeding (manual setup via DB or future endpoint).
    admin_email: str = ""
    admin_password: str = ""


settings = Settings()
