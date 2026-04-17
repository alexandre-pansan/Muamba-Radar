from __future__ import annotations

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

engine = create_engine(
    settings.database_url,
    pool_size=5,          # persistent connections kept open
    max_overflow=10,      # extra connections allowed under load
    pool_timeout=30,      # seconds to wait for a connection before raising
    pool_recycle=1800,    # recycle connections older than 30 min (avoids stale TCP)
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    import app.models  # noqa: F401  — registers models with Base

    # Verify we can actually reach the database before doing anything else.
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:
        db_url_safe = str(settings.database_url).split("@")[-1]  # hide credentials
        raise RuntimeError(
            f"Cannot connect to the database ({db_url_safe}). "
            "Make sure PostgreSQL is running and the database exists.\n"
            f"Original error: {exc}"
        ) from exc

    Base.metadata.create_all(bind=engine)

    # ── Schema migrations (idempotent) ───────────────────────────────────────
    with engine.connect() as conn:
        # Make result_json nullable — old rows keep their data, new rows don't use it
        try:
            conn.execute(text(
                "ALTER TABLE search_cache ALTER COLUMN result_json DROP NOT NULL"
            ))
            conn.commit()
        except Exception:
            conn.rollback()  # column already nullable or table doesn't exist yet

        # Add is_admin column to users
        try:
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE"
            ))
            conn.commit()
        except Exception:
            conn.rollback()

        # Add username column to users
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN username TEXT"))
            conn.commit()
        except Exception:
            conn.rollback()

        # Add unique index on username (ignore if exists)
        try:
            conn.execute(text(
                "CREATE UNIQUE INDEX uq_users_username ON users (username) WHERE username IS NOT NULL"
            ))
            conn.commit()
        except Exception:
            conn.rollback()

        # Account lockout columns
        for col_sql in [
            "ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE users ADD COLUMN locked_until TIMESTAMPTZ",
        ]:
            try:
                conn.execute(text(col_sql))
                conn.commit()
            except Exception:
                conn.rollback()

        # Add tax_rates JSONB column to user_prefs
        try:
            conn.execute(text("ALTER TABLE user_prefs ADD COLUMN tax_rates JSONB"))
            conn.commit()
        except Exception:
            conn.rollback()

        # Add hide_beta_notice column to user_prefs
        try:
            conn.execute(text("ALTER TABLE user_prefs ADD COLUMN hide_beta_notice BOOLEAN NOT NULL DEFAULT FALSE"))
            conn.commit()
        except Exception:
            conn.rollback()

        # Add donation tracking columns to global_config
        for col in [
            "ALTER TABLE global_config ADD COLUMN donate_goal INTEGER NOT NULL DEFAULT 80",
            "ALTER TABLE global_config ADD COLUMN donate_raised INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE global_config ADD COLUMN donate_supporters INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE global_config ADD COLUMN beta_notice_title VARCHAR NOT NULL DEFAULT '🚧 Versão Beta'",
            "ALTER TABLE global_config ADD COLUMN beta_notice_body1 VARCHAR NOT NULL DEFAULT 'O MuambaRadar está em desenvolvimento ativo. Algumas funcionalidades podem estar incompletas, os preços são obtidos automaticamente e podem conter inconsistências.'",
            "ALTER TABLE global_config ADD COLUMN beta_notice_body2 VARCHAR NOT NULL DEFAULT 'Use as informações como referência e sempre confirme o preço final diretamente na loja antes de comprar.'",
        ]:
            try:
                conn.execute(text(col))
                conn.commit()
            except Exception:
                conn.rollback()

        # stores table — new columns if table already existed without them
        for col in [
            "ALTER TABLE stores ADD COLUMN name_aliases JSONB",
            "ALTER TABLE stores ADD COLUMN photo_url TEXT",
            "ALTER TABLE stores ADD COLUMN google_maps_url TEXT",
            "ALTER TABLE stores ADD COLUMN city TEXT",
        ]:
            try:
                conn.execute(text(col))
                conn.commit()
            except Exception:
                conn.rollback()

        # user_cart_items — ensure store_id FK added if table pre-existed
        try:
            conn.execute(text(
                "ALTER TABLE user_cart_items ADD COLUMN store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL"
            ))
            conn.commit()
        except Exception:
            conn.rollback()

    # Seed singleton global_config row
    from app.models import GlobalConfig as _GlobalConfig
    _gc_db = SessionLocal()
    try:
        if not _gc_db.query(_GlobalConfig).first():
            _gc_db.add(_GlobalConfig(id=1, beta_notice_version=1))
            _gc_db.commit()
    finally:
        _gc_db.close()

        # Purge access_logs older than 6 months (Marco Civil max retention = 6 months)
        try:
            conn.execute(text(
                "DELETE FROM access_logs WHERE created_at < NOW() - INTERVAL '6 months'"
            ))
            conn.commit()
        except Exception:
            conn.rollback()  # table may not exist yet on first boot — Base.metadata.create_all handles it

    # ── Seed admin user ───────────────────────────────────────────────────────
    # Credentials are read from ADMIN_EMAIL / ADMIN_PASSWORD env vars.
    # If both are set and no admin exists yet, a first admin account is created.
    # Hardcoded defaults are intentionally absent — set these in .env or secrets manager.
    from datetime import datetime, timezone
    from app.auth import hash_password
    from app.models import User
    _db = SessionLocal()
    try:
        admin_email = settings.admin_email.strip()
        admin_password = settings.admin_password.strip()
        if admin_email and admin_password:
            existing = _db.query(User).filter(User.email == admin_email).first()
            if not existing:
                _db.add(User(
                    email=admin_email,
                    username="admin",
                    name="Admin",
                    password_hash=hash_password(admin_password),
                    is_admin=True,
                    created_at=datetime.now(timezone.utc),
                ))
                _db.commit()
            elif not existing.is_admin:
                existing.is_admin = True
                _db.commit()
    finally:
        _db.close()
