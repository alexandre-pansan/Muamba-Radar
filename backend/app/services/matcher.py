from __future__ import annotations

import re

from app.schemas import OfferModel
from app.services.normalization import expand_gaming_aliases, normalize_text, slugify
from app.services.product_lut import lookup as lut_lookup, lookup_perfume as lut_perfume

# Gaming brands — brand+model shortcut is unreliable for these; let specific patterns handle them
_GAMING_BRANDS = frozenset({"sony", "microsoft", "nintendo", "valve", "sega"})

# Proper capitalisation for display names derived from normalised keys
_DISPLAY_OVERRIDES: dict[str, str] = {
    "playstation": "PlayStation",
    "xbox": "Xbox",
    "nintendo": "Nintendo",
    "switch": "Switch",
    "logitech": "Logitech",
    "thrustmaster": "Thrustmaster",
    "fanatec": "Fanatec",
    "hori": "Hori",
    "vr2": "VR2",
    "vr": "VR",
    "oled": "OLED",
    "slim": "Slim",
    "pro": "Pro",
    "lite": "Lite",
    "portal": "Portal",
    "move": "Move",
}


def _gaming_display_name(base_model: str) -> str:
    """Title-case a normalised base_model string with brand/product overrides."""
    return " ".join(_DISPLAY_OVERRIDES.get(w, w.title()) for w in base_model.split())

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
    "body splash",
    "body mist",
    "splash corporal",
    "oleo corporal",
    "óleo corporal",
    "oil concentrated",
    "oil concentrado",
    "oleo concentrado",
    "óleo concentrado",
    "body lotion",
    "loção corporal",
    "locao corporal",
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
    # Body/skincare formats — check before parfum keywords
    if re.search(r"\boleo\s+corporal\b|\boleo\s+concentrado\b|oil\s+concentrat", text):
        return "Body Oil"
    if re.search(r"\bbody\s+splash\b|\bsplash\s+corporal\b", text):
        return "Body Splash"
    if re.search(r"\bbody\s+mist\b", text):
        return "Body Mist"
    if re.search(r"\bbody\s+lotion\b|\blocao\s+corporal\b", text):
        return "Body Lotion"
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

    # LUT first — gives stable key for known fragrances
    lut = lut_perfume(text)
    if lut:
        return lut.key

    # Fallback: strip volume/concentration markers then extract by query tokens
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
    return " ".join(tokens[:5]) if tokens else "perfume"


def _base_model_key(offer: OfferModel) -> str:
    text = normalize_text(offer.title)
    # Normalize gaming aliases so "ps5" and "playstation 5" produce the same key
    text = expand_gaming_aliases(text)

    # LUT takes priority over all heuristics — returns stable key if matched
    lut_entry = lut_lookup(text)
    if lut_entry:
        return lut_entry.key

    # Detect critical variant suffixes present in the title (must never be merged)
    # Use a meaningful order (pro before max, etc.) rather than alphabetical
    _SUFFIX_ORDER = {"ultra": 0, "pro": 1, "plus": 2, "max": 3, "slim": 4, "oled": 5, "lite": 6, "mini": 7}
    variants = sorted(
        (s for s in _VARIANT_SUFFIXES if re.search(rf"\b{s}\b", text)),
        key=lambda s: _SUFFIX_ORDER.get(s, 99),
    )

    # For non-gaming brands, brand+model shortcut is reliable
    if offer.brand and offer.model and offer.brand.lower() not in _GAMING_BRANDS:
        base = normalize_text(f"{offer.brand} {offer.model}")
        return f"{base} {' '.join(variants)}" if variants else base

    iphone_match = re.search(r"\biphone\s+(\d{1,2})(?:\s+(pro max|pro|plus|max|mini))?\b", text)
    if iphone_match:
        number = iphone_match.group(1)
        suffix = iphone_match.group(2) or ""
        return normalize_text(f"apple iphone {number} {suffix}".strip())

    # PlayStation Portal (must come before generic ps number match)
    if re.search(r"\bplaystation\s+portal\b", text):
        return "playstation portal"

    # PlayStation VR2 / VR
    vr_match = re.search(r"\bplaystation\s+(vr2?)\b", text)
    if vr_match:
        return normalize_text(f"playstation {vr_match.group(1)}")

    # PlayStation Move
    if re.search(r"\bplaystation\s+move\b", text):
        return "playstation move"

    # PlayStation numbered console (after alias expansion "ps5" → "playstation 5")
    ps_match = re.search(r"\bplaystation\s+(\d)\b", text)
    if ps_match:
        number = ps_match.group(1)
        suffix_str = " ".join(variants)
        return normalize_text(f"playstation {number} {suffix_str}".strip())

    # Xbox Series X/S
    xbox_series = re.search(r"\bxbox\s+series\s+([xs])\b", text)
    if xbox_series:
        letter = xbox_series.group(1)
        suffix_str = " ".join(v for v in variants if v not in {"pro"})
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

    # Volante / racing wheel — keep brand + product type
    volante_match = re.search(r"\b(volante|racing\s+wheel|steering\s+wheel)\b", text)
    if volante_match:
        wheel_brand = next((b for b in ("logitech", "thrustmaster", "fanatec", "hori") if b in text), None)
        model_code = re.search(r"\b(g\d{2,3}|t\d{3}|t-?\d{3}|csl|dd\s*pro)\b", text)
        parts = [wheel_brand or "", model_code.group(1) if model_code else "", "volante"]
        return normalize_text(" ".join(p for p in parts if p).strip())

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

    # LUT gives the authoritative display name when available
    lut_entry = lut_lookup(expand_gaming_aliases(normalize_text(sample.title)))
    if lut_entry:
        name = lut_entry.display
    else:
        brand_norm = (sample.brand or "").lower()
        if sample.brand and sample.model and brand_norm not in _GAMING_BRANDS:
            name = f"{sample.brand} {sample.model}"
        else:
            name = _gaming_display_name(base_model)

    details = [detail.upper() for detail in (storage, ram) if detail]
    return f"{name} ({', '.join(details)})" if details else name


def _canonical_perfume_name(name_key: str, concentration: str | None, volume_ml: str | None, offers: list[OfferModel]) -> str:
    # LUT gives authoritative "Brand Fragrance" display name
    sample = min(offers, key=lambda o: len(o.title))
    lut = lut_perfume(normalize_text(sample.title))
    if lut:
        base = f"{lut.brand} {lut.fragrance}"
    else:
        base = name_key.title()

    details: list[str] = []
    if concentration:
        details.append(concentration)
    if volume_ml:
        details.append(volume_ml.upper())
    return f"{base} ({', '.join(details)})" if details else base


def group_offers(
    query: str, offers: list[OfferModel]
) -> tuple[list[tuple[str, str, str, float, list[OfferModel], str | None, str | None]], list[tuple[str, str, str]]]:
    """Return (groups, lut_misses).
    groups: list of (product_key, family_key, canonical_name, confidence, offers, concentration, volume_ml).
    lut_misses: list of (title_norm, query, category) for offers that didn't match any LUT entry.
    """
    grouped: dict[tuple[str, str, str | None, str | None], list[OfferModel]] = {}
    lut_misses: list[tuple[str, str, str]] = []

    for offer in offers:
        if _is_perfume_offer(offer):
            text_norm = normalize_text(offer.title)
            if not lut_perfume(text_norm):
                lut_misses.append((text_norm, query, "perfume"))
            perfume_name = _perfume_name_key(offer, query)
            concentration = _extract_perfume_concentration(offer.title)
            if concentration is None:
                lut_entry = lut_perfume(normalize_text(offer.title))
                if lut_entry and lut_entry.concentration:
                    concentration = lut_entry.concentration
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

    return response, lut_misses
