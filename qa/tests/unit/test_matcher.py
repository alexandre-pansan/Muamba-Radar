"""
Unit tests for backend/app/services/matcher.py
"""
from __future__ import annotations

from datetime import datetime
from unittest.mock import MagicMock

import pytest

from app.schemas import OfferModel, PriceModel
from app.services.matcher import _is_perfume_offer, _extract_perfume_concentration, group_offers


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

    @pytest.mark.parametrize("title", [
        "Jasmine Body Mist 250ml",
        "Victoria's Secret Splash Love Spell 250ml",
        "Body Mist Feminino Victoria's Secret Amber Romance Brume Parfumée 250ML",
        "Colônia Corporal Victoria's Secret Pure Seduction 250ML",
    ])
    def test_body_mist_splash_brume_are_body_splash(self, title: str) -> None:
        # Body Mist, Splash, Brume e Colônia Corporal são o mesmo produto
        assert _extract_perfume_concentration(title) == "Body Splash"

    @pytest.mark.parametrize("title", [
        "Loção Corporal Victoria's Secret Pure Seduction 236ML",
        "Locion Corporal Victoria S Secret Cactus 236ml",
        "Creme Hidratante Victoria's Secret Bare Vanilla 236ml",
        "Victoria's Secret Fragrance Lotion Love Spell 236ml",
    ])
    def test_lotion_synonyms_are_body_lotion(self, title: str) -> None:
        assert _extract_perfume_concentration(title) == "Body Lotion"

    def test_body_lotion(self) -> None:
        assert _extract_perfume_concentration("Vanilla Body Lotion 250ml") == "Body Lotion"

    def test_extrait(self) -> None:
        assert _extract_perfume_concentration("Extrait de Parfum Oud 50ml") == "Extrait"

    def test_elixir(self) -> None:
        assert _extract_perfume_concentration("Sauvage Elixir 60ml") == "Elixir"

    def test_none_when_unrecognized(self) -> None:
        assert _extract_perfume_concentration("Perfume Generico 100ml") is None


# ── Body splash / lotion grouping ─────────────────────────────────────────────

class TestBodyFormatGrouping:
    def test_splash_without_body_word_is_perfume(self) -> None:
        assert _is_perfume_offer(_make_offer("Victoria S Secret Splash Love Spell 250ml"))

    def test_splash_without_ml_is_not_perfume(self) -> None:
        assert not _is_perfume_offer(_make_offer("Caixa de Som JBL Splash Proof"))

    def test_html_entity_and_synonyms_land_in_one_group(self) -> None:
        titles = [
            "Victoria&#8217;s Secret Splash Pure Seduction 250ML",
            "Body Mist Feminino Victoria's Secret Pure Seduction 250ML",
            "Colônia Corporal Victoria´s Secret Pure Seduction 250ML",
            "Body Splash Victoria's Secret Pure Seduction - 250ML",
        ]
        groups, _ = group_offers("victoria secret", [_make_offer(t) for t in titles])
        assert len(groups) == 1
        assert groups[0][5] == "Body Splash"

    def test_brand_query_splits_by_product_name(self) -> None:
        # Fora da LUT: buscar só a marca não pode juntar fragrâncias diferentes
        titles = [
            "Body Splash Victoria's Secret Electric Mango 250ML",
            "Victoria Secret Body Splash 250ML Electric Mango",
            "Body Splash Victoria's Secret Wild Neroli 250ML",
        ]
        groups, _ = group_offers("victoria secret", [_make_offer(t) for t in titles])
        assert sorted(len(g[4]) for g in groups) == [1, 2]

    def test_lotion_236_and_250_same_group(self) -> None:
        titles = [
            "Loção Corporal Victoria's Secret Love Spell 236ML",
            "Victoria's Secret Body Lotion Love Spell 250ML",
        ]
        groups, _ = group_offers("victoria secret", [_make_offer(t) for t in titles])
        assert len(groups) == 1
