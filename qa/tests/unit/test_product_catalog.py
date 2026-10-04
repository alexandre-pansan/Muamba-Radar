"""Unit tests for backend/app/services/product_catalog.py — catálogo pequeno e fixo."""
from __future__ import annotations

import json

import pytest

from app.services import product_catalog as pc

_CATALOG = {
    "brands": [
        {"name": "JBL", "aliases": ["jbl"], "models": [
            {"name": "Flip"}, {"name": "Flip 6"}, {"name": "Flip 7"}, {"name": "Tune"},
            {"name": "Go Essential"}, {"name": "Go"}, {"name": "PartyBox"},
        ]},
        {"name": "Xiaomi", "aliases": ["xiaomi", "redmi", "poco"], "models": [
            {"name": "Redmi Note 15"}, {"name": "Redmi Buds 6"},
        ]},
        {"name": "Logitech", "aliases": ["logitech"], "models": [{"name": "M170"}, {"name": "Mx"}]},
        {"name": "Encore", "aliases": ["encore"], "models": [{"name": "Essential"}]},
    ]
}


@pytest.fixture(autouse=True)
def small_catalog(tmp_path, monkeypatch):
    path = tmp_path / "product_catalog.json"
    path.write_text(json.dumps(_CATALOG), encoding="utf-8")
    monkeypatch.setattr(pc, "CATALOG_FILE", path)
    pc._load.cache_clear()
    pc.match_product.cache_clear()
    yield
    pc._load.cache_clear()
    pc.match_product.cache_clear()


def test_category_color_and_power_are_ignored() -> None:
    a = pc.match_product("Caixa de Som JBL Flip 6 Bluetooth - Branco [branco]")
    b = pc.match_product("JBL Speaker Flip 6 35WATTS RMS Black [black]")
    assert a.key == b.key and a.model == "Flip 6"


def test_number_separates_models() -> None:
    assert pc.match_product("JBL Flip 7 Roxo").key != pc.match_product("JBL Flip 6 Roxo").key


def test_new_number_not_in_catalog_still_separates() -> None:
    # Flip 8 ainda não está no catálogo: "Flip" + "8", nunca junto com outro Flip
    assert pc.match_product("Caixa de Som JBL Flip 8 Preta").model == "Flip 8"


def test_complete_model_ignores_trailing_noise() -> None:
    assert pc.match_product("Speaker JBL Flip 7 35 Watts RMS - Camuflado (CX Feia)").model == "Flip 7"


def test_variant_is_never_merged_with_base() -> None:
    base = pc.match_product("Celular Xiaomi Redmi Note 15 256GB")
    pro = pc.match_product("Celular Xiaomi Redmi Note 15 Pro 256GB")
    assert base.key != pro.key and "Pro" in pro.model


def test_sub_brand_alias_stays_in_model() -> None:
    assert pc.match_product("Fones de Ouvido Xiaomi Mi Redmi Buds 6 M2429E1 Bluetooth").model == "Redmi Buds 6"


def test_part_number_and_codes() -> None:
    assert pc.match_product("Mouse Logitech M170 910-004940 Wireless Preto").model == "M170"


def test_accessory_is_not_a_brand_model() -> None:
    assert pc.match_product("Capa para JBL Flip 6 Silicone") is None


def test_first_brand_in_title_wins() -> None:
    # "Encore" também é marca da lista do CP, mas aqui é modelo da JBL
    assert pc.match_product("Caixa de Som JBL Partybox Encore Essential - Preto").brand == "JBL"
