from __future__ import annotations

import base64
import hashlib
import hmac as _hmac

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import Text
from sqlalchemy.types import TypeDecorator


def _encryption_key() -> bytes | None:
    from app.config import settings
    k = settings.field_encryption_key
    return k.encode() if k else None


def _blind_key() -> bytes | None:
    key = _encryption_key()
    if not key:
        return None
    raw = base64.urlsafe_b64decode(key)
    return hashlib.sha256(b"blind-index-v1:" + raw).digest()


def blind_index(value: str | None) -> str | None:
    """HMAC-SHA256 of value (lowercased) for deterministic unique lookups.
    Returns None when encryption is not configured or value is empty."""
    bk = _blind_key()
    if not bk or not value:
        return None
    return _hmac.new(bk, value.lower().encode(), hashlib.sha256).hexdigest()


class EncryptedText(TypeDecorator):
    """Fernet-encrypted TEXT column. Falls back to plaintext when key not set.
    On read, if decryption fails (legacy plaintext row), returns value as-is."""

    impl = Text
    cache_ok = True

    def process_bind_param(self, value: str | None, dialect) -> str | None:
        if value is None:
            return None
        key = _encryption_key()
        if not key:
            return value
        return Fernet(key).encrypt(value.encode()).decode()

    def process_result_value(self, value: str | None, dialect) -> str | None:
        if value is None:
            return None
        key = _encryption_key()
        if not key:
            return value
        try:
            return Fernet(key).decrypt(value.encode()).decode()
        except (InvalidToken, Exception):
            return value  # legacy plaintext row — returned as-is
