"""Catálogo de perfumes: marca → fragrâncias, minerado dos títulos do próprio catálogo
de ofertas (scripts/build_perfume_catalog.py) e salvo em app/data/perfume_catalog.json.

O matcher usa isto depois da LUT curada (product_lut.py): acha a marca no título, tira
a marca e as palavras de formato/concentração/volume/gênero, e procura no que sobra a
fragrância mais longa conhecida daquela marca. As funções de "limpar o título" ficam
aqui pra o gerador e o matcher enxergarem o título exatamente do mesmo jeito.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import NamedTuple

from app.services.normalization import normalize_text

CATALOG_FILE = Path(__file__).resolve().parent.parent / "data" / "perfume_catalog.json"

# Apelidos de marca (já normalizados): nome canônico → outras formas que aparecem nos
# títulos. O nome canônico em si também casa.
BRAND_ALIASES: dict[str, list[str]] = {
    "Christian Dior": ["dior"],
    "Yves Saint Laurent": ["ysl", "saint laurent"],
    "Thierry Mugler": ["mugler"],
    "Maison Alhambra": ["alhambra"],
    "Paco Rabanne": ["rabanne"],
    "Dolce & Gabbana": ["dolce gabbana", "dolce e gabbana", "d g"],
    "Giorgio Armani": ["armani", "emporio armani"],
    "Jean Paul Gaultier": ["jpg", "gaultier"],
    "Hugo Boss": ["boss", "hb"],
    "Calvin Klein": ["ck"],
    "Victoria's Secret": ["victoria secret", "victorias secret"],
    "Bvlgari": ["bulgari"],
    "Women Secret": ["women secret", "womensecret"],
    "Antonio Banderas": ["banderas"],
    "Carolina Herrera": ["herrera"],
    "Parfums de Marly": ["de marly"],
    "Hermes": ["hermes paris"],
    "Mercedes-Benz": ["mercedes benz", "mercedes"],
    "Abercrombie & Fitch": ["abercrombie"],
    "Salvatore Ferragamo": ["ferragamo"],
    "Agatha Ruiz De La Prada": ["agatha ruiz"],
}

# Mesma fragrância com nomes diferentes: marca → {nome canônico: [variações]}
FRAGRANCE_ALIASES: dict[str, dict[str, list[str]]] = {
    "Paco Rabanne": {"1 Million": ["one million"], "Lady Million": ["lady one million"]},
    "Antonio Banderas": {"Golden Secret": ["secret golden"]},
    "Carolina Herrera": {"Very Good Girl": ["good girl very"]},
}

# Nomes da lista de marcas do Compras Paraguai que são palavras comuns ou nomes de
# fragrância de outra marca ("Alien" é Mugler) — casariam com metade dos títulos.
BRAND_DENYLIST: frozenset[str] = frozenset({
    "Royal", "Extreme", "Karma", "Genesis", "NOW", "Gold Edition", "Bespoke", "Only",
    "Honor", "Breeze", "Mirage", "Alien", "Imperium", "Plum", "Sapphire", "Supreme",
    "Genius", "Yeah", "Costa", "Axis", "Gemini", "Essenza", "Insignia", "Glorious",
    "Naked", "Staedtler", "Bid", "Instyle", "Palazzo", "Boulevard", "Almas", "Red", "One",
    "Phantom", "Polo", "Star", "Hero", "Heroes", "Silk", "Vogue", "Apple", "Medicube",
    "Adidas", "Ferrari", "Spirit Of Kings", "Choice Selection", "Born in France",
    "Pink Sugar", "Cool & Cool", "Arrogance",
})

# Palavras que não fazem parte do nome da fragrância
_FORMAT_PHRASES = re.compile(
    r"\b(eau\s+de\s+(parfum|toilette|cologne)|extrait\s+de\s+parfum|parfum\s+de\s+toilette"
    r"|body\s+(splash|mist|lotion|spray|cream|oil)|for\s+(men|women|him|her))\b"
)
_VOLUME = re.compile(r"\b\d+(?:[.,]\d+)?\s?(ml|oz|g|gr)\b")
_STRIP_WORDS = frozenset({
    # formato / concentração
    "edp", "edt", "edc", "parfum", "perfume", "perfumes", "parfums", "cologne", "colonia",
    "extrait", "elixir", "spray", "vapo", "vaporisateur", "natural", "splash", "mist", "brume",
    "lotion", "locao", "locion", "creme", "crema", "hidratante", "corporal", "oleo", "oil",
    "body", "fragrance", "deo", "desodorante",
    # gênero
    "masculino", "feminino", "masculina", "feminina", "unissex", "unisex", "men", "women",
    "man", "woman", "homme", "femme", "pour", "him", "her", "hombre", "mujer", "masc", "fem",
    "femenino", "femenina", "uni", "perf",
    # ruído de anúncio
    "tester", "kit", "set", "original", "importado", "lacrado", "caixa", "com", "sem",
    "promo", "promocao", "oferta", "new", "nova", "novo", "ml", "frasco", "danificado",
    "miniatura", "mini", "travel", "refil", "refill", "recarregavel", "mas", "col", "eau",
    "arabe", "arabic", "arabian", "origina", "fixacao", "prolongada", "longa", "duracao",
    "xtrait", "lancamento", "barato", "promocional", "lojas", "loja",
    # descrição de anúncio e erros de digitação de formato
    "para", "homens", "homem", "mulher", "mulheres", "amadeirado", "aquatico", "floral",
    "oriental", "frutado", "citrico", "especiado", "adocicado", "dourado", "fragrancia",
    "perfum", "parfun", "parfume", "edpi", "edtp", "extrair", "origem", "outro", "eua", "msc",
    "limited", "edition", "edit", "ed", "concentrated", "concentrado", "feme", "cab",
    "alcool", "alcohol", "vegano", "vegan", "lacre", "selado",
})
# Uma palavra só dessas não é nome de fragrância ("Dior Intense", "Alhambra Pink")
GENERIC_SINGLE_WORDS = frozenset({
    "intense", "intensa", "sport", "absolu", "black", "blue", "gold", "rose", "pink", "red",
    "white", "noir", "extreme", "classic", "dark", "luxe", "night", "fresh", "silver", "royal",
    "prive", "edition", "collection", "limited", "special", "shimmer", "bliss", "vanilla",
})
# Conectivos dentro de nomes ("Qaed Al Fursan") — um nome não pode terminar neles
CONNECTORS = frozenset({"al", "el", "of", "de", "da", "do", "la", "le", "me", "my", "in",
                        "on", "by", "the", "and", "e", "di", "du", "des", "pour", "a"})


class Brand(NamedTuple):
    name: str
    aliases: tuple[str, ...]          # formas normalizadas, da mais longa pra mais curta


class PerfumeMatch(NamedTuple):
    brand: str
    fragrance: str | None            # None = marca conhecida, fragrância não catalogada
    key: str


def brand_aliases(name: str) -> tuple[str, ...]:
    forms = {normalize_text(name), *BRAND_ALIASES.get(name, [])}
    return tuple(sorted((f for f in forms if f), key=len, reverse=True))


def find_brand(text_norm: str, brands: list[Brand]) -> tuple[Brand, str] | None:
    """Marca cujo apelido aparece primeiro no título — a marca vem antes do modelo, e o
    modelo às vezes é nome de outra marca da lista ("JBL PartyBox Encore", "Lattafa Yara
    Tous"). Mesma posição: o apelido mais longo ("maison alhambra" > "alhambra")."""
    best: tuple[int, int, Brand, str] | None = None
    padded = f" {text_norm} "
    for brand in brands:
        for alias in brand.aliases:
            pos = padded.find(f" {alias} ")
            if pos >= 0 and (best is None or (pos, -len(alias)) < (best[0], best[1])):
                best = (pos, -len(alias), brand, alias)
    return (best[2], best[3]) if best else None


def residual_tokens(text_norm: str, brand_alias: str | None) -> list[str]:
    """Título sem a marca e sem formato/concentração/volume/gênero/ruído — o que sobra
    é (o começo d)o nome da fragrância."""
    text = f" {text_norm} "
    if brand_alias:
        # só a primeira ocorrência: "Dior Miss Dior" → "miss dior", não "miss"
        text = text.replace(f" {brand_alias} ", " ", 1)
    text = _FORMAT_PHRASES.sub(" ", text)
    text = _VOLUME.sub(" ", text)
    tokens: list[str] = []
    for t in text.split():
        if ((t not in _STRIP_WORDS and len(t) > 1) or t.isdigit()) and t not in tokens:
            tokens.append(t)  # sem repetição — o adaptador do CP acrescenta "[black]" ao título
    if tokens and tokens[0] == "the":  # "The Icon" == "Icon"
        tokens = tokens[1:]
    return tokens


def fragrance_key(brand: str, fragrance: str | None) -> str:
    return normalize_text(f"{brand} {fragrance or ''}").replace(" ", "_")


@lru_cache(maxsize=1)
def _load() -> tuple[list[Brand], dict[str, list[tuple[tuple[str, ...], str]]]]:
    """(marcas, fragrâncias por marca como [(tokens, nome exibido)] da mais longa)."""
    if not CATALOG_FILE.exists():
        return [], {}
    data = json.loads(CATALOG_FILE.read_text(encoding="utf-8"))
    brands: list[Brand] = []
    fragrances: dict[str, list[tuple[tuple[str, ...], str]]] = {}
    for entry in data.get("brands", []):
        brands.append(Brand(entry["name"], tuple(entry["aliases"])))
        items = [
            (tuple(normalize_text(form).split()), f["name"])
            for f in entry.get("fragrances", [])
            for form in [f["name"], *f.get("aliases", [])]
        ]
        items.sort(key=lambda it: len(it[0]), reverse=True)
        fragrances[entry["name"]] = items
    return brands, fragrances


def _find(tokens: list[str], phrase: tuple[str, ...]) -> int:
    n = len(phrase)
    return next((i for i in range(len(tokens) - n + 1) if tuple(tokens[i:i + n]) == phrase), -1)


def _continuation(tokens: list[str], brand: Brand) -> list[str]:
    """Palavras logo depois do nome encontrado (até 2 que não sejam conectivos):
    "Pride" + "pisa" → "Pride Pisa". Linha com vários perfumes (Lattafa Pride, Armaf
    Odyssey) não pode engolir os pouco anunciados que não chegaram ao catálogo."""
    brand_words = {w for alias in brand.aliases for w in alias.split()}
    out: list[str] = []
    meaningful = 0
    for t in tokens:
        if t in brand_words:  # "Fakhar Lattafa" — marca repetida no fim do título
            continue
        if any(ch.isdigit() for ch in t):  # código do anúncio ("614523", "parfum100ml")
            break
        out.append(t)
        if t not in CONNECTORS:
            meaningful += 1
            if meaningful == 2:
                break
    while out and out[-1] in CONNECTORS:
        out.pop()
    return out


@lru_cache(maxsize=1)
def _lut_index() -> tuple[dict[tuple[str, str], str], dict[str, str]]:
    """Ponte com a LUT curada:
    - (marca do catálogo, fragrância) normalizados → chave da LUT, pra o mesmo perfume
      não virar dois grupos (um pela LUT, outro pelo catálogo);
    - marca do catálogo → nome da marca na LUT ("Christian Dior" → "Dior"), pra o nome
      exibido não variar conforme a fonte."""
    from app.services.product_lut import PERFUME_LUT

    brands, _ = _load()
    keys: dict[tuple[str, str], str] = {}
    names: dict[str, str] = {}
    for entry in PERFUME_LUT:
        lut_brand = normalize_text(entry.brand)
        brand = next((b.name for b in brands if lut_brand in b.aliases), entry.brand)
        keys[(normalize_text(brand), normalize_text(entry.fragrance))] = entry.key
        names.setdefault(brand, entry.brand)
    return keys, names


def _lut_keys() -> dict[tuple[str, str], str]:
    return _lut_index()[0]


@lru_cache(maxsize=65536)
def match_perfume(title: str) -> PerfumeMatch | None:
    """Marca + fragrância do catálogo pra um título de perfume, ou None se a marca não
    é conhecida."""
    brands, fragrances = _load()
    if not brands:
        return None
    text_norm = normalize_text(title)
    found = find_brand(text_norm, brands)
    if not found:
        return None
    brand, alias = found
    tokens = residual_tokens(text_norm, alias)
    for phrase, display in fragrances.get(brand.name, []):
        i = _find(tokens, phrase)
        if i < 0:
            continue
        extra = _continuation(tokens[i + len(phrase):], brand)
        if extra:
            display = f"{display} {' '.join(extra).title()}"
        key = _lut_keys().get((normalize_text(brand.name), normalize_text(display)))
        return PerfumeMatch(_display_brand(brand.name), display, key or fragrance_key(brand.name, display))
    return PerfumeMatch(_display_brand(brand.name), None, fragrance_key(brand.name, None))


def _display_brand(name: str) -> str:
    return _lut_index()[1].get(name, name)


def identify(title: str) -> PerfumeMatch | None:
    """Marca + fragrância de um título de perfume, juntando as duas fontes:
    a LUT curada (product_lut.py) vence, exceto quando o catálogo acha um nome mais
    específico que começa com o dela — a LUT tem padrões largos (\\byara\\b) que
    engoliam "Yara Tous" e "Asad Bourbon". fragrance=None: só a marca é conhecida."""
    from app.services.product_lut import lookup_perfume

    lut = lookup_perfume(normalize_text(title))
    catalog = match_perfume(title)
    if lut:
        lut_name = normalize_text(lut.fragrance)
        if catalog and catalog.fragrance and normalize_text(catalog.fragrance).startswith(lut_name + " "):
            return catalog
        return PerfumeMatch(lut.brand, lut.fragrance if lut.fragrance != lut.brand else None, lut.key)
    return catalog
