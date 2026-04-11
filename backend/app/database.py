from __future__ import annotations

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

engine = create_engine(settings.database_url)
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

        # Add tax_rates JSONB column to user_prefs
        try:
            conn.execute(text("ALTER TABLE user_prefs ADD COLUMN tax_rates JSONB"))
            conn.commit()
        except Exception:
            conn.rollback()

        # Purge access_logs older than 6 months (Marco Civil max retention = 6 months)
        try:
            conn.execute(text(
                "DELETE FROM access_logs WHERE created_at < NOW() - INTERVAL '6 months'"
            ))
            conn.commit()
        except Exception:
            conn.rollback()  # table may not exist yet on first boot — Base.metadata.create_all handles it

    # ── Seed admin user ───────────────────────────────────────────────────────
    from datetime import datetime, timezone
    from app.auth import hash_password
    from app.models import User
    _db = SessionLocal()
    try:
        admin = _db.query(User).filter(User.email == "admin@admin.com").first()
        if not admin:
            # also check old seed (email="admin") and update it
            old = _db.query(User).filter(User.email == "admin").first()
            if old:
                old.email = "admin@admin.com"
                old.username = "admin"
                old.is_admin = True
                _db.commit()
            else:
                _db.add(User(
                    email="admin@admin.com",
                    username="admin",
                    name="Admin",
                    password_hash=hash_password("admin"),
                    is_admin=True,
                    created_at=datetime.now(timezone.utc),
                ))
                _db.commit()
        else:
            changed = False
            if not admin.username:
                admin.username = "admin"
                changed = True
            if not admin.is_admin:
                admin.is_admin = True
                changed = True
            if changed:
                _db.commit()
    finally:
        _db.close()
