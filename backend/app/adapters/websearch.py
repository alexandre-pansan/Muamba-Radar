from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from urllib.parse import parse_qs, unquote, urlparse, urlsplit, urlunsplit

import requests
from bs4 import BeautifulSoup

from app.adapters.base import SourceAdapter
from app.schemas import RawOfferModel
from app.services.normalization import matches_query

# ── Config ────────────────────────────────────────────────────────────────────

DDG_HTML_URL = "https://html.duckduckgo.com/html/"
REQUEST_TIMEOUT = 5  # seconds per request

TRUSTED_SITES: dict[str, str] = {
    "magazineluiza.com.br": "Magazine Luiza",
    "kabum.com.br": "KaBuM!",
}

MAX_DDG_RESULTS_PER_SITE = 3
MAX_TOTAL_OFFERS = 6
MIN_PRICE_BRL = 50.0

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36"
    ),
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# ── URL helpers ───────────────────────────────────────────────────────────────

def _clean_url(href: str) -> str | None:
    """Unwrap DDG redirect and strip query params from the URL."""
    if "duckduckgo.com/l/" in href:
        qs = parse_qs(urlparse(href).query)
        raw = qs.get("uddg", [None])[0]
        href = unquote(raw) if raw else ""
    if not href.startswith("http"):
        return None
    parts = urlsplit(href)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))


def _identify_site(url: str) -> str | None:
    """Return store name if URL belongs to a trusted domain, else None."""
    host = urlparse(url).netloc.lower().replace("www.", "")
    for domain, name in TRUSTED_SITES.items():
        if host.endswith(domain):
            return name
    return None


# ── Price parsing ─────────────────────────────────────────────────────────────

def _parse_brl(text: str) -> float | None:
    cleaned = re.sub(r"[^0-9,\.]", "", text.strip())
    if not cleaned:
        return None
    # PT-BR: dot = thousands separator, comma = decimal
    if "," in cleaned and "." in cleaned and cleaned.rfind(",") > cleaned.rfind("."):
        cleaned = cleaned.replace(".", "").replace(",", ".")
    elif "," in cleaned and "." not in cleaned:
        cleaned = cleaned.replace(",", ".")
    else:
        cleaned = cleaned.replace(",", "")
    try:
        val = float(cleaned)
        return val if val >= MIN_PRICE_BRL else None
    except ValueError:
        return None


_PRICE_SELECTORS = [
    # Magazine Luiza
    "p[data-testid='price-value']",
    ".price-template__text",
    # KaBuM
    "span.regularPrice",
    ".productPrice",
    "[class*='priceValue']",
    # Generic PT-BR
    "[class*='price-value']",
    "[class*='preco']",
    "[class*='valor']",
    "[class*='price']",
]


def _extract_price(html: str) -> float | None:
    soup = BeautifulSoup(html, "html.parser")

    # 1. Open Graph / product meta (most reliable — immune to CSS changes)
    for prop in ("product:price:amount", "og:price:amount"):
        meta = soup.select_one(f'meta[property="{prop}"]')
        if meta and meta.get("content"):
            try:
                val = float(str(meta["content"]).replace(",", "."))
                if val >= MIN_PRICE_BRL:
                    return val
            except ValueError:
                pass

    # 2. CSS selectors
    for selector in _PRICE_SELECTORS:
        el = soup.select_one(selector)
        if el:
            val = _parse_brl(el.get_text(" ", strip=True))
            if val:
                return val

    # 3. Full-page regex fallback
    page_text = soup.get_text(" ")
    match = re.search(r"R\$\s*([\d\.,]+)", page_text)
    if match:
        return _parse_brl(match.group(1))

    return None


# ── DDG search ────────────────────────────────────────────────────────────────

def _query_ddg(query: str, domain: str) -> list[tuple[str, str]]:
    """
    POST to DDG HTML endpoint for `query site:<domain>`.
    Returns list of (title, clean_url) up to MAX_DDG_RESULTS_PER_SITE.
    """
    resp = requests.post(
        DDG_HTML_URL,
        data={"q": f"{query} site:{domain}", "b": "", "kl": "br-pt"},
        headers=_HEADERS,
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    results: list[tuple[str, str]] = []

    for anchor in soup.select("a.result__a[href]"):
        href = str(anchor.get("href", "")).strip()
        title = anchor.get_text(" ", strip=True)
        if not href or not title:
            continue
        clean = _clean_url(href)
        if not clean or not _identify_site(clean):
            continue
        results.append((title, clean))
        if len(results) >= MAX_DDG_RESULTS_PER_SITE:
            break

    return results


def _scrape_product(url: str) -> float | None:
    """Fetch a product page and return its price, or None on failure."""
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        return _extract_price(resp.text)
    except Exception:
        return None


# ── Adapter ───────────────────────────────────────────────────────────────────

class WebSearchAdapter(SourceAdapter):
    source_id = "websearch"
    country = "br"

    def _collect_candidates(self, query: str) -> list[tuple[str, str, str]]:
        """
        Query each trusted site via DDG concurrently.
        Returns (ddg_title, url, store_name) list, deduplicated.
        """
        candidates: list[tuple[str, str, str]] = []
        seen: set[str] = set()

        def _fetch_site(domain: str, store: str) -> list[tuple[str, str, str]]:
            try:
                results = _query_ddg(query, domain)
                return [(t, u, store) for t, u in results]
            except Exception:
                return []

        with ThreadPoolExecutor(max_workers=len(TRUSTED_SITES)) as pool:
            futures = {
                pool.submit(_fetch_site, domain, store): domain
                for domain, store in TRUSTED_SITES.items()
            }
            for future in as_completed(futures):
                for title, url, store in future.result():
                    if url not in seen:
                        seen.add(url)
                        candidates.append((title, url, store))

        return candidates

    def _scrape(self, query: str) -> list[RawOfferModel]:
        candidates = self._collect_candidates(query)

        # Pre-filter by title relevance before hitting product pages
        relevant = [
            (title, url, store)
            for title, url, store in candidates
            if matches_query(query, title)
        ]

        now = datetime.now(timezone.utc)
        offers: list[RawOfferModel] = []

        # Scrape product pages concurrently
        with ThreadPoolExecutor(max_workers=4) as pool:
            future_to_meta = {
                pool.submit(_scrape_product, url): (title, url, store)
                for title, url, store in relevant
            }
            for future in as_completed(future_to_meta):
                if len(offers) >= MAX_TOTAL_OFFERS:
                    break
                title, url, store = future_to_meta[future]
                price = future.result()
                if price is None:
                    continue
                offers.append(RawOfferModel(
                    source=self.source_id,
                    country=self.country,
                    store=store,
                    title=title,
                    url=url,
                    image_url=None,
                    price_amount=price,
                    price_currency="BRL",
                    captured_at=now,
                ))

        return offers

    def search(self, query: str) -> list[RawOfferModel]:
        try:
            return self._scrape(query)
        except Exception:
            return []
