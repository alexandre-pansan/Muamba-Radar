from __future__ import annotations

import re

from app.schemas import OfferModel
from app.services.normalization import expand_gaming_aliases, normalize_text, slugify

COLOR_MAP = {
    "black": "black",
    "blue": "blue",
    "green": "green",
    "pink": "pink",
    "yellow": "yellow",
    "white": "white",
    "purple": "purple",
    "red": "red",
    "preto": "black",
    "preta": "black",
    "azul": "blue",
    "verde": "green",
    "rosa": "pink",
    "amarelo": "yellow",
    "amarela": "yellow",
    "branco": "white",
    "branca": "white",
    "roxo": "purple",
    "roxa": "purple",
    "vermelho": "red",
    "vermelha": "red",
}

# Words that distinguish product tiers — must never be merged across groups
_VARIANT_SUFFIXES = frozenset({"pro", "plus", "max", "ultra", "lite", "mini", "oled", "slim"})

PERFUME_HINTS = (
    "perfume",
    "parfum",
    "eau de parfum",
    "eau de toilette",
    "eau de cologne",
    "extrait de parfum",
    "parfum de toilette",
    "edp",
    "edt",
    "edc",
    "cologne",
    "elixir",
)

PERFUME_STOPWORDS = {
    "perfume",
    "parfum",
    "eau",
    "de",
    "toilette",
    "cologne",
    "elixir",
    "extrait",
    "masculino",
    "feminino",
    "unissex",
    "for",
    "men",
    "women",
    "ml",
}


def _perfume_query_tokens(query: str) -> list[str]:
    tokens = normalize_text(query).split()
    return [
        token
        for token in tokens
        if token not in PERFUME_STOPWORDS and not re.search(r"^\d+(ml|g)?$", token) and token not in {"edp", "edt"}
    ]


def _extract_storage_and_ram(title: str) -> tuple[str | None, str | None]:
    text = normalize_text(title)

    ram = None
    ram_match = re.search(r"\b(\d{1,2})\s?gb\s*ram\b", text) or re.search(r"\bram\s*(\d{1,2})\s?gb\b", text)
    if ram_match:
        ram = f"{ram_match.group(1)}gb"

    storage = None
    tb_match = re.search(r"\b(\d{1,2})\s?tb\b", text)
    if tb_match:
        storage = f"{tb_match.group(1)}tb"

    gb_values = [int(match.group(1)) for match in re.finditer(r"\b(\d{1,4})\s?gb\b", text)]
    if gb_values and storage is None:
        likely_storage = [value for value in gb_values if value >= 64]
        if likely_storage:
            storage = f"{max(likely_storage)}gb"
        else:
            storage = f"{max(gb_values)}gb"

    if ram is None and len(gb_values) >= 2:
        likely_ram = [value for value in gb_values if value <= 24]
        if likely_ram:
            ram = f"{min(likely_ram)}gb"

    return storage, ram


def _extract_color(title: str) -> str | None:
    text = normalize_text(title)
    for token, canonical in COLOR_MAP.items():
        if re.search(rf"\b{re.escape(token)}\b", text):
            return canonical
    return None


def _extract_volume_ml(title: str) -> str | None:
    text = normalize_text(title)
    match = re.search(r"\b(\d{2,4})\s?ml\b", text)
    return f"{match.group(1)}ml" if match else None


def _extract_perfume_concentration(title: str) -> str | None:
    text = normalize_text(title)
    # Check most-specific multi-word phrases first
    if "extrait de parfum" in text or re.search(r"\bextrait\b", text):
        return "Extrait"
    if "elixir" in text:
        return "Elixir"
    if "eau de parfum" in text or re.search(r"\bedp\b", text):
        return "EDP"
    if "eau de toilette" in text or re.search(r"\bedt\b", text):
        return "EDT"
    if "eau de cologne" in text or re.search(r"\bedc\b", text):
        return "EDC"
    if re.search(r"\bcologne\b", text):
        return "Cologne"
    if re.search(r"\bparfum\b", text):
        return "Parfum"
    return None


def _is_perfume_offer(offer: OfferModel) -> bool:
    text = normalize_text(offer.title)
    return any(hint in text for hint in PERFUME_HINTS)


def _perfume_name_key(offer: OfferModel, query: str) -> str:
    text = normalize_text(offer.title)
    # Strip volume and concentration markers so they don't end up in the family key
    text = re.sub(r"\b(\d{2,4})\s?ml\b", " ", text)
    text = re.sub(r"\b(edp|edt|edc)\b", " ", text)
    text = re.sub(r"\belixir\b", " ", text)
    text = re.sub(r"\bextrait\b", " ", text)
    text = re.sub(r"\beau de parfum\b|\beau de toilette\b|\beau de cologne\b", " ", text)
    text = re.sub(r"\bextrait de parfum\b|\bparfum de toilette\b", " ", text)

    query_tokens = _perfume_query_tokens(query)
    title_tokens = set(text.split())
    from_query = [token for token in query_tokens if token in title_tokens]
    if from_query:
        return " ".join(from_query[:3])

    tokens = [token for token in text.split() if token not in PERFUME_STOPWORDS]
    # Keep first meaningful chunk as perfume family/name.
    return " ".join(tokens[:5]) if tokens else "perfume"


def _base_model_key(offer: OfferModel) -> str:
    text = normalize_text(offer.title)
    # Normalize gaming aliases so "ps5" and "playstation 5" produce the same key
    text = expand_gaming_aliases(text)

    # Detect critical variant suffixes present in the title (must never be merged)
    # Use a meaningful order (pro before max, etc.) rather than alphabetical
    _SUFFIX_ORDER = {"ultra": 0, "pro": 1, "plus": 2, "max": 3, "slim": 4, "oled": 5, "lite": 6, "mini": 7}
    variants = sorted(
        (s for s in _VARIANT_SUFFIXES if re.search(rf"\b{s}\b", text)),
        key=lambda s: _SUFFIX_ORDER.get(s, 99),
    )

    if offer.brand and offer.model:
        base = normalize_text(f"{offer.brand} {offer.model}")
        return f"{base} {' '.join(variants)}" if variants else base

    iphone_match = re.search(r"\biphone\s+(\d{1,2})(?:\s+(pro max|pro|plus|max|mini))?\b", text)
    if iphone_match:
        number = iphone_match.group(1)
        suffix = iphone_match.group(2) or ""
        return normalize_text(f"apple iphone {number} {suffix}".strip())

    # PlayStation (after alias expansion "ps5" → "playstation 5")
    ps_match = re.search(r"\bplaystation\s+(\d)\b", text)
    if ps_match:
        number = ps_match.group(1)
        suffix_str = " ".join(variants)
        return normalize_text(f"playstation {number} {suffix_str}".strip())

    # Xbox Series X/S
    xbox_series = re.search(r"\bxbox\s+series\s+([xs])\b", text)
    if xbox_series:
        letter = xbox_series.group(1)
        suffix_str = " ".join(v for v in variants if v not in {"pro"})  # series x/s already specific
        return normalize_text(f"xbox series {letter} {suffix_str}".strip())

    # Xbox One (X/S/base)
    xbox_one = re.search(r"\bxbox\s+one\b", text)
    if xbox_one:
        suffix_str = " ".join(variants)
        return normalize_text(f"xbox one {suffix_str}".strip())

    # Nintendo Switch (Lite / OLED / base)
    switch_match = re.search(r"\bnintendo\s+switch\b", text)
    if switch_match:
        suffix_str = " ".join(variants)
        return normalize_text(f"nintendo switch {suffix_str}".strip())

    text = re.sub(r"\b\d{1,4}\s?(gb|tb)\b", " ", text)
    text = re.sub(r"\bram\b", " ", text)
    for token in COLOR_MAP:
        text = re.sub(rf"\b{re.escape(token)}\b", " ", text)

    cleaned = re.sub(r"\s+", " ", text).strip()
    tokens = cleaned.split()
    # 6 tokens to capture e.g. "xiaomi redmi note 15 pro 5g"
    return " ".join(tokens[:6]) if tokens else "product"


def _canonical_name(base_model: str, storage: str | None, ram: str | None, offers: list[OfferModel]) -> str:
    sample = min(offers, key=lambda offer: len(offer.title))

    if sample.brand and sample.model:
        name = f"{sample.brand} {sample.model}"
    else:
        name = sample.title

    details = [detail.upper() for detail in (storage, ram) if detail]
    return f"{name} ({', '.join(details)})" if details else name


def _canonical_perfume_name(name_key: str, concentration: str | None, volume_ml: str | None, offers: list[OfferModel]) -> str:
    # Use the cleaned name_key as base (already stripped of ml/concentration)
    base = name_key.title()
    details: list[str] = []
    if concentration:
        details.append(concentration)
    if volume_ml:
        details.append(volume_ml.upper())
    return f"{base} ({', '.join(details)})" if details else base


def group_offers(
    query: str, offers: list[OfferModel]
) -> list[tuple[str, str, str, float, list[OfferModel], str | None, str | None]]:
    """Return list of (product_key, family_key, canonical_name, confidence, offers, concentration, volume_ml).
    concentration/volume_ml are non-None only for perfume groups.
    """
    grouped: dict[tuple[str, str, str | None, str | None], list[OfferModel]] = {}

    for offer in offers:
        if _is_perfume_offer(offer):
            perfume_name = _perfume_name_key(offer, query)
            concentration = _extract_perfume_concentration(offer.title)
            volume_ml = _extract_volume_ml(offer.title)
            key = ("perfume", perfume_name, volume_ml, concentration)
            grouped.setdefault(key, []).append(offer)
            continue

        storage, _ram = _extract_storage_and_ram(offer.title)
        base = _base_model_key(offer)
        # RAM is intentionally excluded from the key: PY listings often include
        # RAM in the title (e.g. "256GB 8GB") while BR listings don't, which
        # would create duplicate groups for the same product.
        key = ("default", base, storage, None)
        grouped.setdefault(key, []).append(offer)

    response: list[tuple[str, str, str, float, list[OfferModel], str | None, str | None]] = []
    for (group_type, base, storage, ram), grouped_offers in grouped.items():
        if group_type == "perfume":
            # In the key: storage slot holds volume_ml, ram slot holds concentration
            volume_ml = storage
            concentration = ram
            canonical_name = _canonical_perfume_name(base, concentration, volume_ml, grouped_offers)
            product_key = slugify(f"perfume {base} {volume_ml or ''} {concentration or ''}")
            response.append((product_key, base, canonical_name, 1.0, grouped_offers, concentration, volume_ml))
        else:
            canonical_name = _canonical_name(base, storage, None, grouped_offers)
            product_key = slugify(f"{base} {storage or ''}")
            response.append((product_key, base, canonical_name, 1.0, grouped_offers, None, None))

    return response
