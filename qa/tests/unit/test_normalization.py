"""
Unit tests for backend/app/services/normalization.py
"""
from __future__ import annotations

import pytest

from app.services.normalization import normalize_text, slugify


class TestNormalizeText:
    def test_removes_accents(self) -> None:
        assert normalize_text("Ação") == "acao"

    def test_lowercases(self) -> None:
        assert normalize_text("XBOX") == "xbox"

    def test_strips_leading_trailing_spaces(self) -> None:
        assert normalize_text("  hello  ") == "hello"

    def test_collapses_multiple_spaces(self) -> None:
        assert normalize_text("hello   world") == "hello world"

    def test_removes_special_characters(self) -> None:
        result = normalize_text("iPhone® 15 Pro!")
        assert "®" not in result
        assert "!" not in result

    def test_empty_string(self) -> None:
        assert normalize_text("") == ""


class TestSlugify:
    def test_no_spaces_in_slug(self) -> None:
        slug = slugify("PlayStation 5 Slim")
        assert " " not in slug

    def test_valid_slug_characters(self) -> None:
        slug = slugify("PlayStation 5 Slim")
        # Should only contain alphanumeric and underscores
        import re
        assert re.match(r'^[a-z0-9_]+$', slug), f"Invalid slug: {slug!r}"

    def test_slug_is_lowercase(self) -> None:
        slug = slugify("PlayStation 5 Slim")
        assert slug == slug.lower()

    def test_empty_string_returns_product(self) -> None:
        assert slugify("") == "product"

    def test_slug_contains_expected_words(self) -> None:
        slug = slugify("PlayStation 5 Slim")
        assert "playstation" in slug
        assert "5" in slug
        assert "slim" in slug


# ── Protetor solar não é acessório ────────────────────────────────────────────

def test_protetor_solar_is_not_an_accessory() -> None:
    from app.services.normalization import matches_query_loose
    assert matches_query_loose("celimax pink", "Protetor Solar Celimax Heart Pink Tone Up Sun Cream SPF 50+ 40ML")


def test_screen_protector_is_still_an_accessory() -> None:
    from app.services.normalization import matches_query_loose
    assert not matches_query_loose("iphone 16", "Protetor de Tela Vidro iPhone 16")


def test_html_entity_is_decoded() -> None:
    from app.services.normalization import normalize_text
    assert normalize_text("Victoria&#8217;s Secret") == "victoria s secret"


# ── Grafias / abreviações de marca ────────────────────────────────────────────

@pytest.mark.parametrize("raw", ["Paco Rabane", "paco rabbane", "PACO RABANNE", "Paco Rabannè"])
def test_paco_rabanne_spellings(raw: str) -> None:
    assert normalize_text(raw) == "paco rabanne"


def test_pr_is_rabanne_only_in_queries() -> None:
    from app.services.normalization import expand_query_aliases
    assert expand_query_aliases("PR Invictus") == "rabanne invictus"
    assert normalize_text("Tênis Casual PR Preto") == "tenis casual pr preto"
