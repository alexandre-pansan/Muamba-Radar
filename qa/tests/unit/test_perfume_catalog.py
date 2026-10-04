"""Unit tests for backend/app/services/perfume_catalog.py — com um catálogo pequeno e
fixo (o arquivo gerado muda a cada crawl)."""
from __future__ import annotations

import json

import pytest

from app.services import perfume_catalog as pc

_CATALOG = {
    "brands": [
        {"name": "Lattafa", "aliases": ["lattafa"], "fragrances": [
            {"name": "Yara"}, {"name": "Yara Tous"}, {"name": "Pride"}, {"name": "Asad"},
        ]},
        {"name": "Christian Dior", "aliases": ["christian dior", "dior"], "fragrances": [
            {"name": "Miss Dior", "aliases": ["miss"]}, {"name": "Sauvage"},
        ]},
    ]
}


@pytest.fixture(autouse=True)
def small_catalog(tmp_path, monkeypatch):
    path = tmp_path / "perfume_catalog.json"
    path.write_text(json.dumps(_CATALOG), encoding="utf-8")
    monkeypatch.setattr(pc, "CATALOG_FILE", path)
    for fn in (pc._load, pc._lut_index, pc.match_perfume):
        fn.cache_clear()
    yield
    for fn in (pc._load, pc._lut_index, pc.match_perfume):
        fn.cache_clear()


def test_longest_fragrance_wins() -> None:
    m = pc.match_perfume("Perfume Lattafa Yara Tous EDP Feminino 100ML")
    assert (m.brand, m.fragrance) == ("Lattafa", "Yara Tous")


def test_rare_name_under_a_line_is_not_swallowed() -> None:
    # "Pride Pisa" não está no catálogo, mas não pode cair no grupo "Pride"
    assert pc.match_perfume("Perfume Lattafa Pride Pisa Eau de Parfum 100ML").fragrance == "Pride Pisa"


def test_noise_after_name_is_ignored() -> None:
    assert pc.match_perfume("Perfume Lattafa Asad Masculino EDP 100ML Original Lattafa 614523").fragrance == "Asad"


def test_brand_word_inside_name_and_alias() -> None:
    assert pc.match_perfume("Perfume Miss Dior Eau de Parfum 100ML").fragrance == "Miss Dior"
    assert pc.match_perfume("Christian Dior Miss Dior Blooming").fragrance.startswith("Miss Dior")


def test_unknown_brand_is_none() -> None:
    assert pc.match_perfume("Perfume Marca Desconhecida Algo 100ML") is None


def test_identify_prefers_more_specific_catalog_name_over_lut() -> None:
    # A LUT tem \\byara\\b (Lattafa Yara); o catálogo sabe que é "Yara Tous"
    assert pc.identify("Perfume Lattafa Yara Tous EDP 100ML").fragrance == "Yara Tous"
    assert pc.identify("Perfume Lattafa Yara EDP 100ML").key == "lattafa_yara"
