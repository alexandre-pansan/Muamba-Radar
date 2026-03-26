from __future__ import annotations

import re
from datetime import UTC, datetime
from urllib.parse import quote_plus, urlsplit, urlunsplit

import requests
from bs4 import BeautifulSoup, Tag

from app.adapters.base import SourceAdapter
from app.schemas import RawOfferModel
from app.services.normalization import matches_query


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", value.lower())).strip()


def _parse_brl(value: str) -> float | None:
    cleaned = re.sub(r"[^0-9,\.]", "", value)
    if not cleaned:
        return None

    cleaned = cleaned.replace(".", "").replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return None


def _normalize_product_url(href: str) -> str:
    parts = urlsplit(href)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))


def _is_product_url(url: str) -> bool:
    lowered = url.lower()
    return (
        "produto.mercadolivre.com.br" in lowered
        or re.search(r"mercadolivre\.com\.br/.*/mlb-\d+", lowered) is not None
        or re.search(r"/MLB-\d+", url) is not None
        or "/p/mlb" in lowered
    )


def _extract_price(item: Tag) -> float | None:
    price_whole = item.select_one(".andes-money-amount__fraction")
    price_cents = item.select_one(".andes-money-amount__cents")
    if price_whole:
        whole = re.sub(r"\D", "", price_whole.get_text(strip=True))
        cents = re.sub(r"\D", "", price_cents.get_text(strip=True)) if price_cents else "00"
        return float(f"{whole}.{cents}") if whole else None

    return _parse_brl(item.get_text(" ", strip=True))


def _extract_image_url(item: Tag) -> str | None:
    img = item.select_one("img.ui-search-result-image__element") or item.select_one("img")
    if not img:
        return None

    src = (
        img.get("data-src")
        or img.get("src")
        or ""
    ).strip()
    if not src or src.lower().startswith("data:image"):
        return None

    if src.startswith("//"):
        return f"https:{src}"
    return src


class MercadoLivreAdapter(SourceAdapter):
    source_id = "mercadolivre"
    country = "br"

    def _search_url(self, query: str) -> str:
        query_slug = quote_plus(query).replace("+", "-")
        return f"https://lista.mercadolivre.com.br/{query_slug}"

    def _scrape(self, query: str) -> list[RawOfferModel]:
        url = self._search_url(query)
        response = requests.get(
            url,
            timeout=12,
            headers={"User-Agent": "Mozilla/5.0 (PriceSourcerer/0.1)"},
        )
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")
        now = datetime.now(UTC)
        offers: list[RawOfferModel] = []
        seen_urls: set[str] = set()

        items = soup.select("li.ui-search-layout__item")
        if not items:
            items = soup.select("div.ui-search-result, div.poly-card")

        for item in items:
            link = item.select_one("a.ui-search-link[href]") or item.select_one("a[href]")
            if not link:
                continue

            href = link.get("href", "").strip()
            if not href:
                continue

            product_url = _normalize_product_url(href)
            if not _is_product_url(product_url) or product_url in seen_urls:
                continue

            title_el = item.select_one("h3") or item.select_one(".poly-component__title") or link
            title = title_el.get_text(" ", strip=True) if title_el else query
            if not title or not matches_query(query, title):
                continue

            price_amount = _extract_price(item)
            if price_amount is None or price_amount < 300:
                continue

            seen_urls.add(product_url)
            offers.append(
                RawOfferModel(
                    source=self.source_id,
                    country=self.country,
                    store="Mercado Livre",
                    title=title,
                    url=product_url,
                    image_url=_extract_image_url(item),
                    price_amount=price_amount,
                    price_currency="BRL",
                    captured_at=now,
                )
            )

            if len(offers) >= 25:
                break

        return offers

    def search(self, query: str) -> list[RawOfferModel]:
        try:
            return self._scrape(query)
        except Exception:
            return []
