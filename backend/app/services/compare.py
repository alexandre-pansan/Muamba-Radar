from __future__ import annotations

import logging
from collections import Counter
from datetime import UTC, datetime

from app.adapters.base import SourceAdapter

log = logging.getLogger("muambaradar.adapters")
from app.adapters.registry import get_adapters
from app.schemas import CheapestModel, CompareResponseModel, CountryFilter, OfferModel, ProductGroupModel, SortOption
from app.services.fx import build_price
from app.services.matcher import group_offers
from app.services.normalization import (
    extract_brand_model,
    is_refurbished_or_used,
    matches_query,
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
            if not matches_query(query, raw.title):
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


def _refine_query_from_py_offers(py_offers: list[OfferModel], original_query: str) -> str:
    """
    Extract brand + model from PY offer titles for a cleaner BR search.
    Storage/RAM excluded — BR titles rarely list them, causing false rejections.
    """
    if not py_offers:
        return original_query

    brands: list[str] = []
    models: list[str] = []

    for offer in py_offers:
        brand, model = extract_brand_model(offer.title)
        if brand:
            brands.append(brand.lower())
        if model:
            models.append(model.lower())

    def most_common(values: list[str]) -> str | None:
        if not values:
            return None
        return Counter(values).most_common(1)[0][0]

    brand = most_common(brands)
    model = most_common(models)

    parts: list[str] = []
    if brand:
        parts.append(brand)
    if model:
        parts.append(model)

    if not parts:
        return original_query

    refined = " ".join(parts)
    return refined if refined != original_query else original_query


def scrape_offers(query: str, country: CountryFilter) -> list[OfferModel]:
    """Scrape live offers from all adapters. Returns raw OfferModel list, no grouping."""
    normalized_query = normalize_text(query)
    all_adapters = get_adapters()

    if country == CountryFilter.ALL:
        py_adapters = [a for a in all_adapters if a.country == "py"]
        br_adapters = [a for a in all_adapters if a.country == "br"]

        py_offers = _run_adapters(py_adapters, normalized_query)
        refined_query = _refine_query_from_py_offers(py_offers, normalized_query)
        br_offers = _run_adapters(br_adapters, refined_query)
        return py_offers + br_offers
    else:
        return _collect_offers(normalized_query, country)


def build_response_from_offers(
    query: str,
    offers: list[OfferModel],
    sort: SortOption,
    country: CountryFilter,
) -> CompareResponseModel:
    """Group a pre-collected list of offers into the compare response."""
    normalized_query = normalize_text(query)
    grouped = group_offers(normalized_query, offers)

    groups: list[ProductGroupModel] = []
    for product_key, family_key, canonical_name, confidence, group_offers_list, concentration, volume_ml in grouped:

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
            )
        )

    return CompareResponseModel(query=query, generated_at=datetime.now(UTC), groups=groups)


def build_compare_response(query: str, country: CountryFilter, sort: SortOption) -> CompareResponseModel:
    """Convenience wrapper: scrape live + build response. Used by the refresh job."""
    offers = scrape_offers(query, country)
    return build_response_from_offers(query, offers, sort, country)
