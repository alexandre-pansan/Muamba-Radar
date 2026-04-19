from __future__ import annotations

import re
import unicodedata

KNOWN_BRANDS = ("apple", "samsung", "xiaomi", "asus", "lenovo", "acer", "nvidia", "amd", "sony", "microsoft", "nintendo", "valve", "sega", "logitech", "thrustmaster", "fanatec", "hori", "jbl", "bose", "harman", "sennheiser", "anker", "philips", "motorola", "lg")

# Brands that should display in all-caps or with non-title capitalisation
_BRAND_DISPLAY: dict[str, str] = {
    "jbl": "JBL", "amd": "AMD", "nvidia": "NVIDIA", "lg": "LG",
}

# Gaming abbreviation expansions — applied before tokenization so "ps5" and
# "playstation 5" produce identical token sets and numeric guards work correctly.
_ALIAS_EXPANSIONS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bps\s*5\b"),            "playstation 5"),
    (re.compile(r"\bps\s*4\b"),            "playstation 4"),
    (re.compile(r"\bps\s*3\b"),            "playstation 3"),
    (re.compile(r"\bps\s*2\b"),            "playstation 2"),
    (re.compile(r"\bps\s*portal\b"),       "playstation portal"),
    (re.compile(r"\bps\s*vr\s*2\b|\bpsvr\s*2\b"), "playstation vr2"),
    (re.compile(r"\bps\s*vr\b|\bpsvr\b"), "playstation vr"),
    (re.compile(r"\bps\s*move\b"),         "playstation move"),
    (re.compile(r"\bxsx\b"),               "xbox series x"),
    (re.compile(r"\bxss\b"),               "xbox series s"),
]

# Appliance synonym groups — bidirectional PT-BR ↔ EN equivalences.
# Any token from a group expands to all others at match time,
# so "air fry" matches "Fritadeira" and vice-versa.
_APPLIANCE_SYNONYM_GROUPS: list[frozenset[str]] = [
    frozenset({"airfryer", "air", "fry", "fryer", "fritadeira", "freidora"}),
    frozenset({"secador", "hairdryer"}),
    frozenset({"lavadora", "washing"}),
    frozenset({"microondas", "microwave"}),
    frozenset({"liquidificador", "blender"}),
    frozenset({"chapinha", "prancha", "alisador"}),
    frozenset({"aspirador", "vacuum"}),
    frozenset({"ventilador", "fan"}),
    frozenset({"batedeira", "mixer"}),
]


def _expand_synonyms(tokens: set[str]) -> set[str]:
    expanded = set(tokens)
    for group in _APPLIANCE_SYNONYM_GROUPS:
        if expanded & group:
            expanded |= group
    return expanded


# Platform/console names that should never be treated as a product model
_PLATFORM_TOKENS = frozenset({
    "ps5", "ps4", "ps3", "ps2", "playstation", "xbox", "switch", "nintendo",
})


def expand_gaming_aliases(text: str) -> str:
    """Expand gaming abbreviations so ps5/playstation 5 tokenize identically."""
    for pattern, replacement in _ALIAS_EXPANSIONS:
        text = pattern.sub(replacement, text)
    return text

# Normalized terms (accents removed) for second-hand/refurbished listings.
EXCLUDED_CONDITION_PATTERNS = (
    r"\brefurb(?:ished)?\b",
    r"\brecon\b",
    r"\brenewed\b",
    r"\brecondicionad[oa]s?\b",
    r"\busad[oa]s?\b",
    r"\bsemi\s*nov[oa]s?\b",
    r"\bsegunda\s+mao\b",
    r"\bopen\s*box\b",
    r"\bcaixa\s+aberta\b",
    r"\bnovo\s+com\s+caixa\s+aberta\b",
    r"\bcpo\b",
    r"\bswap\b",
    r"\bgrado\b",
    r"\bgrade\b",
    r"\bgrade\s*[a-f]\b",
    r"\bgrau\s*[a-f]\b",
    r"\b(vitrine|mostruario|demo|display)\b",
)


def normalize_text(value: str) -> str:
    value = value.strip().lower()
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = re.sub(r"[^a-z0-9\s]", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def _expand_storage_tokens(value: str) -> str:
    # Split "128gb" -> "128 gb", "1tb" -> "1 tb", "100ml" -> "100 ml", "50oz" -> "50 oz"
    value = re.sub(r"(\d+)\s*(gb|tb|ml|oz|kg|gr?)\b", r"\1 \2", value)
    # Split GPU/CPU model strings: "rtx5070" -> "rtx 5070", "rx6700" -> "rx 6700"
    # Only applies to 3-5 digit numbers attached to letters (avoids short codes like "g16").
    value = re.sub(r"\b([a-z]+)(\d{3,5})\b", r"\1 \2", value)
    return value


def tokenize(value: str) -> list[str]:
    normalized = _expand_storage_tokens(normalize_text(value))
    normalized = expand_gaming_aliases(normalized)
    return [token for token in normalized.split() if token]


def slugify(value: str) -> str:
    text = normalize_text(value)
    return text.replace(" ", "_") if text else "product"


def is_refurbished_or_used(title: str) -> bool:
    normalized = normalize_text(title)
    return any(re.search(pattern, normalized) for pattern in EXCLUDED_CONDITION_PATTERNS)


# Accessory keywords: if these appear in the title but NOT in the query,
# the result is an accessory for the product — not the product itself.
_ACCESSORY_PATTERNS = re.compile(
    r"\b(controles?|control|joy.?con|joysticks?|gamepads?|"
    r"cabo|carregador|dock|base|suporte|stand|"
    r"capa|case|bolsa|bag|sleeve|cover|skin|"
    r"pel[ií]cula|protetor|protector|tempered|vidro|"
    r"headset|fone|earphone|earbuds|headphone|"
    r"bateria|battery|power\s*bank|"
    r"mouse|teclado|keyboard|webcam|"
    r"adapt[ae]dor|hub|leitor|reader|"
    # Peripherals that mention console compatibility but are NOT the console
    r"volante|racing\s+wheel|steering\s+wheel|"
    r"arcade\s*stick|fight(ing)?\s*stick|flight\s*stick|"
    r"tampa|reprodutor|portal\s+ps|"
    r"unidade\s+de\s+disco|"
    r"estacao\s+de\s+carregamento|"
    r"maleta|mochila|"
    r"prescricao|"
    r"decant|fracionad[oa]s?|amostra|miniatura|travel\s*size|"
    r"kit\s+\w+|combo\s+\w+|"
    # Games — any title with jogo/juego/game keyword or physical-media marker is a game listing
    r"jogo|juego|legendado|"
    r"game\s+(ps[1-5]|playstation|xbox|nintendo|switch))\b"
)


_PHYSICAL_GAME_RE  = re.compile(r"\bfisico\b")
_CONSOLE_MARKER_RE = re.compile(r"\b(console|consola|modelo|oled|lite)\b")


def _is_physical_game(norm_title: str, norm_query: str) -> bool:
    """Detect '[Game Title] [Console] Físico' listings (no jogo/juego keyword)."""
    if not _PHYSICAL_GAME_RE.search(norm_title):
        return False
    if _PHYSICAL_GAME_RE.search(norm_query):
        return False
    return not _CONSOLE_MARKER_RE.search(norm_title)


_PT_STOP_WORDS = frozenset({
    "de", "da", "do", "dos", "das", "em", "no", "na", "nos", "nas",
    "e", "com", "para", "por", "um", "uma", "o", "a", "os", "as",
})


def matches_query_loose(query: str, title: str) -> bool:
    """Lenient relevance check used after adapter pre-filtering.

    Strips Portuguese stop words before counting required hits, and applies
    synonym expansion, so 'escova de cabelo' matches 'Escova Elétrica Onida'
    on the strength of a single significant token ('escova').
    """
    query_tokens = tokenize(query)
    if not query_tokens:
        return False

    norm_query  = normalize_text(query)
    norm_title  = normalize_text(title)

    if _ACCESSORY_PATTERNS.search(norm_title) and not _ACCESSORY_PATTERNS.search(norm_query):
        return False
    if _is_physical_game(norm_title, norm_query):
        return False

    significant = [t for t in query_tokens if t not in _PT_STOP_WORDS]
    if not significant:
        return matches_query(query, title)

    title_tokens = set(tokenize(title))

    # Numeric tokens in query must all appear in title.
    numeric = [t for t in significant if re.search(r"\d", t)]
    if numeric and not all(t in title_tokens for t in numeric):
        return False

    non_numeric = [t for t in significant if not re.search(r"\d", t)]
    if not non_numeric:
        return True

    query_expanded = _expand_synonyms(set(non_numeric))
    title_expanded = _expand_synonyms(title_tokens)
    hits = len(query_expanded & title_expanded)
    required = max(1, (len(non_numeric) + 1) // 2)
    return hits >= required


def matches_query(query: str, title: str) -> bool:
    query_tokens = tokenize(query)
    if not query_tokens:
        return False

    norm_query = normalize_text(query)
    norm_title = normalize_text(title)

    # Reject accessories not mentioned in the query.
    if _ACCESSORY_PATTERNS.search(norm_title) and not _ACCESSORY_PATTERNS.search(norm_query):
        return False
    if _is_physical_game(norm_title, norm_query):
        return False

    title_tokens = set(tokenize(title))

    # Strong guardrail: numeric tokens in query (model/storage) must match.
    numeric_tokens = [token for token in query_tokens if re.search(r"\d", token)]
    if numeric_tokens and not all(token in title_tokens for token in numeric_tokens):
        return False

    # Expand both sides with appliance synonyms so "air fry" matches "Fritadeira"
    # and "fritadeira" matches "Air Fryer" without false positives on other searches.
    query_expanded = _expand_synonyms(set(query_tokens))
    title_expanded = _expand_synonyms(title_tokens)
    hits = len(query_expanded & title_expanded)

    if numeric_tokens:
        # When the query has a model number, enforce all non-numeric tokens too
        # if the query is short (≤3 non-numeric words) — prevents "JBL Charge 6"
        # from matching a "JBL Flip 6" search just because both share brand + number.
        non_numeric_tokens = [t for t in query_tokens if not re.search(r"\d", t)]
        if len(non_numeric_tokens) <= 3:
            required_hits = len(query_tokens)  # all tokens must match
        else:
            required_hits = len(numeric_tokens) + max(2, int(len(non_numeric_tokens) * 0.7 + 0.5))
    elif len(query_tokens) <= 2:
        # Short text queries: require all tokens (both "lattafa" AND "yara" must appear).
        required_hits = len(query_tokens)
    else:
        # Longer text queries: require 60%.
        required_hits = max(2, int(len(query_tokens) * 0.6 + 0.5))
    return hits >= required_hits


def extract_brand_model(title: str) -> tuple[str | None, str | None]:
    normalized = normalize_text(title)
    brand = next((b for b in KNOWN_BRANDS if b in normalized.split()), None)

    model_match = re.search(r"([a-z]+\s?\d{1,4}[a-z0-9\-]*)", normalized)
    model = model_match.group(1) if model_match else None

    # Reject platform names and pure numeric SKUs as model identifiers
    if model and (model.lower() in _PLATFORM_TOKENS or re.match(r"^\d+$", model)):
        model = None

    brand_display = _BRAND_DISPLAY.get(brand, brand.title()) if brand else None
    return (brand_display, model.title() if model else None)
