"""
Brazilian store adapters.

These sites run on Next.js and embed their initial product data as JSON in
<script id="__NEXT_DATA__"> — so requests + BeautifulSoup can read it without
needing a headless browser.  The HTML fallback path handles any sites that
don't follow this pattern or whose JSON structure changes.
"""
from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from typing import Any
from urllib.parse import quote_plus, urlsplit, urlunsplit

import requests
from bs4 import BeautifulSoup

from app.adapters.base import SourceAdapter
from app.schemas import RawOfferModel

# ── shared helpers ─────────────────────────────────────────────────────────────

_STOP_TOKENS = {"de", "da", "do", "e", "com", "para", "pro", "max", "mini", "plus"}


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", text.lower())).strip()


def _tokens(query: str) -> list[str]:
    s = re.sub(r"(\d+)\s*(gb|tb)\b", r"\1 \2", _norm(query))
    return [t for t in s.split() if len(t) >= 2 and t not in _STOP_TOKENS]


def _is_relevant(query: str, title: str) -> bool:
    q = _tokens(query)
    if not q:
        return False
    t = set(_norm(title).split())
    hits = sum(1 for tok in q if tok in t)
    return hits >= max(2, int(len(q) * 0.5 + 0.5))


def _parse_brl(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value) if value >= 50 else None
    if isinstance(value, str):
        cleaned = re.sub(r"[^0-9,.]", "", value).replace(".", "").replace(",", ".")
        try:
            v = float(cleaned)
            return v if v >= 50 else None
        except ValueError:
            return None
    return None


def _clean_url(href: str, base: str) -> str:
    """Strip query-string and fragment; resolve relative URLs."""
    if href.startswith("//"):
        href = "https:" + href
    elif href.startswith("/"):
        parts = urlsplit(base)
        href = f"{parts.scheme}://{parts.netloc}{href}"
    p = urlsplit(href)
    return urlunsplit((p.scheme, p.netloc, p.path, "", ""))


def _next_data(soup: BeautifulSoup) -> dict:
    tag = soup.find("script", {"id": "__NEXT_DATA__"})
    if tag and tag.string:
        try:
            return json.loads(tag.string)
        except json.JSONDecodeError:
            pass
    return {}


def _dig(obj: Any, *keys: str) -> Any:
    """Safely traverse nested dicts/lists."""
    for k in keys:
        if isinstance(obj, dict):
            obj = obj.get(k)
        elif isinstance(obj, list) and k.isdigit():
            try:
                obj = obj[int(k)]
            except IndexError:
                return None
        else:
            return None
        if obj is None:
            return None
    return obj


def _default_headers() -> dict[str, str]:
    return {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "pt-BR,pt;q=0.9",
    }


# ── Americanas ─────────────────────────────────────────────────────────────────

class AmericanasAdapter(SourceAdapter):
    source_id = "americanas"
    country = "br"
    _BASE = "https://www.americanas.com.br"

    def _search_url(self, query: str) -> str:
        return f"{self._BASE}/busca?q={quote_plus(query)}"

    def _from_next_data(self, data: dict, query: str) -> list[RawOfferModel]:
        """
        Americanas Next.js data path (may change with site updates):
        props.pageProps.data.search.products[]
        """
        products: list[Any] = []

        # Try multiple known paths
        for path in (
            ("props", "pageProps", "data", "search", "products"),
            ("props", "pageProps", "searchData", "products"),
            ("props", "pageProps", "initialData", "data", "search", "products"),
        ):
            products = _dig(data, *path) or []
            if products:
                break

        if not isinstance(products, list):
            return []

        now = datetime.now(UTC)
        offers: list[RawOfferModel] = []

        for p in products:
            if not isinstance(p, dict):
                continue

            name = p.get("name") or p.get("title") or ""
            if not name or not _is_relevant(query, name):
                continue

            # Price — try multiple paths
            price = (
                _parse_brl(_dig(p, "offers", "primaryOffer", "price"))
                or _parse_brl(_dig(p, "offers", "primaryOffer", "listPrice"))
                or _parse_brl(p.get("price"))
                or _parse_brl(p.get("listPrice"))
            )
            if not price:
                continue

            # URL
            slug = p.get("url") or p.get("slug") or p.get("id") or ""
            url = _clean_url(str(slug), self._BASE) if slug else ""
            if not url:
                continue
            if not url.startswith("http"):
                url = self._BASE + ("/" if not slug.startswith("/") else "") + slug

            # Image
            images = p.get("images") or []
            image_url: str | None = None
            if isinstance(images, list) and images:
                img = images[0]
                if isinstance(img, dict):
                    image_url = img.get("extraLarge") or img.get("large") or img.get("src") or img.get("url")
                elif isinstance(img, str):
                    image_url = img

            offers.append(RawOfferModel(
                source=self.source_id,
                country=self.country,
                store="Americanas",
                title=name,
                url=url,
                image_url=image_url or None,
                price_amount=price,
                price_currency="BRL",
                captured_at=now,
            ))

            if len(offers) >= 20:
                break

        return offers

    def _from_html(self, soup: BeautifulSoup, query: str, base_url: str) -> list[RawOfferModel]:
        """Fallback: generic link-based extraction."""
        now = datetime.now(UTC)
        offers: list[RawOfferModel] = []
        seen: set[str] = set()

        for a in soup.select("a[href]"):
            href = str(a.get("href", "")).strip()
            if not href:
                continue

            url = _clean_url(href, self._BASE)
            if "americanas.com.br" not in url or url in seen:
                continue

            # Must look like a product path (has an ID-like segment)
            path = urlsplit(url).path
            if not re.search(r"\d{5,}", path) and "/produto/" not in path:
                continue

            card = a.find_parent(["article", "li", "section", "div"]) or a
            title_el = card.select_one("h2,h3,[class*='title'],[class*='name']") or a
            title = title_el.get_text(" ", strip=True) if title_el else ""
            if not title or not _is_relevant(query, title):
                continue

            price_el = card.select_one("[class*='price'],[class*='preco'],[class*='valor']")
            price = _parse_brl(price_el.get_text(" ", strip=True)) if price_el else None
            if not price:
                continue

            img_el = card.select_one("img")
            image_url = None
            if img_el:
                image_url = img_el.get("src") or img_el.get("data-src")
                if isinstance(image_url, str) and image_url.startswith("data:"):
                    image_url = None

            seen.add(url)
            offers.append(RawOfferModel(
                source=self.source_id,
                country=self.country,
                store="Americanas",
                title=title,
                url=url,
                image_url=image_url or None,
                price_amount=price,
                price_currency="BRL",
                captured_at=now,
            ))

            if len(offers) >= 20:
                break

        return offers

    def search(self, query: str) -> list[RawOfferModel]:
        try:
            resp = requests.get(
                self._search_url(query),
                timeout=15,
                headers=_default_headers(),
            )
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "html.parser")

            offers = self._from_next_data(_next_data(soup), query)
            if not offers:
                offers = self._from_html(soup, query, resp.url)

            return offers
        except Exception:
            return []


# ── Casas Bahia ────────────────────────────────────────────────────────────────

class CasasBahiaAdapter(SourceAdapter):
    source_id = "casasbahia"
    country = "br"
    _BASE = "https://www.casasbahia.com.br"

    def _search_url(self, query: str) -> str:
        return f"{self._BASE}/busca?q={quote_plus(query)}"

    def _from_next_data(self, data: dict, query: str) -> list[RawOfferModel]:
        products: list[Any] = []

        for path in (
            ("props", "pageProps", "data", "search", "products"),
            ("props", "pageProps", "searchData", "products"),
            ("props", "pageProps", "initialData", "data", "search", "products"),
            ("props", "pageProps", "products"),
        ):
            products = _dig(data, *path) or []
            if products:
                break

        if not isinstance(products, list):
            return []

        now = datetime.now(UTC)
        offers: list[RawOfferModel] = []

        for p in products:
            if not isinstance(p, dict):
                continue

            name = p.get("name") or p.get("title") or ""
            if not name or not _is_relevant(query, name):
                continue

            price = (
                _parse_brl(_dig(p, "offers", "primaryOffer", "price"))
                or _parse_brl(_dig(p, "offers", "primaryOffer", "listPrice"))
                or _parse_brl(p.get("price"))
                or _parse_brl(p.get("listPrice"))
            )
            if not price:
                continue

            slug = p.get("url") or p.get("slug") or p.get("id") or ""
            url = str(slug).strip()
            if not url:
                continue
            if not url.startswith("http"):
                url = self._BASE + ("/" if not url.startswith("/") else "") + url

            images = p.get("images") or []
            image_url: str | None = None
            if isinstance(images, list) and images:
                img = images[0]
                if isinstance(img, dict):
                    image_url = img.get("extraLarge") or img.get("large") or img.get("src") or img.get("url")
                elif isinstance(img, str):
                    image_url = img

            offers.append(RawOfferModel(
                source=self.source_id,
                country=self.country,
                store="Casas Bahia",
                title=name,
                url=_clean_url(url, self._BASE),
                image_url=image_url or None,
                price_amount=price,
                price_currency="BRL",
                captured_at=now,
            ))

            if len(offers) >= 20:
                break

        return offers

    def _from_html(self, soup: BeautifulSoup, query: str) -> list[RawOfferModel]:
        now = datetime.now(UTC)
        offers: list[RawOfferModel] = []
        seen: set[str] = set()

        for a in soup.select("a[href]"):
            href = str(a.get("href", "")).strip()
            if not href:
                continue

            url = _clean_url(href, self._BASE)
            if "casasbahia.com.br" not in url or url in seen:
                continue

            path = urlsplit(url).path
            if not re.search(r"\d{5,}", path) and "/produto/" not in path:
                continue

            card = a.find_parent(["article", "li", "section", "div"]) or a
            title_el = card.select_one("h2,h3,[class*='title'],[class*='name']") or a
            title = title_el.get_text(" ", strip=True) if title_el else ""
            if not title or not _is_relevant(query, title):
                continue

            price_el = card.select_one("[class*='price'],[class*='preco'],[class*='valor']")
            price = _parse_brl(price_el.get_text(" ", strip=True)) if price_el else None
            if not price:
                continue

            img_el = card.select_one("img")
            image_url = None
            if img_el:
                image_url = img_el.get("src") or img_el.get("data-src")
                if isinstance(image_url, str) and image_url.startswith("data:"):
                    image_url = None

            seen.add(url)
            offers.append(RawOfferModel(
                source=self.source_id,
                country=self.country,
                store="Casas Bahia",
                title=title,
                url=url,
                image_url=image_url or None,
                price_amount=price,
                price_currency="BRL",
                captured_at=now,
            ))

            if len(offers) >= 20:
                break

        return offers

    def search(self, query: str) -> list[RawOfferModel]:
        try:
            resp = requests.get(
                self._search_url(query),
                timeout=15,
                headers=_default_headers(),
            )
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "html.parser")

            offers = self._from_next_data(_next_data(soup), query)
            if not offers:
                offers = self._from_html(soup, query)

            return offers
        except Exception:
            return []
