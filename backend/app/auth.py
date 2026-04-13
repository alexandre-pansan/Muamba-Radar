from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import RefreshToken, User

_REFRESH_TOKEN_EXPIRE_DAYS = 30

_bearer = HTTPBearer(auto_error=False)

ALGORITHM = "HS256"
_PBKDF2_ITERS = 600_000
_HASH_NAME = "sha256"


def hash_password(plain: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac(_HASH_NAME, plain.encode(), salt, _PBKDF2_ITERS)
    return (
        f"pbkdf2:{_HASH_NAME}:{_PBKDF2_ITERS}"
        f"${base64.b64encode(salt).decode()}"
        f"${base64.b64encode(dk).decode()}"
    )


def verify_password(plain: str, stored: str) -> bool:
    try:
        params, salt_b64, dk_b64 = stored.split("$")
        _, hash_name, iters_s = params.split(":")
        salt = base64.b64decode(salt_b64)
        dk_stored = base64.b64decode(dk_b64)
        dk = hashlib.pbkdf2_hmac(hash_name, plain.encode(), salt, int(iters_s))
        return hmac.compare_digest(dk, dk_stored)
    except Exception:
        return False


def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire},
        settings.jwt_secret,
        algorithm=ALGORITHM,
    )


def create_refresh_token(user_id: int, db: Session) -> str:
    """Generate an opaque refresh token, store its hash, return the raw token."""
    raw = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    now = datetime.now(timezone.utc)
    db.add(RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=now + timedelta(days=_REFRESH_TOKEN_EXPIRE_DAYS),
        revoked=False,
        created_at=now,
    ))
    db.commit()
    return raw


def verify_refresh_token(raw: str, db: Session) -> RefreshToken:
    """Look up a refresh token by hash; raises 401 if invalid/expired/revoked."""
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    rt = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    now = datetime.now(timezone.utc)
    if not rt or rt.revoked or rt.expires_at.replace(tzinfo=timezone.utc) < now:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")
    return rt


def revoke_refresh_token(raw: str, db: Session) -> None:
    """Mark a refresh token as revoked (logout)."""
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    rt = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    if rt:
        rt.revoked = True
        db.commit()


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return current_user


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User | None:
    """Like get_current_user but returns None instead of raising on missing/invalid token."""
    if not credentials:
        return None
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        return None
    return db.get(User, user_id)
