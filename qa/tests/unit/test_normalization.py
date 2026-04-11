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
