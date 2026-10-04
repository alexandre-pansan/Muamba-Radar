from __future__ import annotations

import re

from app.schemas import OfferModel
from app.services.normalization import expand_gaming_aliases, normalize_text, slugify
from app.services.product_lut import lookup as lut_lookup, lookup_perfume as lut_perfume
from app.services.perfume_catalog import identify as identify_perfume, match_perfume as catalog_perfume
from app.services.product_catalog import match_product as catalog_product

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
    "digital": "Digital",
    "bundle": "Bundle",
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


def _extract_voltage(title: str) -> str | None:
    text = normalize_text(title)
    if re.search(r"\b(bivolt|dual\s*volt|bivoltage)\b", text):
        return "Bivolt"
    if re.search(r"\b(110|127)\s*v\b", text):
        return "127V"
    if re.search(r"\b(220|240)\s*v\b", text):
        return "220V"
    return None


# Formatos de corpo: nomes diferentes pro mesmo produto. Body Mist, Splash, Brume e
# Colônia Corporal são todos o spray corporal de 250ml — um grupo só ("Body Splash").
# Loção/creme/hidratante corporal idem ("Body Lotion").
_BODY_OIL_RE = re.compile(r"\boleo\s+corporal\b|\boleo\s+concentrado\b|\bbody\s+oil\b|oil\s+concentrat")
_BODY_LOTION_RE = re.compile(
    r"\bbody\s+(lotion|cream|butter)\b|\bfragrance\s+lotion\b"
    r"|\blotion\b|\blocao\b|\blocion\s+(corporal|hidratante)\b|\bcrema\s+corporal\b"
    r"|\bcreme\s+(corporal|hidratante|para\s+o\s+corpo)\b|\bhidratante\s+corporal\b"
)
_BODY_SPLASH_RE = re.compile(
    r"\bbody\s+(splash|mist|spray)\b|\bsplash\b|\bbrume\b|\bbruma\b|\bfragrance\s+mist\b"
    r"|\bmist\s+corporal\b|\bcolonia\s+(corporal|body)\b"
)


def _extract_perfume_concentration(title: str) -> str | None:
    text = normalize_text(title)
    # Body/skincare formats — check before parfum keywords
    if _BODY_OIL_RE.search(text):
        return "Body Oil"
    if _BODY_LOTION_RE.search(text):
        return "Body Lotion"
    if _BODY_SPLASH_RE.search(text):
        return "Body Splash"
    # Check most-specific multi-word phrases first
    if "extrait de parfum" in text or re.search(r"\bextrait\b", text):
        return "Extrait"
    if "elixir" in text:
        return "Elixir"
    if "eau de parfum" in text or re.search(r"\bedp\b", text) or re.search(r"\bparfum\b", text):
        return "EDP"
    if "eau de toilette" in text or re.search(r"\bedt\b", text):
        return "EDT"
    if "eau de cologne" in text or re.search(r"\bedc\b", text):
        return "EDC"
    if re.search(r"\bcologne\b", text):
        return "Cologne"
    return None


def _extract_screen_size(title: str) -> str | None:
    # Operates on the raw title (not normalize_text) — decimal points/commas
    # in "6.7 polegadas" would otherwise be stripped, breaking the size.
    match = re.search(r'\b(\d{1,2}[.,]\d)\s*(?:polegadas|pol\.?|")', title, re.IGNORECASE)
    if match:
        return f'{match.group(1).replace(",", ".")}"'
    match = re.search(r'\b(\d{1,2})\s*(?:polegadas|pol\b)', title, re.IGNORECASE)
    return f'{match.group(1)}"' if match else None


def extract_specs(title: str) -> dict[str, str]:
    """Structured attributes parsed from a title, for cataloguing (ProductOffer.specs)."""
    storage, ram = _extract_storage_and_ram(title)
    specs = {
        "storage": storage,
        "ram": ram,
        "color": _extract_color(title),
        "volume_ml": _extract_volume_ml(title),
        "voltage": _extract_voltage(title),
        "perfume_concentration": _extract_perfume_concentration(title),
        "screen_size": _extract_screen_size(title),
    }
    return {key: value for key, value in specs.items() if value is not None}


def _is_perfume_offer(offer: OfferModel) -> bool:
    text = normalize_text(offer.title)
    if any(hint in text for hint in PERFUME_HINTS):
        return True
    # "Victoria's Secret Splash Love Spell 250ml", "Colônia Corporal ...", fragrância
    # conhecida da LUT: só com volume em ml, pra "splash" de outra coisa não entrar.
    has_ml = bool(re.search(r"\b\d{2,4}\s?ml\b", text))
    lut = lut_perfume(text) is not None or (has_ml and catalog_perfume(offer.title) is not None)
    body_format = bool(
        _BODY_SPLASH_RE.search(text) or _BODY_LOTION_RE.search(text) or re.search(r"\b(colonia|locion)\b", text)
    )
    return (body_format and (has_ml or lut)) or (lut and has_ml)


# Palavras de formato/embalagem que não fazem parte do nome do perfume
_BODY_FORMAT_WORDS_RE = re.compile(
    r"\b(body|splash|mist|spray|brume|bruma|parfumee|lotion|locao|creme|cream|butter|hidratante"
    r"|corporal|colonia|fragrance|oleo|oil|concentrado|locion|crema)\b"
)
_PERFUME_NOISE = frozenset({
    "promo", "promocao", "oferta", "original", "importado", "kit", "frasco", "danificado",
    "tester", "com", "sem", "caixa", "the", "and", "para", "corpo", "unisex",
    "perf", "uni", "fem", "masc", "unissex",
    "feminina", "masculina", "femenino", "femenina", "masculino", "mujer", "hombre", "new", "nova", "novo",
})


# Conectivos dentro de nomes ("Qaed Al Fursan", "Art Of Arabia") — não contam como palavra
_NAME_CONNECTORS = frozenset({"al", "el", "of", "de", "da", "do", "la", "le", "me", "my", "in", "on", "by"})


def _perfume_name_key(offer: OfferModel, query: str) -> str:
    text = normalize_text(offer.title)

    # LUT curada + catálogo minerado (app/data/perfume_catalog.json) — chave estável
    known = identify_perfume(offer.title)
    if known and (known.fragrance or lut_perfume(text)):
        return known.key

    # Fallback: strip volume/concentration markers then extract by query tokens
    text = re.sub(r"\b(\d{2,4})\s?ml\b", " ", text)
    text = re.sub(r"\b(edp|edt|edc)\b", " ", text)
    text = re.sub(r"\belixir\b", " ", text)
    text = re.sub(r"\bextrait\b", " ", text)
    text = re.sub(r"\beau de parfum\b|\beau de toilette\b|\beau de cologne\b", " ", text)
    text = re.sub(r"\bextrait de parfum\b|\bparfum de toilette\b", " ", text)

    text = re.sub(r"\bvictorias\b", "victoria s", text)  # "Victorias Secret" sem apóstrofo
    text = _BODY_FORMAT_WORDS_RE.sub(" ", text)
    tokens = [
        t for t in text.split()
        if t not in PERFUME_STOPWORDS and t not in _PERFUME_NOISE and len(t) > 1 and not t.isdigit()
    ]

    query_tokens = _perfume_query_tokens(query)
    from_query = [token for token in query_tokens if token in tokens]
    if from_query:
        # Busca pela marca ("victoria secret"): o que sobra do título é o nome do produto
        # (Amber Romance, Coconut Passion...). Sem isso, toda a marca virava um grupo só.
        rest: list[str] = []
        meaningful = 0
        for t in (t for t in tokens if t not in from_query):
            rest.append(t)
            if t not in _NAME_CONNECTORS:  # "Art Of Arabia" ≠ "Art Of Universe"
                meaningful += 1
                if meaningful == 2:
                    break
        while rest and rest[-1] in _NAME_CONNECTORS:
            rest.pop()
        return " ".join(from_query[:3] + rest)

    return " ".join(tokens[:5]) if tokens else "perfume"


_SPECIFIC_FAMILY_RE = re.compile(r"\b(iphone|playstation|xbox|nintendo\s+switch)\b")

_CATEGORY_PREFIX_RE = re.compile(
    r"^(?:protetor|bloqueador|filtro)\s+solar\s+"
)


def _base_model_key(offer: OfferModel) -> str:
    text = normalize_text(offer.title)
    # Normalize gaming aliases so "ps5" and "playstation 5" produce the same key
    text = expand_gaming_aliases(text)

    # Volante / racing wheel — MUST come before LUT to avoid "Volante G29 para PS5"
    # being matched as a PS5 console by the LUT's \bplaystation\s*5\b pattern.
    volante_early = re.search(r"\b(volante|racing\s+wheel|steering\s+wheel)\b", text)
    if volante_early:
        wheel_brand = next((b for b in ("logitech", "thrustmaster", "fanatec", "hori") if b in text), None)
        model_code = re.search(r"\b(g\d{2,3}|t\d{3}|t-?\d{3}|csl|dd\s*pro)\b", text)
        parts = [wheel_brand or "", model_code.group(1) if model_code else "", "volante"]
        return normalize_text(" ".join(p for p in parts if p).strip())

    # LUT takes priority over all heuristics — returns stable key if matched
    lut_entry = lut_lookup(text)
    if lut_entry:
        key = lut_entry.key
        # For console products: apply Digital edition and game-bundle sub-grouping on top
        # Use startswith checks on the key (underscored) to identify consoles
        # and exclude peripherals (portal, vr, move, camera, controllers, handhelds).
        _CONSOLE_KEY_RE = re.compile(
            r"^(playstation_[1-9]|xbox_series|xbox_one|nintendo_switch)"
        )
        if _CONSOLE_KEY_RE.match(key):
            if re.search(r"\bdigital\b", text):
                key = f"{key}_digital"
            _GENERIC_ED = re.compile(
                r"^(standard|digital|disc|launch|special|collector|deluxe|a|an|the)$", re.I
            )
            has_jogo = bool(re.search(r"\+\s*jogo\b", text, re.I))
            has_named_bundle = False
            em = re.search(r"\b((?:\w+\s+){1,4}?)(edition|bundle|pack)\b", text, re.I)
            if em:
                ew = [w for w in em.group(1).strip().split() if not _GENERIC_ED.match(w)]
                has_named_bundle = bool(ew)
            if has_jogo or has_named_bundle:
                key = f"{key}_bundle"
        return key

    # Catálogo minerado de eletrônicos (marca → modelos, app/data/product_catalog.json).
    # iPhone e consoles seguem nos ramos específicos abaixo.
    if not _SPECIFIC_FAMILY_RE.search(text):
        product = catalog_product(offer.title)
        if product:
            return product.key

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

    # PlayStation Portal — handles "playstation portal" and "playstation 5 portal" / CFI-Y1001
    if re.search(r"\bplaystation\s+(?:\d\s+)?portal\b|\bcfi.?y1001\b", text):
        # Check for special edition (e.g. 30th Anniversary)
        edition_match = re.search(r"\b((?:\w+\s+){1,4}?)(edition|anniversary)\b", text, re.I)
        if edition_match:
            edition_words = [w for w in edition_match.group(1).strip().split()
                             if not re.match(r"^(standard|special|a|an|the)$", w, re.I)]
            if edition_words:
                return normalize_text(f"playstation portal {' '.join(edition_words)}")
        return "playstation portal"

    # PlayStation VR2 / VR — handles "playstation vr2" and "playstation 5 vr2" / CFI-ZVR1
    vr_match = re.search(r"\bplaystation\s+(?:\d\s+)?(vr2?)\b|\bcfi.?zvr\b|\bps\s*vr2?\b", text)
    if vr_match:
        vr_label = "vr2" if "vr2" in text else "vr"
        return normalize_text(f"playstation {vr_label}")

    # PlayStation Move
    if re.search(r"\bplaystation\s+move\b", text):
        return "playstation move"

    # PlayStation numbered console (after alias expansion "ps5" → "playstation 5")
    ps_match = re.search(r"\bplaystation\s+(\d)\b", text)
    if ps_match:
        number = ps_match.group(1)
        suffix_str = " ".join(variants)

        _GENERIC_EDITION = re.compile(
            r"^(standard|digital|disc|launch|special|collector|deluxe|a|an|the)$", re.I
        )

        # Digital edition detection
        digital_suffix = " digital" if re.search(r"\bdigital\b", text) else ""

        # "+ Jogo X" — Portuguese game bundle (e.g. "PS5 + Jogo Astro Bot")
        has_jogo = bool(re.search(r"\+\s*jogo\b", text, re.I))

        # "X Edition/Bundle/Pack" with real game name (not generic descriptors)
        has_named_bundle = False
        edition_match = re.search(r"\b((?:\w+\s+){1,4}?)(edition|bundle|pack)\b", text, re.I)
        if edition_match:
            edition_words = [w for w in edition_match.group(1).strip().split()
                             if not _GENERIC_EDITION.match(w)]
            has_named_bundle = bool(edition_words)

        # All game bundles share one group key so they can be sub-filtered by game in the UI
        if has_jogo or has_named_bundle:
            return normalize_text(f"playstation {number} {suffix_str}{digital_suffix} bundle".strip())

        return normalize_text(f"playstation {number} {suffix_str}{digital_suffix}".strip())

    # Xbox Series X/S
    xbox_series = re.search(r"\bxbox\s+series\s+([xs])\b", text)
    if xbox_series:
        letter = xbox_series.group(1)
        suffix_str = " ".join(v for v in variants if v not in {"pro"})
        digital_suffix = " digital" if re.search(r"\bdigital\b", text) else ""

        has_jogo = bool(re.search(r"\+\s*jogo\b", text, re.I))
        has_named_bundle = False
        edition_match = re.search(r"\b((?:\w+\s+){1,4}?)(edition|bundle|pack)\b", text, re.I)
        if edition_match:
            edition_words = [w for w in edition_match.group(1).strip().split()
                             if not re.match(r"^(standard|special|launch|a|an|the)$", w, re.I)]
            has_named_bundle = bool(edition_words)

        if has_jogo or has_named_bundle:
            return normalize_text(f"xbox series {letter} {suffix_str}{digital_suffix} bundle".strip())
        return normalize_text(f"xbox series {letter} {suffix_str}{digital_suffix}".strip())

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

    # Prefixo de categoria que uma loja põe e outra não ("Protetor Solar Celimax ..."
    # vs "Celimax ...") — senão as 6 primeiras palavras nunca batem
    text = _CATEGORY_PREFIX_RE.sub("", text)
    text = re.sub(r"\b\d{1,4}\s?(gb|tb)\b", " ", text)
    text = re.sub(r"\bram\b", " ", text)
    for token in COLOR_MAP:
        text = re.sub(rf"\b{re.escape(token)}\b", " ", text)

    cleaned = re.sub(r"\s+", " ", text).strip()
    tokens = cleaned.split()
    # 6 tokens to capture e.g. "xiaomi redmi note 15 pro 5g"
    return " ".join(tokens[:6]) if tokens else "product"


def _canonical_name(base_model: str, storage: str | None, voltage: str | None, offers: list[OfferModel]) -> str:
    sample = min(offers, key=lambda offer: len(offer.title))

    # LUT gives the authoritative display name when available
    lut_entry = lut_lookup(expand_gaming_aliases(normalize_text(sample.title)))
    if lut_entry:
        # If base_model has extra modifiers (_digital, _bundle) beyond the LUT key,
        # derive the display name from base_model so "Slim Digital Bundle" is shown.
        if base_model == lut_entry.key:
            name = lut_entry.display
        else:
            name = _gaming_display_name(base_model.replace("_", " "))
    elif product := next(
        (m for m in map(catalog_product, (o.title for o in offers)) if m and m.key == base_model), None
    ):
        name = f"{product.brand} {product.model}"
    else:
        brand_norm = (sample.brand or "").lower()
        if sample.brand and sample.model and brand_norm not in _GAMING_BRANDS:
            name = f"{sample.brand} {sample.model}"
        else:
            name = _gaming_display_name(base_model)

    details = [detail.upper() for detail in [storage] if detail]
    if voltage:
        details.append(voltage)
    return f"{name} ({', '.join(details)})" if details else name


def _canonical_perfume_name(name_key: str, concentration: str | None, volume_ml: str | None, offers: list[OfferModel]) -> str:
    # LUT gives authoritative "Brand Fragrance" display name
    known = next((m for m in map(identify_perfume, (o.title for o in offers)) if m and m.key == name_key), None)
    if known:
        base = f"{known.brand} {known.fragrance}" if known.fragrance else known.brand
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
) -> tuple[list[tuple[str, str, str, float, list[OfferModel], str | None, str | None, str | None]], list[tuple[str, str, str]]]:
    """Return (groups, lut_misses).
    groups: list of (product_key, family_key, canonical_name, confidence, offers, concentration, volume_ml, voltage).
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
            # Mesmo frasco anunciado como 236ml (8 fl oz) ou 250ml
            if volume_ml in ("236ml", "250ml") and concentration in ("Body Lotion", "Body Splash"):
                volume_ml = "236ml" if concentration == "Body Lotion" else "250ml"
            key = ("perfume", perfume_name, volume_ml, concentration)
            grouped.setdefault(key, []).append(offer)
            continue

        storage, _ram = _extract_storage_and_ram(offer.title)
        voltage = _extract_voltage(offer.title)
        base = _base_model_key(offer)
        # RAM is intentionally excluded from the key: PY listings often include
        # RAM in the title (e.g. "256GB 8GB") while BR listings don't, which
        # would create duplicate groups for the same product.
        # Voltage IS included only for single-voltage variants: 127V and 220V
        # are genuinely different products. "Bivolt" means works on both — not
        # a differentiator, so it's treated as no-voltage for grouping purposes.
        effective_voltage = voltage if voltage in ("127V", "220V") else None
        key = ("default", base, storage, effective_voltage)
        grouped.setdefault(key, []).append(offer)

    response: list[tuple[str, str, str, float, list[OfferModel], str | None, str | None, str | None]] = []
    for (group_type, base, storage, extra), grouped_offers in grouped.items():
        if group_type == "perfume":
            # In the key: storage slot holds volume_ml, extra slot holds concentration
            volume_ml = storage
            concentration = extra
            canonical_name = _canonical_perfume_name(base, concentration, volume_ml, grouped_offers)
            product_key = slugify(f"perfume {base} {volume_ml or ''} {concentration or ''}")
            response.append((product_key, base, canonical_name, 1.0, grouped_offers, concentration, volume_ml, None))
        else:
            voltage = extra  # extra slot holds voltage for default products
            canonical_name = _canonical_name(base, storage, voltage, grouped_offers)
            product_key = slugify(f"{base} {storage or ''} {voltage or ''}")
            response.append((product_key, base, canonical_name, 1.0, grouped_offers, None, None, voltage))

    return response, lut_misses
