"""Unit tests for backend/app/adapters/comprasparaguai.py (parsing, sem rede)."""
from __future__ import annotations

from bs4 import BeautifulSoup

from app.adapters.comprasparaguai import _is_relevant, _single_store_offer

_SINGLE_STORE_PAGE = """
<html><head>
<script type="application/ld+json">
{"@context": "https://schema.org", "@type": "Product",
 "name": "Celimax Heart Pink Tone Up Sun Cream 40ML na loja ASM Group no Paraguai",
 "image": "https://img/x.webp",
 "offers": {"@type": "Offer", "priceCurrency": "USD", "price": "20.0",
            "availability": "https://schema.org/InStock",
            "seller": {"@type": "Organization", "name": "ASM Group"}}}
</script></head>
<body><div class="header-product-info--title"><h1>Celimax Heart Pink Tone Up Sun Cream 40ML</h1></div></body></html>
"""


def test_single_store_offer_from_json_ld() -> None:
    offer = _single_store_offer(BeautifulSoup(_SINGLE_STORE_PAGE, "html.parser"))
    assert offer == {
        "title": "Celimax Heart Pink Tone Up Sun Cream 40ML",
        "store": "ASM Group",
        "price": 20.0,
        "currency": "USD",
        "image": "https://img/x.webp",
    }


def test_single_store_offer_out_of_stock_is_ignored() -> None:
    page = _SINGLE_STORE_PAGE.replace("InStock", "OutOfStock")
    assert _single_store_offer(BeautifulSoup(page, "html.parser")) is None


def test_storage_in_title_matches_split_query_storage() -> None:
    # "128gb" na busca vira "128 gb"; o título "128GB" tem que casar
    assert _is_relevant("iphone 16 128gb", "Celular Apple iPhone 16 128GB")
