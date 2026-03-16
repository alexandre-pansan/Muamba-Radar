"""
Buscapé adapter — Brazilian price aggregator.

One search returns offers from many stores (Americanas, Casas Bahia,
Magazine Luiza, Submarino, etc.) already aggregated.

Strategy:
  1. Fetch search page HTML
  2. Try to extract __NEXT_DATA__ JSON (Next.js embed)
  3. Walk every known path structure; if none match, do a deep scan
  4. Fall back to HTML parsing
"""
from __future__ import annotations

import json
import logging
import re
from datetime import UTC, datetime
from typing import Any
from urllib.parse import quote_plus, urlsplit, urlunsplit

import requests
from bs4 import BeautifulSoup

from app.adapters.base import SourceAdapter
from app.schemas import RawOfferModel

log = logging.getLogger("muambaradar.adapters")

_BASE = "https://www.buscape.com.br"
_TIMEOUT = 15

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "pt-BR,pt;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

_STOP_TOKENS = {"de", "da", "do", "e", "com", "para", "pro", "max", "mini", "plus"}


# ── helpers ────────────────────────────────────────────────────────────────────

def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", text.lower())).strip()


def _tokens(query: str) -> list[str]:
    s = re.sub(r"(\d+)\s*(gb|tb)\b", r"\1 \2", _norm(query))
    return [t for t in s.split() if len(t) >= 2 and t not in _STOP_TOKENS]


def _is_relevant(query: str, title: str) -> bool:
    q = _tokens(query)
    if not q:
        return True
    t = set(_norm(title).split())
    if len(q) <= 2:
        required = len(q)          # all tokens must appear for short queries
    else:
        required = max(2, int(len(q) * 0.6 + 0.5))
    hits = sum(1 for tok in q if tok in t)
    return hits >= required


def _parse_brl(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        v = float(value)
        return v if v >= 10 else None
    if isinstance(value, str):
        cleaned = re.sub(r"[^0-9,.]", "", value)
        # PT-BR: dot = thousands sep, comma = decimal
        if "," in cleaned and "." in cleaned and cleaned.rfind(",") > cleaned.rfind("."):
            cleaned = cleaned.replace(".", "").replace(",", ".")
        elif "," in cleaned and "." not in cleaned:
            cleaned = cleaned.replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
        try:
            v = float(cleaned)
            return v if v >= 10 else None
        except ValueError:
            return None
    return None


def _clean_url(href: str) -> str:
    if href.startswith("//"):
        href = "https:" + href
    elif href.startswith("/"):
        href = _BASE + href
    p = urlsplit(href)
    return urlunsplit((p.scheme, p.netloc, p.path, "", ""))


def _dig(obj: Any, *keys: str) -> Any:
    for k in keys:
        if isinstance(obj, dict):
            obj = obj.get(k)
        elif isinstance(obj, list):
            try:
                obj = obj[int(k)]
            except (IndexError, ValueError):
                return None
        else:
            return None
        if obj is None:
            return None
    return obj


def _next_data(soup: BeautifulSoup) -> dict:
    tag = soup.find("script", {"id": "__NEXT_DATA__"})
    if tag and tag.string:
        try:
            return json.loads(tag.string)
        except json.JSONDecodeError:
            pass
    return {}


# ── deep JSON scan ─────────────────────────────────────────────────────────────

def _looks_like_offer(obj: dict) -> bool:
    """Heuristic: does this dict look like a product offer?"""
    has_price = any(
        k in obj for k in ("price", "bestPrice", "minPrice", "lowestPrice", "valor", "preco")
    )
    has_name = any(k in obj for k in ("name", "title", "nome", "productName"))
    return has_price and has_name


def _deep_find_offers(obj: Any, depth: int = 0) -> list[dict]:
    """Recursively find all dicts that look like product offers."""
    if depth > 12:
        return []
    results: list[dict] = []
    if isinstance(obj, dict):
        if _looks_like_offer(obj):
            results.append(obj)
        else:
            for v in obj.values():
                results.extend(_deep_find_offers(v, depth + 1))
    elif isinstance(obj, list):
        for item in obj:
            results.extend(_deep_find_offers(item, depth + 1))
    return results


# ── Next.js product extraction ─────────────────────────────────────────────────

# Known Buscapé / Zoom __NEXT_DATA__ paths (site updates may change these)
_KNOWN_PATHS: list[tuple[str, ...]] = [
    ("props", "pageProps", "products"),
    ("props", "pageProps", "data", "products"),
    ("props", "pageProps", "searchResult", "products"),
    ("props", "pageProps", "initialState", "search", "products"),
    ("props", "pageProps", "pageData", "products"),
    ("props", "pageProps", "data", "search", "products"),
    ("props", "pageProps", "serverData", "products"),
]


def _extract_store(product: dict) -> str:
    """Best-effort store name extraction from a Buscapé product dict."""
    # Buscapé often nests offers/sellers inside the product
    for path in (
        ("offers", "0", "seller", "name"),
        ("offers", "0", "storeName"),
        ("offers", "0", "store", "name"),
        ("seller", "name"),
        ("store", "name"),
        ("storeName",),
        ("merchant", "name"),
    ):
        val = _dig(product, *path)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return "Buscapé"


def _extract_image(product: dict) -> str | None:
    for key in ("thumbnail", "image", "imageUrl", "mainImage", "photo"):
        val = product.get(key)
        if isinstance(val, str) and val.startswith("http"):
            return val
        if isinstance(val, dict):
            for sub in ("url", "src", "original", "large"):
                v = val.get(sub)
                if isinstance(v, str) and v.startswith("http"):
                    return v
    return None


def _extract_url(product: dict) -> str | None:
    for key in ("url", "link", "productUrl", "href", "slug"):
        val = product.get(key)
        if not isinstance(val, str) or not val:
            continue
        if val.startswith("http"):
            return _clean_url(val)
        if val.startswith("/"):
            return _BASE + val
    return None


def _name_from_url(url: str) -> str | None:
    """Extract a human-readable product name from a Buscapé URL slug.

    e.g. /perfume/lattafa-yara-edp-100ml  →  'lattafa yara edp 100ml'
    """
    path = urlsplit(url).path.rstrip("/")
    slug = path.split("/")[-1]          # last segment
    if not slug or slug == url:
        return None
    # drop trailing numeric IDs like -12345678
    slug = re.sub(r"-\d{5,}$", "", slug)
    name = slug.replace("-", " ").strip()
    return name.title() if len(name) > 5 else None


def _product_to_offer(product: dict, query: str) -> RawOfferModel | None:
    name = (
        product.get("name")
        or product.get("title")
        or product.get("nome")
        or product.get("productName")
        or ""
    )
    if not isinstance(name, str):
        name = ""
    name = name.strip()

    # If name is too short (just a brand), try to get it from the URL slug
    if len(name) < 10:
        url_candidate = _extract_url(product)
        if url_candidate:
            name = _name_from_url(url_candidate) or name

    if not name or not _is_relevant(query, name):
        return None

    # Price: try several common keys
    price = (
        _parse_brl(product.get("bestPrice"))
        or _parse_brl(product.get("minPrice"))
        or _parse_brl(product.get("lowestPrice"))
        or _parse_brl(product.get("price"))
        or _parse_brl(_dig(product, "offers", "0", "price"))
        or _parse_brl(_dig(product, "offers", "0", "bestPrice"))
        or _parse_brl(product.get("valor"))
        or _parse_brl(product.get("preco"))
    )
    if not price:
        return None

    url = _extract_url(product) or _BASE
    store = _extract_store(product)
    image_url = _extract_image(product)

    return RawOfferModel(
        source="buscape",
        country="br",
        store=store,
        title=name,
        url=url,
        image_url=image_url,
        price_amount=price,
        price_currency="BRL",
        captured_at=datetime.now(UTC),
    )


def _offers_from_product(product: dict, query: str) -> list[RawOfferModel]:
    """
    Extract one RawOfferModel per store offer inside a product dict.
    Buscapé embeds an 'offers' list with one entry per store.
    Falls back to a single offer using the product-level price.
    """
    name = (
        product.get("name") or product.get("title")
        or product.get("nome") or product.get("productName") or ""
    )
    if not isinstance(name, str):
        name = ""
    name = name.strip()

    if len(name) < 10:
        url_candidate = _extract_url(product)
        if url_candidate:
            name = _name_from_url(url_candidate) or name

    if not name or not _is_relevant(query, name):
        return []

    image_url = _extract_image(product)
    base_url  = _extract_url(product) or _BASE
    now = datetime.now(UTC)

    # ── try to expand per-store offers ────────────────────────────────────────
    raw_offers: list[Any] = []
    for key in ("offers", "sellers", "merchants", "storeOffers", "lojas"):
        val = product.get(key)
        if isinstance(val, list) and val:
            raw_offers = val
            break

    results: list[RawOfferModel] = []

    for store_offer in raw_offers:
        if not isinstance(store_offer, dict):
            continue

        # Store name
        store = (
            _dig(store_offer, "seller", "name")
            or _dig(store_offer, "store", "name")
            or store_offer.get("storeName")
            or store_offer.get("sellerName")
            or store_offer.get("merchant", {}).get("name") if isinstance(store_offer.get("merchant"), dict) else None
            or "Buscapé"
        )
        if not isinstance(store, str):
            store = "Buscapé"

        # Price
        price = (
            _parse_brl(store_offer.get("bestPrice"))
            or _parse_brl(store_offer.get("price"))
            or _parse_brl(store_offer.get("listPrice"))
            or _parse_brl(store_offer.get("valor"))
        )
        if not price:
            continue

        # Offer-specific URL (direct link to store)
        offer_url = None
        for key in ("url", "link", "offerUrl", "href"):
            v = store_offer.get(key)
            if isinstance(v, str) and v.startswith("http"):
                offer_url = v
                break
        url = offer_url or base_url

        results.append(RawOfferModel(
            source="buscape",
            country="br",
            store=str(store).strip(),
            title=name,
            url=url,
            image_url=image_url,
            price_amount=price,
            price_currency="BRL",
            captured_at=now,
        ))

    # ── fallback: single offer at product level ───────────────────────────────
    if not results:
        price = (
            _parse_brl(product.get("bestPrice"))
            or _parse_brl(product.get("minPrice"))
            or _parse_brl(product.get("lowestPrice"))
            or _parse_brl(product.get("price"))
            or _parse_brl(_dig(product, "offers", "0", "price"))
            or _parse_brl(_dig(product, "offers", "0", "bestPrice"))
        )
        if price:
            results.append(RawOfferModel(
                source="buscape",
                country="br",
                store=_extract_store(product),
                title=name,
                url=base_url,
                image_url=image_url,
                price_amount=price,
                price_currency="BRL",
                captured_at=now,
            ))

    return results


def _from_next_data(data: dict, query: str) -> list[RawOfferModel]:
    products: list[Any] = []

    # Try known paths first
    for path in _KNOWN_PATHS:
        products = _dig(data, *path) or []
        if isinstance(products, list) and products:
            log.debug("buscape: found products at path %s (%d items)", path, len(products))
            break

    # Deep scan fallback
    if not products:
        products = _deep_find_offers(data)
        if products:
            log.debug("buscape: deep scan found %d candidate dicts", len(products))

    if not isinstance(products, list):
        return []

    offers: list[RawOfferModel] = []
    for p in products:
        if not isinstance(p, dict):
            continue
        offers.extend(_offers_from_product(p, query))
        if len(offers) >= 60:
            break

    return offers


# ── HTML fallback ──────────────────────────────────────────────────────────────

def _from_html(soup: BeautifulSoup, query: str) -> list[RawOfferModel]:
    offers: list[RawOfferModel] = []
    seen: set[str] = set()
    now = datetime.now(UTC)

    # Buscapé product cards
    cards = (
        soup.select("[data-testid='product-card']")
        or soup.select("article[class*='Product']")
        or soup.select("div[class*='product-card']")
        or soup.select("li[class*='ProductCard']")
    )

    for card in cards:
        # Title
        title_el = (
            card.select_one("h2")
            or card.select_one("h3")
            or card.select_one("[class*='title']")
            or card.select_one("[class*='name']")
        )
        title = title_el.get_text(" ", strip=True) if title_el else ""
        if not title or not _is_relevant(query, title):
            continue

        # Price
        price_el = (
            card.select_one("[class*='price']")
            or card.select_one("[class*='preco']")
            or card.select_one("[class*='valor']")
        )
        price = _parse_brl(price_el.get_text(" ", strip=True)) if price_el else None
        if not price:
            # try to find R$ pattern anywhere in card text
            m = re.search(r"R\$\s*([\d\.,]+)", card.get_text(" "))
            if m:
                price = _parse_brl(m.group(1))
        if not price:
            continue

        # URL
        link_el = card.select_one("a[href]")
        href = str(link_el.get("href", "")).strip() if link_el else ""
        url = _clean_url(href) if href else _BASE
        if url in seen:
            continue
        seen.add(url)

        # Store name
        store_el = (
            card.select_one("[class*='store']")
            or card.select_one("[class*='seller']")
            or card.select_one("[class*='merchant']")
            or card.select_one("[class*='loja']")
        )
        store = store_el.get_text(" ", strip=True) if store_el else "Buscapé"
        if not store or len(store) > 60:
            store = "Buscapé"

        # Image
        img_el = card.select_one("img")
        image_url = None
        if img_el:
            src = img_el.get("src") or img_el.get("data-src") or img_el.get("data-lazy-src")
            if isinstance(src, str) and not src.startswith("data:"):
                image_url = src

        offers.append(RawOfferModel(
            source="buscape",
            country="br",
            store=store,
            title=title,
            url=url,
            image_url=image_url,
            price_amount=price,
            price_currency="BRL",
            captured_at=now,
        ))

        if len(offers) >= 30:
            break

    return offers


# ── Adapter ────────────────────────────────────────────────────────────────────

class BuscapeAdapter(SourceAdapter):
    source_id = "buscape"
    country = "br"

    def search(self, query: str) -> list[RawOfferModel]:
        url = f"{_BASE}/search?q={quote_plus(query)}"
        try:
            resp = requests.get(url, headers=_HEADERS, timeout=_TIMEOUT)
            resp.raise_for_status()
        except Exception as exc:
            log.warning("buscape: request failed — %s", exc)
            return []

        soup = BeautifulSoup(resp.text, "html.parser")
        data = _next_data(soup)

        if data:
            offers = _from_next_data(data, query)
            if offers:
                return offers
            log.debug("buscape: __NEXT_DATA__ present but no offers extracted — trying HTML")
        else:
            log.debug("buscape: no __NEXT_DATA__ found — trying HTML")

        return _from_html(soup, query)
