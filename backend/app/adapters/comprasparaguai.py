from __future__ import annotations

import re
from datetime import UTC, datetime
from urllib.parse import quote_plus, urljoin, urlsplit, urlunsplit

from bs4 import BeautifulSoup, Tag

from app.adapters.base import SourceAdapter
from app.schemas import RawOfferModel
from app.services.normalization import matches_query

STOP_TOKENS = {"de", "da", "do", "e", "com", "para", "pro", "max", "mini", "plus"}

# URL slug tokens that indicate a clearly unrelated product category on the external store.
_BAD_URL_CATEGORY_RE = re.compile(
    r"/(vape|cigarro|perfume|fragrance|edt|edp|decant|"
    r"shampoo|condicionador|cosmetico|maquiagem|roupa|sapato|"
    r"camiseta|bermuda|tenis|calca|jaqueta|bolsa|carteira|"
    r"alimento|suplemento|vitamina|proteina|whey|creatina)/",
    re.IGNORECASE,
)

# Bidirectional synonym groups: if any token from a group is in the query,
# all tokens from that group are accepted as matches in the title (and vice-versa).
# This lets "air fry" match "Fritadeira" and "fritadeira" match "Air Fryer".
_APPLIANCE_SYNONYM_GROUPS: list[frozenset[str]] = [
    frozenset({"airfryer", "air", "fry", "fryer", "fritadeira"}),
    frozenset({"secador", "hairdryer"}),
    frozenset({"lavadora", "washing"}),
    frozenset({"microondas", "micro", "microwave"}),
    frozenset({"liquidificador", "blender"}),
    frozenset({"chapinha", "prancha", "alisador"}),
    frozenset({"aspirador", "vacuum"}),
    frozenset({"ventilador", "fan"}),
    frozenset({"batedeira", "mixer"}),
]


def _expand_synonyms(tokens: set[str]) -> set[str]:
    """Add all synonym-group siblings for any token already in the set."""
    expanded = set(tokens)
    for group in _APPLIANCE_SYNONYM_GROUPS:
        if expanded & group:
            expanded |= group
    return expanded

COLOR_TOKENS = (
    "black",
    "blue",
    "green",
    "pink",
    "yellow",
    "white",
    "purple",
    "red",
    "preto",
    "preta",
    "azul",
    "verde",
    "rosa",
    "amarelo",
    "amarela",
    "branco",
    "branca",
    "roxo",
    "vermelho",
)


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", value.lower())).strip()


def _query_tokens(query: str) -> list[str]:
    normalized = _normalize_text(query)
    normalized = re.sub(r"(\d+)\s*(gb|tb)\b", r"\1 \2", normalized)
    return [token for token in normalized.split() if len(token) >= 2 and token not in STOP_TOKENS]


def _is_relevant(query: str, title: str) -> bool:
    # For category-style queries (e.g. "escova de cabelo", "ferro de passar"),
    # matches_query is too strict because it includes stop words like "de" as
    # required tokens. Use stop-word-stripped tokens + synonym expansion instead.
    query_tokens = _query_tokens(query)  # strips stop words
    if not query_tokens:
        return matches_query(query, title)

    title_norm = _normalize_text(title)
    title_toks = set(title_norm.split())

    # Numeric tokens (model numbers, storage) must all match — they are discriminating.
    numeric = [t for t in query_tokens if re.search(r"\d", t)]
    if numeric and not all(t in title_toks for t in numeric):
        return False

    non_numeric = [t for t in query_tokens if not re.search(r"\d", t)]
    if not non_numeric:
        return matches_query(query, title)

    # Expand both sides with appliance synonym groups so "air fry" matches
    # "Fritadeira" and "fritadeira" matches "Air Fryer".
    query_expanded = _expand_synonyms(set(non_numeric))
    title_expanded = _expand_synonyms(title_toks)

    hits = len(query_expanded & title_expanded)
    required = max(1, (len(non_numeric) + 1) // 2)
    return hits >= required


def _iter_product_cards(soup: BeautifulSoup):
    """Yield (title, href) for every product card on a search/category listing page."""
    for card in soup.select("div.promocao-produtos-item"):
        a = card.select_one(".promocao-item-nome a[href]")
        if not a:
            continue
        title = a.get_text(" ", strip=True)
        href = a.get("href", "").strip()
        if not title or not href:
            continue
        yield title, href


def _normalize_product_url(href: str) -> str:
    parts = urlsplit(href)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))


_GENERIC_URL_TOKENS = frozenset({
    "produto", "producto", "productos", "product", "products", "item", "p", "br", "py",
    "codigo", "html", "php", "catalog", "view", "detalle", "detalhe",
})


def _url_plausible_for_title(url: str, title: str) -> bool:
    """Return False if the URL slug has zero overlap with key title tokens.

    Catches cases where comprasparaguai's redirect points to a completely
    different product on the external store (e.g. iPhone title → vape URL).
    Only applied when the URL is an external store link (not comprasparaguai itself).
    """
    if "comprasparaguai.com.br" in url:
        return True

    # Reject obviously wrong categories in the path.
    if _BAD_URL_CATEGORY_RE.search(url):
        return False

    path = urlsplit(url).path.lower()
    # Só tokens que carregam significado: loja que usa ID numérico na URL
    # (/producto/812177, /?s=6935364096151) não tem slug pra comparar — não é sinal
    # de produto errado.
    slug_tokens = {
        t for t in re.split(r"[^a-z0-9]+", path) if len(t) > 2 and not t.isdigit()
    } - _GENERIC_URL_TOKENS
    if not slug_tokens:
        return True

    title_tokens = set(re.split(r"[^a-z0-9]+", title.lower())) - STOP_TOKENS
    # Need at least one shared non-trivial token (length > 2) between URL and title.
    overlap = {t for t in slug_tokens & title_tokens if len(t) > 2}
    return bool(overlap)


def _is_model_url(url: str) -> bool:
    lowered = url.lower()
    if "comprasparaguai.com.br" not in lowered:
        return False
    if any(token in lowered for token in ("/busca", "/categoria", "/marcas", "/lojas")):
        return False
    return re.search(r"_{1,2}[0-9]+/?$", lowered) is not None


def _parse_number_pt_br(value: str) -> float | None:
    cleaned = re.sub(r"[^0-9,\.]", "", value)
    if not cleaned:
        return None

    if "," in cleaned and "." in cleaned and cleaned.rfind(",") > cleaned.rfind("."):
        cleaned = cleaned.replace(".", "").replace(",", ".")
    elif "," in cleaned and "." not in cleaned:
        cleaned = cleaned.replace(",", ".")
    else:
        cleaned = cleaned.replace(",", "")

    try:
        return float(cleaned)
    except ValueError:
        return None


def _extract_price(card: Tag, is_perfume: bool = False) -> tuple[float, str] | None:
    # Só um piso de sanidade: os cards vêm da página de um modelo específico, então
    # preço baixo é preço real (adaptador a US$ 3,45 existe). O piso antigo (US$ 8)
    # descartava ~95% das ofertas de acessórios no crawl de catálogo.
    min_usd = 1
    min_brl = 5

    usd_text = card.get_text(" ", strip=True)
    usd_match = re.search(r"US\$\s*([0-9\.,]+)", usd_text, re.IGNORECASE)
    if usd_match:
        amount = _parse_number_pt_br(usd_match.group(1))
        if amount is not None and amount >= min_usd:
            return amount, "USD"

    brl_match = re.search(r"R\$\s*([0-9\.,]+)", usd_text, re.IGNORECASE)
    if brl_match:
        amount = _parse_number_pt_br(brl_match.group(1))
        if amount is not None and amount >= min_brl:
            return amount, "BRL"

    return None


def _extract_color(title: str) -> str | None:
    lowered = _normalize_text(title)
    for token in COLOR_TOKENS:
        if re.search(rf"\b{re.escape(token)}\b", lowered):
            return token
    return None


def _first_text(node: Tag, selectors: tuple[str, ...]) -> str:
    for selector in selectors:
        hit = node.select_one(selector)
        if hit:
            text = hit.get_text(" ", strip=True)
            if text:
                return text
    return ""


def _extract_image_url(card: Tag, base_url: str) -> str | None:
    img = card.select_one(".promocao-item-img img") or card.select_one("img")
    if not img:
        return None

    src = (
        img.get("data-src")
        or img.get("data-lazy")
        or img.get("src")
        or ""
    ).strip()
    if not src or src.lower().startswith("data:image"):
        return None

    if src.startswith("//"):
        return f"https:{src}"
    return urljoin(base_url, src)


def _heading_label(heading: Tag) -> str | None:
    """Text of a department/group heading on /categorias/.

    Each heading renders its label twice — a desktop <span>/<a> plus a <button>
    that repeats the same words for the mobile accordion — so a plain get_text()
    comes back doubled ("PerfumariaPerfumaria"). Read the first child element,
    which is the desktop copy, instead of the heading's whole subtree.
    """
    first = heading.find(["a", "span", "button"])
    text = (first or heading).get_text(" ", strip=True)
    return text or None


def _is_perfume_context(query: str, model_url: str = "", model_title: str = "") -> bool:
    combined = _normalize_text(f"{query} {model_url} {model_title}")
    perfume_tokens = (
        "perfume",
        "parfum",
        "fragrance",
        "colonia",
        "edp",
        "edt",
        "lattafa",
        "yara",
        "afeef",
    )
    return any(token in combined for token in perfume_tokens)


class ComprasParaguaiAdapter(SourceAdapter):
    source_id = "comprasparaguai"
    country = "py"

    def __init__(self) -> None:
        super().__init__()

    def _search_url(self, query: str) -> str:
        return f"https://www.comprasparaguai.com.br/busca/?q={quote_plus(query)}"

    def _fetch_html(self, url: str) -> str:
        resp = self._get(url)
        resp.encoding = "utf-8"
        return resp.text

    def _extract_model_urls(self, query: str, soup: BeautifulSoup) -> list[str]:
        model_urls: list[str] = []
        seen: set[str] = set()

        for title, href in _iter_product_cards(soup):
            if not _is_relevant(query, title):
                continue

            absolute = _normalize_product_url(urljoin("https://www.comprasparaguai.com.br", href))
            if not _is_model_url(absolute):
                continue
            if absolute in seen:
                continue

            seen.add(absolute)
            model_urls.append(absolute)

            if len(model_urls) >= 12:
                break

        return model_urls

    def _extract_category_products(self, soup: BeautifulSoup) -> list[tuple[str, str]]:
        """Like _extract_model_urls but for category listing pages: no relevance filter, no cap."""
        products: list[tuple[str, str]] = []
        seen: set[str] = set()

        for title, href in _iter_product_cards(soup):
            absolute = _normalize_product_url(urljoin("https://www.comprasparaguai.com.br", href))
            if not _is_model_url(absolute):
                continue
            if absolute in seen:
                continue
            seen.add(absolute)
            products.append((title, absolute))

        return products

    def fetch_category_tree(self) -> list[dict]:
        """Parse /categorias/ once for the full department → group → leaf-category
        hierarchy (site-wide index, 8 departments / ~500 leaf categories).

        Walks up from each leaf to its nearest ancestor holding an <h3> (the group
        block) and then to the one holding an <h2> (the department card).

        The 2026-09 redesign rebuilt this page in Tailwind: the previous positional
        scan keyed on `content-title` / `link-title-category` / `link-category`, and
        every one of those classes is gone — it returned zero rows without raising.
        Only `a.category-link` and the heading tag names are anchored on now. The
        Tailwind class strings are generated and churn on every redeploy, whereas
        the nesting (department card > group block > leaf list) is real in this
        markup — it wasn't in the old one, which is why that scan was positional.
        """
        html = self._fetch_html("https://www.comprasparaguai.com.br/categorias/")
        soup = BeautifulSoup(html, "html.parser")

        rows: list[dict] = []
        seen: set[str] = set()

        for leaf in soup.select("a.category-link"):
            href = (leaf.get("href") or "").strip()
            if not href.startswith("/") or href == "/" or href in seen:
                continue
            seen.add(href)

            group: str | None = None
            department: str | None = None
            department_url: str | None = None
            for ancestor in leaf.parents:
                if group is None:
                    h3 = ancestor.find("h3")
                    if h3 is not None:
                        group = _heading_label(h3)
                h2 = ancestor.find("h2")
                if h2 is not None:
                    department = _heading_label(h2)
                    link = h2.find("a", href=True)
                    department_url = link["href"].strip() if link else None
                    break

            rows.append({
                "department": department,
                "department_url": department_url,
                "group": group,
                "name": leaf.get_text(strip=True),
                "url": href,
            })

        return rows

    def list_category_page(self, category_url: str, page: int) -> list[tuple[str, str]]:
        """Return [(title, model_url), ...] for one page of a category listing, or [] past the last page."""
        absolute = urljoin("https://www.comprasparaguai.com.br", category_url)
        url = absolute if page <= 1 else f"{absolute.rstrip('/')}/?page={page}"
        html = self._fetch_html(url)
        soup = BeautifulSoup(html, "html.parser")
        return self._extract_category_products(soup)

    def _extract_offers_from_model_page(self, query: str, model_url: str, model_title: str = "") -> list[RawOfferModel]:
        html = self._fetch_html(model_url)
        soup = BeautifulSoup(html, "html.parser")
        now = datetime.now(UTC)
        offers: list[RawOfferModel] = []
        seen: set[tuple[str, str, float]] = set()
        perfume_context = _is_perfume_context(query, model_url, model_title)

        offer_cards = soup.select("#container-ofertas .promocao-produtos-item")
        # Cards dentro de #container-ofertas são as ofertas que o próprio CP casou com
        # este modelo — o título da loja varia muito ("8/256GB" vs "256GB - RAM 8GB",
        # sem "Dual Chip"/"Global") e o filtro de relevância derrubava ofertas reais.
        # Fora do container (modelo sem oferta), a página mostra produtos relacionados,
        # aí sim o filtro é necessário.
        trusted = bool(offer_cards)
        if not offer_cards:
            # Some CP product pages use a simplified listing without #container-ofertas.
            offer_cards = soup.select(".promocao-produtos-item")
        for card in offer_cards:
            title = _first_text(card, (".promocao-item-img img[alt]", ".promocao-item-nome a"))
            if not title:
                img = card.select_one(".promocao-item-img img[alt]")
                title = img.get("alt", "").strip() if img else ""
            if not title or (not trusted and not _is_relevant(query, title)):
                continue

            price_data = _extract_price(card, is_perfume=perfume_context)
            if not price_data:
                continue
            amount, currency = price_data

            store = _first_text(card, ("img.store-image[alt]", ".ver-detalhes img[alt]"))
            if not store:
                img_store = card.select_one("img.store-image[alt]") or card.select_one(".ver-detalhes img[alt]")
                store = img_store.get("alt", "ComprasParaguai").strip() if img_store else "ComprasParaguai"

            outbound = card.select_one("a.btn-store-redirect[href]")
            url = outbound.get("href", "").strip() if outbound else model_url
            if not url:
                url = model_url
            if not _url_plausible_for_title(url, title):
                continue

            color = _extract_color(title)
            final_title = f"{title} [{color}]" if color and f"[{color}]" not in title.lower() else title
            image_url = _extract_image_url(card, model_url)

            key = (store.lower(), final_title.lower(), amount)
            if key in seen:
                continue
            seen.add(key)

            offers.append(
                RawOfferModel(
                    source=self.source_id,
                    country=self.country,
                    store=store,
                    title=final_title,
                    url=url,
                    image_url=image_url,
                    price_amount=amount,
                    price_currency=currency,
                    captured_at=now,
                )
            )

            if len(offers) >= 20:
                break

        return offers

    def _scrape(self, query: str) -> list[RawOfferModel]:
        search_html = self._fetch_html(self._search_url(query))
        search_soup = BeautifulSoup(search_html, "html.parser")

        model_urls = self._extract_model_urls(query, search_soup)
        model_title_by_url: dict[str, str] = {}
        for card in search_soup.select("div.promocao-produtos-item"):
            a = card.select_one(".promocao-item-nome a[href]")
            if not a:
                continue
            href = a.get("href", "").strip()
            title = a.get_text(" ", strip=True)
            if not href or not title:
                continue
            absolute = _normalize_product_url(urljoin("https://www.comprasparaguai.com.br", href))
            model_title_by_url[absolute] = title

        all_offers: list[RawOfferModel] = []
        seen: set[tuple[str, str, float]] = set()
        for model_url in model_urls:
            try:
                for offer in self._extract_offers_from_model_page(
                    query,
                    model_url,
                    model_title=model_title_by_url.get(model_url, ""),
                ):
                    key = (offer.store.lower(), offer.title.lower(), offer.price_amount)
                    if key in seen:
                        continue
                    seen.add(key)
                    all_offers.append(offer)
                    if len(all_offers) >= 150:
                        return all_offers
            except Exception:
                continue

        return all_offers

    def fetch_raw(self, query: str) -> tuple[str, str]:
        url = self._search_url(query)
        return url, self._fetch_html(url)  # already forces utf-8

    def search(self, query: str) -> list[RawOfferModel]:
        try:
            return self._scrape(query)
        except Exception:
            return []
