"""Catálogo de eletrônicos: marca → modelos, minerado dos títulos do catálogo de ofertas
(scripts/build_product_catalog.py) e salvo em app/data/product_catalog.json.

Mesma ideia do catálogo de perfumes (perfume_catalog.py), com as regras de eletrônico:
- número faz parte do modelo ("Flip 6" ≠ "Flip 7") e entra na continuação do nome;
- variantes (Pro/Max/Ultra/...) nunca se misturam: se aparecem no título, entram no modelo;
- armazenamento e voltagem saem do nome — o matcher já os usa como parte separada da chave;
- categoria ("Caixa de Som", "Microfone"), cor, potência e descrição de anúncio saem.
O matcher usa isto depois da LUT de eletrônicos (product_lut.py) e fora dos ramos
específicos de iPhone/PlayStation/Xbox/Switch.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import NamedTuple

from app.services.normalization import normalize_text
from app.services.perfume_catalog import Brand, find_brand

CATALOG_FILE = Path(__file__).resolve().parent.parent / "data" / "product_catalog.json"

# Apelidos de marca (normalizados): nome canônico → outras formas nos títulos
# (Sem "iphone"/"galaxy": capa de iPhone viraria produto Apple e tênis "Galaxy", Samsung.)
BRAND_ALIASES: dict[str, list[str]] = {
    "TP-Link": ["tp link", "tplink"],
    "Xiaomi": ["redmi", "poco"],
    "Logitech": ["logitech g"],
    "Hollyland": ["holly land"],
}
# Apelido que também é o começo do modelo ("Redmi Note 14"): não sai do título
_ALIAS_IS_MODEL = frozenset({"redmi", "poco"})

# Acessório/peça de reposição: não vira modelo da marca (fica com a regra genérica)
ACCESSORY_RE = re.compile(
    r"\b(capa|capinha|case|pelicula|protetor\s+de\s+tela|vidro\s+temperado|frontal|traseira|"
    r"tampa|flex|reparo|peca|pecas|suporte|parede|bateria\s+para|tela\s+para|compativel|"
    r"para\s+(iphone|ipad|galaxy|samsung|xiaomi|redmi|macbook|airpods)|cabo|pulseira\s+para|"
    r"bolsa|estojo|skin|adesivo|funko|tenis|camiseta|bone|mochila)\b"
)

# Marcas da lista do CP que são palavras comuns em título de eletrônico
BRAND_DENYLIST: frozenset[str] = frozenset({
    "Universal", "Star", "Dragon", "Quanta", "Prosper", "Ion", "Smart", "Pro", "Max", "Ultra",
    "Plus", "Mini", "One", "Red", "Black", "Power", "Sound", "Music", "Gamer", "Wireless",
    "Bluetooth", "Digital", "Global", "Original", "Premium", "Speaker", "Mouse", "Go",
})

# Palavras que indicam eletrônico (pra decidir se uma marca entra no catálogo)
ELECTRONICS_WORDS = re.compile(
    r"\b(caixa\s+de\s+som|speaker|soundbar|subwoofer|alto\s+falante|microfone|microfono|fone|"
    r"audifono|auricular|headset|headphone|earbuds?|earphone|mouse|teclado|keyboard|controle|"
    r"joystick|gamepad|celular|smartphone|tablet|notebook|laptop|monitor|televisor|smart\s+tv|"
    r"roteador|router|repetidor|drone|camera|camara|webcam|smartwatch|smartband|relogio|"
    r"impressora|projetor|console|gimbal|estabilizador|ssd|memoria|placa\s+de\s+video|placa\s+mae|"
    r"processador|gabinete|cooler|carregador|power\s*bank|aparador|barbeador|maquina\s+de\s+cortar|"
    r"cortador|receiver|amplificador|mesa\s+de\s+som|interface\s+de\s+audio|toca\s+discos|"
    r"pendrive|cartao\s+de\s+memoria|hd\s+externo|nobreak|kindle|leitor)\b"
)

# Categoria/descrição que sai do título antes de achar o modelo
_STRIP_PHRASES = re.compile(
    r"\b(caixas?\s+de\s+som|alto\s+falantes?|fones?\s+de\s+ouvido|placa\s+de\s+video|placa\s+mae|"
    r"mesa\s+de\s+som|interface\s+de\s+audio|toca\s+discos|maquina\s+de\s+cortar(\s+cabelo)?|"
    r"power\s*bank|smart\s+tv|sem\s+fio|com\s+fio|dual\s+(chip|sim)|hd\s+externo|cartao\s+de\s+memoria|"
    r"carregamento\s+rapido|cancelamento\s+de\s+ruido|noise\s+cancel\w*|true\s+wireless|"
    r"versao\s+global|global\s+version|para\s+carro)\b"
)
_UNITS = re.compile(
    r"\b\d+(?:[.,]\d+)*\s?(gb|tb|mb|w|wats?|watts?|hz|khz|mhz|ghz|mah|mm|cm|v|vac|rms|db|"
    r"pol|polegadas|mp|fps|k|ms|metros?|m|dpi|g\s?ram|ram)\b|\bipx?\d{1,2}\b|\b\d+\s?x\s?\d+\b"
    # código de peça: "981-000014", "910-005810", SKU de 5+ dígitos; "M.2" de SSD
    r"|\b\d{3}\s\d{6}\b|\b\d{5,}\b|\bm\s?2\b"
)
_STRIP_WORDS = frozenset({
    # categoria
    "caixa", "speaker", "soundbar", "subwoofer", "microfone", "microfono", "mic", "fone", "audifono",
    "auricular", "auriculares", "headset", "headphone", "headphones", "earbuds", "earbud", "earphone",
    "mouse", "teclado", "keyboard", "mousepad", "controle", "control", "joystick", "gamepad",
    "celular", "smartphone", "telefone", "tablet", "notebook", "laptop", "monitor", "televisor",
    "roteador", "router", "repetidor", "drone", "camera", "camara", "filmadora", "webcam",
    "smartwatch", "smartband", "relogio", "impressora", "projetor", "console", "gimbal",
    "estabilizador", "ssd", "memoria", "processador", "gabinete", "cooler", "carregador",
    "cabo", "adaptador", "aparador", "barbeador", "cortador", "receiver", "amplificador",
    "pendrive", "nobreak", "leitor", "torre", "portatil", "portable", "inteligente",
    # descrição de anúncio
    "bluetooth", "wireless", "wifi", "usb", "tipo", "rgb", "led", "gamer", "gaming", "bivolt",
    "original", "novo", "nova", "lacrado", "garantia", "global", "versao", "version", "unidade",
    "com", "sem", "de", "para", "e", "y", "con", "the", "and", "with", "for", "el", "la", "o", "a",
    "preto", "preta", "branco", "branca", "azul", "verde", "vermelho", "vermelha", "rosa",
    "cinza", "prata", "dourado", "dourada", "roxo", "roxa", "amarelo", "amarela", "laranja",
    "black", "white", "blue", "green", "red", "pink", "gray", "grey", "silver", "gold", "purple",
    "yellow", "orange", "negro", "blanco", "rojo", "gris", "plata", "morado", "midnight",
    "titanium", "titanio", "grafite", "graphite", "starlight", "lilac", "lilas", "cor", "color",
    "som", "audio", "stereo", "estereo", "hifi", "hi", "fi", "bass", "extra", "som",
    "resistente", "agua", "waterproof", "splashproof", "prova", "dagua", "ip67", "ip68",
    "kit", "combo", "pack", "unid", "un", "pcs", "pecas", "modelo", "model", "nfc", "anatel",
    "lancamento", "importado", "oficial", "promocao", "oferta", "barato", "envio", "imediato",
    # tipo de produto que não é o nome do modelo
    "mecanico", "mecanica", "magnetico", "magnetica", "optico", "optica", "ergonomico",
    "fonte", "alimentacao", "cadeira", "escova", "dentes", "eletrica", "eletrico", "secador",
    "cabelo", "tomada", "lampada", "robo", "aspirador", "balanca", "ram", "nvme", "pcie",
    "sata", "gen4", "gen5", "interno", "externo", "lapela", "estabilizadora", "localizador",
    "intra", "auricular", "esportivo", "infantil", "profissional", "dinamico", "condensador",
    "rms", "watts", "watt", "bt", "inalambrico", "inalambricos", "fones", "ouvido",
    "apresentador", "laser", "tec",
})
# Código de peça/SKU longo ("M2429E1", "MX2D3AM") — 7+ caracteres com letra e número
_PART_CODE = re.compile(r"^(?=[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]{7,}$")
# Variantes que separam produtos — se aparecem no título, entram no modelo
VARIANT_WORDS = ("pro", "plus", "max", "ultra", "lite", "mini", "slim", "oled", "se", "fe", "neo", "air")
_VARIANT_ORDER = {v: i for i, v in enumerate(VARIANT_WORDS)}
CONNECTORS = frozenset({"de", "da", "do", "of", "the", "on", "in", "and", "e"})


class ProductMatch(NamedTuple):
    brand: str
    model: str
    key: str


def brand_aliases(name: str) -> tuple[str, ...]:
    forms = {normalize_text(name), *BRAND_ALIASES.get(name, [])}
    return tuple(sorted((f for f in forms if f), key=len, reverse=True))


def residual_tokens(text_norm: str, brand_alias: str | None) -> list[str]:
    """Título sem marca, categoria, cor, unidades (W, Hz, GB...) e descrição de anúncio."""
    text = f" {text_norm} "
    if brand_alias and brand_alias not in _ALIAS_IS_MODEL:
        text = text.replace(f" {brand_alias} ", " ")  # todas: "Apple ... Apple"
    text = _STRIP_PHRASES.sub(" ", text)
    text = _UNITS.sub(" ", text)
    words = text.split()
    sub_brand = "redmi" in words or "poco" in words
    tokens: list[str] = []
    for t in words:
        if t in _STRIP_WORDS or t in tokens or _PART_CODE.match(t):
            continue
        if len(t) > 4 and t.endswith("s") and t[:-1] in _STRIP_WORDS:  # plural: "microfones"
            continue
        if len(t) == 1 and not t.isdigit():
            continue
        if t == "mi" and sub_brand:  # "Xiaomi Mi Redmi Buds 6"
            continue
        tokens.append(t)
    return tokens


def model_key(brand: str, model: str) -> str:
    return normalize_text(f"{brand} {model}")


@lru_cache(maxsize=1)
def _load() -> tuple[list[Brand], dict[str, list[tuple[tuple[str, ...], str]]], dict[str, frozenset[str]]]:
    """(marcas, modelos por marca [(tokens, nome)] do mais longo, vocabulário da marca =
    palavras que aparecem em algum modelo dela)."""
    if not CATALOG_FILE.exists():
        return [], {}, {}
    data = json.loads(CATALOG_FILE.read_text(encoding="utf-8"))
    brands: list[Brand] = []
    models: dict[str, list[tuple[tuple[str, ...], str]]] = {}
    vocab: dict[str, frozenset[str]] = {}
    for entry in data.get("brands", []):
        brands.append(Brand(entry["name"], tuple(entry["aliases"])))
        items = [(tuple(normalize_text(m["name"]).split()), m["name"]) for m in entry.get("models", [])]
        items.sort(key=lambda it: len(it[0]), reverse=True)
        models[entry["name"]] = items
        vocab[entry["name"]] = frozenset(t for phrase, _ in items for t in phrase)
    return brands, models, vocab


def _find(tokens: list[str], phrase: tuple[str, ...]) -> int:
    n = len(phrase)
    return next((i for i in range(len(tokens) - n + 1) if tuple(tokens[i:i + n]) == phrase), -1)


def _has_digit(token: str) -> bool:
    return any(c.isdigit() for c in token)


def _is_model_code(token: str) -> bool:
    """R400, G305, K120, XB100 — letra e número juntos, curto."""
    return 2 <= len(token) <= 6 and _has_digit(token) and any(c.isalpha() for c in token)


def _continuation(tokens: list[str], vocab: frozenset[str]) -> list[str]:
    """Palavras logo depois de um modelo sem número ("Flip", "Tune") — até 2: número/código
    curto ("Flip" + "8", "Tune" + "520bt") ou palavra de algum modelo da marca ("Go" +
    "essential"). Cor, "rms", "cx feia" e afins param a continuação."""
    out: list[str] = []
    for t in tokens:
        ok = (_has_digit(t) and len(t) <= 6) or t in vocab
        if not ok:
            break
        out.append(t)
        if len([w for w in out if w not in CONNECTORS]) == 2:
            break
    while out and out[-1] in CONNECTORS:
        out.pop()
    return out


# Grafia oficial que .capitalize() estraga
_DISPLAY_WORDS = {
    "iphone": "iPhone", "ipad": "iPad", "airpods": "AirPods", "macbook": "MacBook", "imac": "iMac",
    "airtag": "AirTag", "earpods": "EarPods", "playstation": "PlayStation", "dualsense": "DualSense",
    "gopro": "GoPro", "partybox": "PartyBox", "deathadder": "DeathAdder", "blackwidow": "BlackWidow",
    "blackshark": "BlackShark", "powerlite": "PowerLite", "ecotank": "EcoTank",
}


def display_name(phrase: str) -> str:
    return " ".join(
        _DISPLAY_WORDS.get(w.lower())
        or (w.upper() if any(c.isdigit() for c in w) and len(w) <= 6 else w.capitalize())
        for w in phrase.split()
    )


def _display(phrase: str) -> str:
    return display_name(phrase)


@lru_cache(maxsize=65536)
def match_product(title: str) -> ProductMatch | None:
    """Marca + modelo do catálogo pra um título de eletrônico, ou None."""
    brands, models, vocab = _load()
    if not brands:
        return None
    text_norm = normalize_text(title)
    found = find_brand(text_norm, brands)
    if not found:
        return None
    if ACCESSORY_RE.search(text_norm):
        return None
    brand, alias = found
    tokens = residual_tokens(text_norm, alias)
    for phrase, display in models.get(brand.name, []):
        i = _find(tokens, phrase)
        if i < 0:
            continue
        name_tokens = list(phrase)
        if not _has_digit(phrase[-1]):  # "Flip 7" já está completo; "Flip" pode continuar
            name_tokens += _continuation(tokens[i + len(phrase):], vocab.get(brand.name, frozenset()))
        if not any(_has_digit(t) for t in name_tokens):
            # código de modelo em outro ponto do título ("Wireless A Laser ... R400")
            code = next((t for t in tokens if _is_model_code(t)), None)
            if code:
                name_tokens.append(code)
        # variante em qualquer lugar do título entra no modelo (nunca juntar Pro com base)
        variants = sorted(
            (t for t in tokens if t in _VARIANT_ORDER and t not in name_tokens),
            key=_VARIANT_ORDER.get,
        )
        name_tokens += variants
        name = " ".join(name_tokens)
        shown = display_name(display if name == " ".join(phrase) else name)
        return ProductMatch(brand.name, shown, model_key(brand.name, name))
    return None
