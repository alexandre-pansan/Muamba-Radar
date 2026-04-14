from __future__ import annotations

import logging
from datetime import UTC, datetime

from app.adapters.base import SourceAdapter
from app.database import SessionLocal

log = logging.getLogger("muambaradar.adapters")
from app.adapters.registry import get_adapters
from app.schemas import CheapestModel, CompareResponseModel, CountryFilter, OfferModel, ProductGroupModel, SortOption
from app.services.fx import build_price
from app.services.matcher import group_offers
from app.services.normalization import (
    expand_gaming_aliases,
    extract_brand_model,
    is_refurbished_or_used,
    matches_query,
    matches_query_loose,
    normalize_text,
    slugify,
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


def _select_group_image(offers: list[OfferModel]) -> str | None:
    cp_with_image = [offer for offer in offers if offer.source == "comprasparaguai" and offer.image_url]
    if cp_with_image:
        return cp_with_image[0].image_url

    any_with_image = [offer for offer in offers if offer.image_url]
    return any_with_image[0].image_url if any_with_image else None


def _run_adapters(adapters: list[SourceAdapter], query: str) -> list[OfferModel]:
    """Run a specific set of adapters and return filtered OfferModels."""
    offers: list[OfferModel] = []
    for adapter in adapters:
        raw_offers = adapter.search(query)
        log.info("  adapter %-20s → %d raw offers", adapter.source_id, len(raw_offers))
        for raw in raw_offers:
            if is_refurbished_or_used(raw.title):
                continue
            # Use loose matching: the adapter already pre-filtered for relevance,
            # so we only need to guard against obvious mismatches and accessories.
            if not matches_query_loose(query, raw.title):
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
            # Non-LUT product: strip SKU codes and storage, use cleaned title
            cleaned = _SKU_RE.sub(" ", text)
            cleaned = _re.sub(r"\s+", " ", cleaned).strip()
            # Cap at first 4 meaningful tokens to avoid over-specific queries
            tokens = cleaned.split()[:4]
            cleaned = " ".join(tokens)
            if cleaned and cleaned not in seen_keys:
                seen_keys.add(cleaned)
                queries.append(cleaned)

    if not queries:
        return [original_query]

    # Always include original query as final fallback (deduped)
    if original_query not in seen_keys:
        queries.append(original_query)

    return queries[:6]  # cap to avoid too many adapter calls


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

        br_offers: list[OfferModel] = []
        seen_queries: set[str] = set()
        for br_q in br_queries:
            if br_q in seen_queries:
                continue
            seen_queries.add(br_q)
            br_offers.extend(_run_adapters(br_adapters, br_q))

        return py_offers + br_offers
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

    groups: list[ProductGroupModel] = []
    for product_key, family_key, canonical_name, confidence, group_offers_list, concentration, volume_ml, voltage in grouped:

        sorted_offers = (
            sorted(group_offers_list, key=lambda offer: offer.price.amount_brl)
            if sort == SortOption.LOWEST_PRICE
            else group_offers_list
        )

        groups.append(
            ProductGroupModel(
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
            )
        )

    return CompareResponseModel(query=query, generated_at=datetime.now(UTC), groups=groups)


def build_compare_response(query: str, country: CountryFilter, sort: SortOption) -> CompareResponseModel:
    """Convenience wrapper: scrape live + build response. Used by the refresh job."""
    offers = scrape_offers(query, country)
    return build_response_from_offers(query, offers, sort, country)
