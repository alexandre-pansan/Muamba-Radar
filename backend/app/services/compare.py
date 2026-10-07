from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime

from app.adapters.base import SourceAdapter
from app.database import SessionLocal

log = logging.getLogger("muambaradar.adapters")
from app.adapters.registry import get_adapters
from app.schemas import CheapestModel, CompareResponseModel, CountryFilter, OfferModel, ProductGroupModel, SortOption
from app.services.fx import build_price
from app.services.matcher import group_offers
from app.services.perfume_catalog import identify
from app.services.product_catalog import match_product
from app.services.normalization import (
    is_real_store,
    expand_gaming_aliases,
    extract_brand_model,
    is_refurbished_or_used,
    matches_query,
    matches_query_loose,
    normalize_text,
    slugify,
    tokenize,
)


def _offer_id(source: str, title: str, amount: float) -> str:
    return f"{source}-{slugify(title)}-{int(amount)}"


def _compute_cheapest(offers: list[OfferModel]) -> CheapestModel:
    if not offers:
        return CheapestModel()

    overall = min(offers, key=lambda offer: offer.price.amount_brl)
    py_offers = [offer for offer in offers if offer.country == "py"]
    br_offers = [offer for offer in offers if offer.country == "br"]

    return CheapestModel(
        overall_offer_id=overall.offer_id,
        py_offer_id=min(py_offers, key=lambda offer: offer.price.amount_brl).offer_id if py_offers else None,
        br_offer_id=min(br_offers, key=lambda offer: offer.price.amount_brl).offer_id if br_offers else None,
    )


def _compute_preview_offers(offers: list[OfferModel]) -> list[OfferModel]:
    if not offers:
        return []

    py_offers = [offer for offer in offers if offer.country == "py"]
    br_offers = [offer for offer in offers if offer.country == "br"]

    preview: list[OfferModel] = []
    if py_offers:
        preview.append(min(py_offers, key=lambda offer: offer.price.amount_brl))
    if br_offers:
        preview.append(min(br_offers, key=lambda offer: offer.price.amount_brl))

    if preview:
        return sorted(preview, key=lambda offer: offer.price.amount_brl)

    return [min(offers, key=lambda offer: offer.price.amount_brl)]


# Imagens "sem foto" dos sites: contam como sem imagem (o Compras Paraguai usa
# /static/images/sem-imagem.png quando o produto não tem foto).
_PLACEHOLDER_IMAGE_HINTS = ("sem-imagem", "sem_imagem", "no-image", "noimage", "placeholder")


def is_real_image(url: str | None) -> bool:
    return bool(url) and not any(hint in url.lower() for hint in _PLACEHOLDER_IMAGE_HINTS)


def _select_group_image(offers: list[OfferModel]) -> str | None:
    """Foto do grupo: prefere a do Compras Paraguai (fundo branco, padronizada), mas
    nunca um placeholder "sem imagem" se alguma oferta tiver foto de verdade."""
    cp_with_image = [offer for offer in offers if offer.source == "comprasparaguai" and is_real_image(offer.image_url)]
    if cp_with_image:
        return cp_with_image[0].image_url

    any_with_image = [offer for offer in offers if is_real_image(offer.image_url)]
    return any_with_image[0].image_url if any_with_image else None


def _convert_raw_offers(raw_offers: list, query: str, match_query: bool = True) -> list[OfferModel]:
    """Filter+convert already-fetched RawOfferModels into OfferModels (no adapter call).

    match_query=False pula o filtro por query — pra ofertas que a própria fonte já
    casou com um modelo específico (página de modelo do CP), onde a "query" é o título
    longo do modelo e derrubaria ofertas reais com título de loja diferente."""
    offers: list[OfferModel] = []
    for raw in raw_offers:
        if is_refurbished_or_used(raw.title):
            continue
        if not is_real_store(raw.store):
            continue
        # Use loose matching: the caller already pre-filtered for relevance,
        # so we only need to guard against obvious mismatches and accessories.
        if match_query and not matches_query_loose(query, raw.title):
            continue
        brand, model = extract_brand_model(raw.title)
        offers.append(
            OfferModel(
                offer_id=_offer_id(raw.source, raw.title, raw.price_amount),
                source=raw.source,
                country=raw.country,
                store=raw.store,
                title=raw.title,
                brand=brand,
                model=model,
                image_url=raw.image_url,
                price=build_price(raw.price_amount, raw.price_currency),
                url=raw.url,
                captured_at=raw.captured_at,
            )
        )
    return offers


def _run_adapters(adapters: list[SourceAdapter], query: str) -> list[OfferModel]:
    """Run a specific set of adapters and return filtered OfferModels."""
    offers: list[OfferModel] = []
    for adapter in adapters:
        raw_offers = adapter.search(query)
        log.info("  adapter %-20s → %d raw offers", adapter.source_id, len(raw_offers))
        offers.extend(_convert_raw_offers(raw_offers, query))
    return offers


def _collect_offers(query: str, country: CountryFilter) -> list[OfferModel]:
    adapters = [
        a for a in get_adapters()
        if country == CountryFilter.ALL or a.country == country.value
    ]
    return _run_adapters(adapters, query)


import re as _re

_SKU_RE = _re.compile(
    r"\bcfi[.\-]?\w+\b"           # PlayStation SKU codes (CFI-2115B, CFI-Y1001)
    r"|\bcuh[.\-]?\w+\b"          # PS4 SKU codes
    r"|\b\d+\s*(?:gb|tb)\b"       # storage sizes (825GB, 1TB)
    r"|\b\d+\s*ssd\b"             # SSD variants
    r"|\b[a-z]{1,3}[.\-]?\d{4,}\w*\b"  # generic model codes (HAC-001, etc.)
    , _re.IGNORECASE
)

_CONSOLE_LUT_KEY_RE = _re.compile(r"^(playstation_[1-9]|xbox_series|xbox_one|nintendo_switch)")

# Category words used by PY stores that don't appear in BR store titles.
_CATEGORY_PREFIX_RE = _re.compile(
    r"\b(celular|cel|smartphone|aparelho|tablet|notebook)\b", _re.IGNORECASE
)

# Patterns to detect specific phone brands for clean BR query generation.
_IPHONE_RE = _re.compile(
    r"\biphone\s+(\d{1,2})(?:\s+(pro\s+max|pro\s+plus|pro|plus|max|mini))?\b", _re.IGNORECASE
)
_SAMSUNG_RE = _re.compile(
    r"\b(galaxy\s+[a-z]\d{1,2}(?:\s+(?:ultra|plus|fe|s|e))?)\b", _re.IGNORECASE
)


def _br_queries_from_py_offers(py_offers: list[OfferModel], original_query: str) -> list[str]:
    """
    Derive clean, deduplicated BR search queries from PY offers.

    Strategy:
    - For each PY offer, resolve to a LUT canonical name (e.g. "PlayStation 5 Slim").
    - Append "Digital" when the offer is a digital edition.
    - Strip bundles/games — BR is searched for the base product so prices are comparable.
    - For non-LUT products, strip SKU codes / storage from the title.
    - Deduplicate by base key; cap at 6 queries to avoid excess adapter calls.
    - Fall back to the original query if nothing could be derived.
    """
    from app.services.product_lut import lookup as lut_lookup

    seen_keys: set[str] = set()
    queries: list[str] = []

    for offer in py_offers:
        text = expand_gaming_aliases(normalize_text(offer.title))
        entry = lut_lookup(text)

        if entry:
            base_key = entry.key
            display = entry.display  # e.g. "PlayStation 5 Slim"

            # For consoles: add Digital if relevant; strip bundle (search base model in BR)
            if _CONSOLE_LUT_KEY_RE.match(base_key):
                if _re.search(r"\bdigital\b", text):
                    base_key = f"{base_key}_digital"
                    display = f"{display} Digital"
                # _bundle intentionally dropped — search for the base console in BR

            if base_key not in seen_keys:
                seen_keys.add(base_key)
                queries.append(display.lower())
        else:
            # Non-LUT product: build a clean BR-friendly query.

            # iPhone: extract "apple iphone X variant storage" precisely.
            iphone_m = _IPHONE_RE.search(text)
            if iphone_m:
                number = iphone_m.group(1)
                variant = (iphone_m.group(2) or "").strip()
                storage_m = _re.search(r"\b(\d+)\s*(gb|tb)\b", text, _re.IGNORECASE)
                storage = f" {storage_m.group(1)}{storage_m.group(2)}" if storage_m else ""
                base_key = f"iphone {number} {variant}".strip()
                clean = _re.sub(r"\s+", " ", f"apple iphone {number} {variant}{storage}").strip()
            else:
                # Generic: strip SKU codes, storage, and PY category prefixes,
                # then take the first 4 meaningful tokens.
                cleaned = _SKU_RE.sub(" ", text)
                cleaned = _CATEGORY_PREFIX_RE.sub(" ", cleaned)
                cleaned = _re.sub(r"\s+", " ", cleaned).strip()
                tokens = cleaned.split()[:4]
                clean = " ".join(tokens)
                base_key = clean

            if clean and base_key not in seen_keys:
                seen_keys.add(base_key)
                queries.append(clean)

    if not queries:
        return [original_query]

    # Always include original query as final fallback (deduped)
    if original_query not in seen_keys:
        queries.append(original_query)

    return queries[:6]  # cap to avoid too many adapter calls


def _filter_br_by_py(br_offers: list[OfferModel], py_offers: list[OfferModel], query: str) -> list[OfferModel]:
    """As buscas BR derivadas dos títulos PY são longas ("celimax heart pink tone") e o
    filtro frouxo aceita metade das palavras — voltava "Livro Pink Heart Jam". Palavra da
    busca original que está em TODAS as ofertas PY (a marca, o modelo) tem que estar na
    oferta BR também. "ps5" não exige nada (os títulos dizem "playstation 5")."""
    if not py_offers:
        return br_offers
    py_token_sets = [set(tokenize(o.title)) for o in py_offers]
    required = {t for t in tokenize(query) if len(t) > 1 and all(t in toks for toks in py_token_sets)}
    if not required:
        return br_offers
    return [o for o in br_offers if required <= set(tokenize(o.title))]


BR_WORKERS = 6


def scrape_offers(query: str, country: CountryFilter) -> list[OfferModel]:
    """Scrape live offers from all adapters. Returns raw OfferModel list, no grouping."""
    normalized_query = normalize_text(query)
    all_adapters = get_adapters()

    if country == CountryFilter.ALL:
        py_adapters = [a for a in all_adapters if a.country == "py"]
        br_adapters = [a for a in all_adapters if a.country == "br"]

        py_offers = _run_adapters(py_adapters, normalized_query)

        # Build one clean BR query per unique product group found in PY,
        # stripping SKU codes, storage sizes, and bundle games.
        br_queries = _br_queries_from_py_offers(py_offers, normalized_query)
        log.info("BR queries derived from PY: %s", br_queries)

        # Todas as buscas BR (consulta × fonte) ao mesmo tempo — em sequência eram até
        # 6 × 2 requisições, cada uma podendo esperar o timeout do site.
        pairs = [(a, q) for q in dict.fromkeys(br_queries) for a in br_adapters]
        with ThreadPoolExecutor(max_workers=max(1, min(BR_WORKERS, len(pairs)))) as pool:
            results = list(pool.map(lambda pair: _run_adapters([pair[0]], pair[1]), pairs))
        br_offers: list[OfferModel] = [o for chunk in results for o in chunk]

        return py_offers + _filter_br_by_py(br_offers, py_offers, normalized_query)
    else:
        return _collect_offers(normalized_query, country)


def _log_lut_misses(misses: list[tuple[str, str, str]]) -> None:
    """Upsert LUT-miss entries — fire-and-forget, never raises."""
    if not misses:
        return
    try:
        from app.models import UnknownProduct  # local import avoids circular deps
        now = datetime.now(UTC)
        db = SessionLocal()
        try:
            for title_norm, query, category in misses:
                existing = db.query(UnknownProduct).filter_by(title_norm=title_norm, category=category).first()
                if existing:
                    existing.hit_count += 1
                    existing.last_seen = now
                else:
                    db.add(UnknownProduct(
                        title_norm=title_norm, query=query, category=category,
                        hit_count=1, first_seen=now, last_seen=now,
                    ))
            db.commit()
        finally:
            db.close()
    except Exception:
        log.debug("_log_lut_misses failed", exc_info=True)


def build_group_model(
    product_key: str,
    family_key: str,
    canonical_name: str,
    confidence: float,
    group_offers_list: list[OfferModel],
    concentration: str | None,
    volume_ml: str | None,
    voltage: str | None,
    sort: SortOption = SortOption.BEST_MATCH,
) -> ProductGroupModel:
    """Build a single ProductGroupModel from one already-grouped tuple (as returned by
    matcher.group_offers). Shared by build_response_from_offers's per-query loop and by
    any endpoint that resolves a single known product_key against a seller's live offers
    (e.g. GET /highlights) without running a full search."""
    brand, line = _brand_line(product_key, family_key, group_offers_list)
    sorted_offers = (
        sorted(group_offers_list, key=lambda offer: offer.price.amount_brl)
        if sort == SortOption.LOWEST_PRICE
        else group_offers_list
    )
    return ProductGroupModel(
        product_key=product_key,
        family_key=family_key,
        canonical_name=canonical_name,
        match_confidence=confidence,
        product_image_url=_select_group_image(group_offers_list),
        offers=sorted_offers,
        preview_offers=_compute_preview_offers(group_offers_list),
        cheapest=_compute_cheapest(sorted_offers),
        concentration=concentration,
        volume_ml=volume_ml,
        voltage=voltage,
        brand=brand,
        line=line,
    )


def _brand_line(product_key: str, family_key: str, offers: list[OfferModel]) -> tuple[str | None, str | None]:
    """Marca e nome do produto sem a marca — "Victoria's Secret" / "Love Spell",
    "JBL" / "Flip 6" — pros catálogos de perfume (LUT + minerado) e de eletrônicos."""
    if not product_key.startswith("perfume"):
        product = next((m for m in map(match_product, (o.title for o in offers)) if m and m.key == family_key), None)
        return (product.brand, product.model) if product else (None, None)
    matches = [m for m in map(identify, (o.title for o in offers)) if m]
    named = next((m for m in matches if m.fragrance), None)
    if named:
        return named.brand, named.fragrance
    return (matches[0].brand if matches else None), None


def _fallback_line(family_key: str, query_norm: str) -> str | None:
    """Perfume fora da LUT: nome do produto = chave do grupo sem as palavras da busca
    (buscou "victoria secret" → "victoria secret amber romance" vira "Amber Romance")."""
    query_tokens = set(query_norm.split())
    rest = [t for t in family_key.split() if t not in query_tokens]
    if not rest or len(rest) == len(family_key.split()):
        return None
    return " ".join(rest).title()


def build_response_from_offers(
    query: str,
    offers: list[OfferModel],
    sort: SortOption,
    country: CountryFilter,
) -> CompareResponseModel:
    """Group a pre-collected list of offers into the compare response."""
    normalized_query = normalize_text(query)
    grouped, lut_misses = group_offers(normalized_query, offers)
    _log_lut_misses(lut_misses)

    groups: list[ProductGroupModel] = [
        build_group_model(product_key, family_key, canonical_name, confidence, group_offers_list, concentration, volume_ml, voltage, sort)
        for product_key, family_key, canonical_name, confidence, group_offers_list, concentration, volume_ml, voltage in grouped
    ]
    for group in groups:
        if group.product_key.startswith("perfume") and not group.line:
            group.line = _fallback_line(group.family_key, normalized_query)

    return CompareResponseModel(query=query, generated_at=datetime.now(UTC), groups=groups)


def build_compare_response(query: str, country: CountryFilter, sort: SortOption) -> CompareResponseModel:
    """Convenience wrapper: scrape live + build response. Used by the refresh job."""
    offers = scrape_offers(query, country)
    return build_response_from_offers(query, offers, sort, country)
