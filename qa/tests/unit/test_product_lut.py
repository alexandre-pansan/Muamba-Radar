"""
Unit tests for backend/app/services/product_lut.py — lookup_perfume function.
"""
from __future__ import annotations

import pytest

from app.services.product_lut import lookup_perfume
from app.services.normalization import normalize_text


# ── Helpers ───────────────────────────────────────────────────────────────────

def _lookup(title: str):
    """Normalize title then call lookup_perfume (mirrors matcher.py usage)."""
    return lookup_perfume(normalize_text(title))


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestLookupPerfume:
    def test_dior_sauvage_key_contains_sauvage(self) -> None:
        entry = _lookup("Dior Sauvage EDP 100ml")
        assert entry is not None
        assert "sauvage" in entry.key

    def test_lattafa_khamrah_concentration_is_edp(self) -> None:
        entry = _lookup("Lattafa Khamrah EDP 100ml")
        assert entry is not None
        assert entry.concentration == "EDP"

    def test_al_haramain_amber_oud_brand(self) -> None:
        entry = _lookup("Al Haramain Amber Oud EDP 60ml")
        assert entry is not None
        assert entry.brand == "Al Haramain"

    def test_rasasi_hawas_found(self) -> None:
        entry = _lookup("Rasasi Hawas Pour Homme EDP 100ml")
        assert entry is not None

    def test_cheirosa_62_concentration_is_body_splash(self) -> None:
        entry = _lookup("Sol de Janeiro Cheirosa 62 Body Splash 240ml")
        assert entry is not None
        assert entry.concentration == "Body Splash"

    def test_pure_seduction_concentration_is_body_splash(self) -> None:
        entry = _lookup("Victoria Secret Pure Seduction Body Splash 250ml")
        assert entry is not None
        assert entry.concentration == "Body Splash"

    def test_unknown_product_returns_none(self) -> None:
        entry = _lookup("unknown xyz abc product 12345")
        assert entry is None
