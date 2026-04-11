"""
Unit tests for backend/app/services/matcher.py
"""
from __future__ import annotations

from datetime import datetime
from unittest.mock import MagicMock

import pytest

from app.schemas import OfferModel, PriceModel
from app.services.matcher import _is_perfume_offer, _extract_perfume_concentration


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_offer(title: str) -> OfferModel:
    """Create a minimal OfferModel stub with just the fields we need."""
    price = PriceModel(
        amount=100.0,
        currency="BRL",
        amount_brl=100.0,
        fx_rate_used=1.0,
        fx_rate_timestamp=datetime(2024, 1, 1),
    )
    return OfferModel(
        offer_id="test-offer-1",
        source="test",
        country="br",
        store="Test Store",
        title=title,
        price=price,
        url="https://example.com/product",
        captured_at=datetime(2024, 1, 1),
    )


# ── Tests for _is_perfume_offer ───────────────────────────────────────────────

class TestIsPerfumeOffer:
    @pytest.mark.parametrize("title", [
        "Perfume Sauvage Dior 100ml",
        "Body Splash Victoria Secret Pure Seduction",
        "Oleo Corporal Sol de Janeiro 200ml",
        "Body Mist 250ml Feminino",
        "Eau de Parfum Chanel N5 100ml",
        "EDP Lattafa Khamrah 100ml",
    ])
    def test_returns_true_for_perfume_titles(self, title: str) -> None:
        offer = _make_offer(title)
        assert _is_perfume_offer(offer) is True

    def test_returns_false_for_non_perfume(self) -> None:
        offer = _make_offer("Playstation 5 1TB")
        assert _is_perfume_offer(offer) is False

    def test_returns_false_for_electronics(self) -> None:
        offer = _make_offer("Xbox Series X 1TB Console")
        assert _is_perfume_offer(offer) is False


# ── Tests for _extract_perfume_concentration ──────────────────────────────────

class TestExtractPerfumeConcentration:
    def test_edp(self) -> None:
        assert _extract_perfume_concentration("Sauvage EDP 100ml") == "EDP"

    def test_edt(self) -> None:
        assert _extract_perfume_concentration("Bleu de Chanel EDT 100ml") == "EDT"

    def test_body_splash(self) -> None:
        assert _extract_perfume_concentration("Pure Seduction Body Splash 250ml") == "Body Splash"

    def test_body_oil(self) -> None:
        assert _extract_perfume_concentration("Oleo Corporal Sol de Janeiro 200ml") == "Body Oil"

    def test_body_mist(self) -> None:
        assert _extract_perfume_concentration("Jasmine Body Mist 250ml") == "Body Mist"

    def test_body_lotion(self) -> None:
        assert _extract_perfume_concentration("Vanilla Body Lotion 250ml") == "Body Lotion"

    def test_extrait(self) -> None:
        assert _extract_perfume_concentration("Extrait de Parfum Oud 50ml") == "Extrait"

    def test_elixir(self) -> None:
        assert _extract_perfume_concentration("Sauvage Elixir 60ml") == "Elixir"

    def test_none_when_unrecognized(self) -> None:
        assert _extract_perfume_concentration("Perfume Generico 100ml") is None
