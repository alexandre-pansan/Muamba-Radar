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
    jwt_expire_minutes: int = 10080  # 7 days


settings = Settings()
