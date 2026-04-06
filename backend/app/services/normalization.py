from __future__ import annotations

import re
import unicodedata

KNOWN_BRANDS = ("apple", "samsung", "xiaomi", "asus", "lenovo", "acer", "nvidia", "amd", "sony", "microsoft", "nintendo", "valve", "sega")

# Gaming abbreviation expansions — applied before tokenization so "ps5" and
# "playstation 5" produce identical token sets and numeric guards work correctly.
_ALIAS_EXPANSIONS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bps\s*5\b"), "playstation 5"),
    (re.compile(r"\bps\s*4\b"), "playstation 4"),
    (re.compile(r"\bps\s*3\b"), "playstation 3"),
    (re.compile(r"\bps\s*2\b"), "playstation 2"),
    (re.compile(r"\bxsx\b"), "xbox series x"),
    (re.compile(r"\bxss\b"), "xbox series s"),
]


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
    # Split "128gb" -> "128 gb" and "1tb" -> "1 tb" to improve matching.
    value = re.sub(r"(\d+)\s*(gb|tb)\b", r"\1 \2", value)
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
    r"\b(controle|control|joy.?con|joystick|gamepad|"
    r"cabo|carregador|dock|base|suporte|stand|"
    r"capa|case|bolsa|bag|sleeve|cover|skin|"
    r"pel[ií]cula|protetor|protector|tempered|vidro|"
    r"headset|fone|earphone|earbuds|headphone|"
    r"bateria|battery|power\s*bank|"
    r"mouse|teclado|keyboard|webcam|"
    r"adapt[ae]dor|hub|leitor|reader)\b"
)


def matches_query(query: str, title: str) -> bool:
    query_tokens = tokenize(query)
    if not query_tokens:
        return False

    norm_query = normalize_text(query)
    norm_title = normalize_text(title)

    # Reject accessories not mentioned in the query.
    if _ACCESSORY_PATTERNS.search(norm_title) and not _ACCESSORY_PATTERNS.search(norm_query):
        return False

    title_tokens = set(tokenize(title))
    hits = sum(1 for token in query_tokens if token in title_tokens)

    # Strong guardrail: numeric tokens in query (model/storage) must match.
    numeric_tokens = [token for token in query_tokens if re.search(r"\d", token)]
    if numeric_tokens and not all(token in title_tokens for token in numeric_tokens):
        return False

    if numeric_tokens:
        # Numeric queries (e.g., iphone 15 128gb) stay strict.
        required_hits = max(2, (len(query_tokens) + 1) // 2)
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

    return (brand.title() if brand else None, model.upper() if model else None)
