from __future__ import annotations

import math
import re
from datetime import UTC, datetime
from urllib.parse import quote_plus, urljoin, urlparse, urlsplit, urlunsplit

import requests
from bs4 import BeautifulSoup, Tag

from app.adapters.base import SourceAdapter
from app.schemas import RawOfferModel


EXCLUDED_PATH_TOKENS = (
    "busca",
    "search",
    "pesquisa",
    "categoria",
    "category",
    "marcas",
    "brand",
    "brands",
    "contato",
    "contact",
    "carrinho",
    "cart",
    "checkout",
    "blog",
)

PRODUCT_PATH_HINTS = (
    "produto",
    "product",
    "item",
    "oferta",
    "promocao",
    "promocoes",
)

PRICE_SELECTORS = (
    ".price",
    ".preco",
    ".valor",
    ".sale-price",
    "[class*='price']",
    "[class*='preco']",
    "[class*='valor']",
)

STOP_TOKENS = {
    "de",
    "da",
    "do",
    "e",
    "com",
    "para",
    "pro",
    "max",
    "mini",
    "plus",
}


def _normalize_url(href: str) -> str:
    parts = urlsplit(href)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", value.lower())).strip()


def _query_tokens(query: str) -> list[str]:
    normalized = _normalize_text(query)
    normalized = re.sub(r"(\d+)\s*(gb|tb)\b", r"\1 \2", normalized)
    tokens = [token for token in normalized.split() if len(token) >= 2 and token not in STOP_TOKENS]
    return tokens


def _title_relevance_score(query: str, title: str) -> float:
    query_tokens = _query_tokens(query)
    if not query_tokens:
        return 0.0

    title_tokens = set(_normalize_text(title).split())
    matched = sum(1 for token in query_tokens if token in title_tokens)
    return matched / len(query_tokens)


def _is_relevant(query: str, title: str) -> bool:
    query_tokens = _query_tokens(query)
    if not query_tokens:
        return False

    score = _title_relevance_score(query, title)
    minimum_score = 0.5

    required_hits = max(2, math.ceil(len(query_tokens) * minimum_score))
    title_tokens = set(_normalize_text(title).split())
    hits = sum(1 for token in query_tokens if token in title_tokens)

    # Ensure at least one specific token (long token or numeric/storage token).
    has_specific = any(
        (len(token) >= 4 or bool(re.search(r"\d", token)) or token in {"gb", "tb"})
        and token in title_tokens
        for token in query_tokens
    )
    return hits >= required_hits and has_specific


def _same_domain(base_url: str, target_url: str) -> bool:
    base_host = urlparse(base_url).netloc.replace("www.", "").lower()
    target_host = urlparse(target_url).netloc.replace("www.", "").lower()
    return base_host in target_host or target_host in base_host


def _looks_like_product_path(path: str) -> bool:
    lowered = path.lower().strip("/")
    if not lowered:
        return False

    if any(token in lowered for token in EXCLUDED_PATH_TOKENS):
        return False

    if any(token in lowered for token in PRODUCT_PATH_HINTS):
        return True

    segments = [segment for segment in lowered.split("/") if segment]
    if not segments:
        return False

    tail = segments[-1]
    return ("-" in tail and len(tail) >= 10) or bool(re.search(r"\d{4,}", tail))


def _extract_price(raw_text: str) -> tuple[float, str] | None:
    symbol_match = re.search(r"(R\$|US\$|U\$S|PYG|Gs\.)", raw_text, re.IGNORECASE)
    amount_match = re.search(r"(\d{1,3}(?:[\.,]\d{3})*(?:[\.,]\d{2})?)", raw_text)
    if not amount_match:
        return None

    amount_raw = amount_match.group(1)
    if "," in amount_raw and "." in amount_raw and amount_raw.rfind(",") > amount_raw.rfind("."):
        amount_clean = amount_raw.replace(".", "").replace(",", ".")
    elif "," in amount_raw and "." not in amount_raw:
        amount_clean = amount_raw.replace(",", ".")
    else:
        amount_clean = amount_raw.replace(",", "")

    try:
        amount = float(amount_clean)
    except ValueError:
        return None

    symbol = (symbol_match.group(1).lower() if symbol_match else "")
    if "r$" in symbol:
        currency = "BRL"
    elif "us$" in symbol or "u$s" in symbol:
        currency = "USD"
    elif "pyg" in symbol or "gs" in symbol:
        currency = "PYG"
    else:
        currency = "PYG"

    return amount, currency


def _is_plausible_price(amount: float, currency: str) -> bool:
    c = currency.upper()
    if c == "USD":
        return amount >= 80
    if c == "BRL":
        return amount >= 300
    if c == "PYG":
        return amount >= 300_000
    return amount > 0


def _first_text(node: Tag, selectors: tuple[str, ...]) -> str:
    for selector in selectors:
        hit = node.select_one(selector)
        if hit:
            text = hit.get_text(" ", strip=True)
            if text:
                return text
    return ""


def _best_price_text(card: Tag) -> str:
    for selector in PRICE_SELECTORS:
        hit = card.select_one(selector)
        if hit:
            text = hit.get_text(" ", strip=True)
            if text:
                return text
    return ""


class GenericStoreAdapter(SourceAdapter):
    def __init__(
        self,
        source_id: str,
        store_name: str,
        base_url: str,
        search_paths: list[str],
        country: str = "py",
        fallback_currency: str = "PYG",
    ) -> None:
        self.source_id = source_id
        self.country = country
        self._store_name = store_name
        self._base_url = base_url.rstrip("/")
        self._search_paths = search_paths
        self._fallback_currency = fallback_currency

    def _candidate_search_urls(self, query: str) -> list[str]:
        encoded = quote_plus(query)
        return [f"{self._base_url}{path.format(query=encoded)}" for path in self._search_paths]

    def _extract_title(self, anchor: Tag) -> str:
        card = anchor.find_parent(["article", "li", "div"]) or anchor
        title = _first_text(card, ("h1", "h2", "h3", ".title", ".nome", ".product-name", ".name"))
        if title:
            return title
        return anchor.get_text(" ", strip=True)

    def _extract_price_and_currency(self, anchor: Tag) -> tuple[float, str] | None:
        card = anchor.find_parent(["article", "li", "div"]) or anchor

        # Prefer explicit price nodes to avoid reading model numbers as prices.
        primary_price_text = _best_price_text(card)
        if primary_price_text:
            parsed = _extract_price(primary_price_text)
            if parsed and _is_plausible_price(parsed[0], parsed[1]):
                return parsed

        # Fallback to full card text only when it still looks plausible.
        parsed = _extract_price(card.get_text(" ", strip=True))
        if parsed and _is_plausible_price(parsed[0], parsed[1]):
            return parsed
        return None

    def _scrape_from_url(self, url: str, query: str) -> list[dict]:
        response = requests.get(
            url,
            timeout=12,
            headers={"User-Agent": "Mozilla/5.0 (PriceSourcerer/0.1)"},
        )
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")
        now = datetime.now(UTC)
        hits: list[dict] = []
        seen_urls: set[str] = set()

        for anchor in soup.select("a[href]"):
            href = anchor.get("href", "").strip()
            if not href:
                continue

            absolute = _normalize_url(urljoin(self._base_url + "/", href))
            parsed = urlparse(absolute)
            if not _same_domain(self._base_url, absolute):
                continue
            if not _looks_like_product_path(parsed.path):
                continue
            if absolute in seen_urls:
                continue

            title = self._extract_title(anchor)
            if not title or not _is_relevant(query, title):
                continue

            price_data = self._extract_price_and_currency(anchor)
            if not price_data:
                continue

            amount, currency = price_data
            seen_urls.add(absolute)

            hits.append(
                {
                    "score": _title_relevance_score(query, title),
                    "offer": {
                        "source": self.source_id,
                        "country": self.country,
                        "store": self._store_name,
                        "title": title,
                        "url": absolute,
                        "price_amount": amount,
                        "price_currency": currency or self._fallback_currency,
                        "captured_at": now,
                    },
                }
            )

            if len(hits) >= 20:
                break

        return hits

    def search(self, query: str) -> list:
        for url in self._candidate_search_urls(query):
            try:
                hits = self._scrape_from_url(url, query)
                if hits:
                    hits.sort(key=lambda entry: entry["score"], reverse=True)
                    return [RawOfferModel(**entry["offer"]) for entry in hits[:8]]
            except Exception:
                continue

        return []


class NisseiAdapter(GenericStoreAdapter):
    def __init__(self) -> None:
        super().__init__(
            source_id="nissei",
            store_name="Nissei",
            base_url="https://nissei.com/br",
            search_paths=["/busca?q={query}", "/search?q={query}"],
            country="py",
        )


class MegaEletronicosAdapter(GenericStoreAdapter):
    def __init__(self) -> None:
        super().__init__(
            source_id="megaeletronicos",
            store_name="Mega Eletronicos",
            base_url="https://megaeletronicos.com",
            search_paths=["/busca?q={query}", "/search?q={query}"],
            country="py",
        )


class CellShopAdapter(GenericStoreAdapter):
    def __init__(self) -> None:
        super().__init__(
            source_id="cellshop",
            store_name="Cellshop",
            base_url="https://cellshop.com",
            search_paths=["/busca?q={query}", "/search?q={query}"],
            country="py",
        )


class MobileZoneAdapter(GenericStoreAdapter):
    def __init__(self) -> None:
        super().__init__(
            source_id="mobilezone",
            store_name="Mobile Zone",
            base_url="https://www.mobilezone.com.br",
            search_paths=["/busca?q={query}", "/search?q={query}"],
            country="py",
            fallback_currency="BRL",
        )


class ShoppingChinaAdapter(GenericStoreAdapter):
    def __init__(self) -> None:
        super().__init__(
            source_id="shoppingchina",
            store_name="Shopping China",
            base_url="https://www.shoppingchina.com.br",
            search_paths=["/busca?q={query}", "/search?q={query}"],
            country="py",
        )


class NewZoneAdapter(GenericStoreAdapter):
    def __init__(self) -> None:
        super().__init__(
            source_id="newzone",
            store_name="New Zone",
            base_url="https://www.newzone.com.py",
            search_paths=["/busca?q={query}", "/search?q={query}"],
            country="py",
        )
