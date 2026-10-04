"""
Gera backend/app/data/perfume_catalog.json (marca → fragrâncias) minerando os títulos
de perfume do catálogo de ofertas. Rodar de novo depois de um crawl grande.

1. Marcas: lista de marcas do Compras Paraguai (/marcas/, cache em
   backend/app/data/cp_brands.json) ∩ marcas que aparecem em títulos de perfume —
   pelo menos MIN_BRAND_OFFERS ofertas e ≥ 50% das menções em perfume (descarta marca
   de outra categoria que só coincide no nome). BRAND_DENYLIST/BRAND_ALIASES em
   app/services/perfume_catalog.py são a curadoria manual.
2. Fragrâncias: em cada título, tira marca/formato/volume/gênero (residual_tokens) e
   conta os começos de 1–3 palavras. Fica o que aparece em ≥ MIN_FRAGRANCE_TITLES
   títulos diferentes; um começo que quase sempre continua igual ("qaed" → "qaed al
   fursan") cede lugar ao nome mais longo.

Uso:
    cd backend
    python ../scripts/build_perfume_catalog.py                  # usa o cache de marcas
    python ../scripts/build_perfume_catalog.py --refresh-brands # baixa /marcas/ de novo
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from bs4 import BeautifulSoup  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models import ProductOffer  # noqa: E402
from app.services.matcher import _is_perfume_offer  # noqa: E402
from app.services.normalization import normalize_text  # noqa: E402
from app.services.perfume_catalog import (  # noqa: E402
    BRAND_DENYLIST,
    CATALOG_FILE,
    CONNECTORS,
    FRAGRANCE_ALIASES,
    GENERIC_SINGLE_WORDS,
    Brand,
    brand_aliases,
    find_brand,
    residual_tokens,
)

CP_BRANDS_FILE = CATALOG_FILE.parent / "cp_brands.json"
MIN_BRAND_OFFERS = 3
MIN_BRAND_PERFUME_SHARE = 0.5
MIN_FRAGRANCE_TITLES = 3
TRUNCATION_RATIO = 0.8  # "qaed" (33) vs "qaed al fursan" (33): o curto é só truncamento


class _Title:  # _is_perfume_offer só olha .title
    def __init__(self, title: str) -> None:
        self.title = title


def fetch_cp_brands() -> dict[str, str]:
    from app.adapters.comprasparaguai import ComprasParaguaiAdapter

    html = ComprasParaguaiAdapter()._fetch_html("https://www.comprasparaguai.com.br/marcas/")
    out: dict[str, str] = {}
    for a in BeautifulSoup(html, "html.parser").select('a[href^="/marcas/"]'):
        slug = a["href"].strip("/").split("/")[-1]
        name = a.get_text(" ", strip=True)
        if slug and slug != "marcas" and name and len(name) < 60:
            out.setdefault(slug, name)
    return out


def load_titles() -> tuple[list[str], list[str]]:
    """(títulos de perfume, todos os títulos) — distintos, das ofertas ativas."""
    db = SessionLocal()
    now = datetime.now(timezone.utc)
    titles = {t for (t,) in db.query(ProductOffer.title).filter(ProductOffer.expires_at > now)}
    db.close()
    perfume = [t for t in titles if _is_perfume_offer(_Title(t))]
    return perfume, list(titles)


def pick_brands(cp_brands: dict[str, str], perfume: list[str], all_titles: list[str]) -> tuple[list[Brand], Counter]:
    candidates = [
        Brand(name, brand_aliases(name))
        for name in sorted(set(cp_brands.values()))
        if name not in BRAND_DENYLIST and len(normalize_text(name)) >= 3
    ]
    perfume_set = set(perfume)
    perfume_count: Counter = Counter()
    total_count: Counter = Counter()
    for title in all_titles:
        found = find_brand(normalize_text(title), candidates)
        if not found:
            continue
        total_count[found[0].name] += 1
        if title in perfume_set:
            perfume_count[found[0].name] += 1
    chosen = [
        b for b in candidates
        if perfume_count[b.name] >= MIN_BRAND_OFFERS
        and perfume_count[b.name] / total_count[b.name] >= MIN_BRAND_PERFUME_SHARE
    ]
    return chosen, perfume_count


def merge_variants(brand: Brand, kept: dict[str, int]) -> dict[str, list[str]]:
    """Junta nomes que são o mesmo perfume escrito diferente e devolve {nome: [apelidos]}:
    - com/sem palavra da marca: "miss" × "miss dior", "bottled" × "boss bottled" (o
      título que só diz "Miss Dior" perde o "dior" junto com a marca);
    - FRAGRANCE_ALIASES manuais ("one million" → "1 million").
    Fica o nome com mais títulos; nome feito só de palavras da marca ("boss") sai."""
    brand_words = {w for alias in brand.aliases for w in alias.split()}
    for p in [p for p in kept if set(p.split()) <= brand_words]:
        kept.pop(p)
    aliases: dict[str, list[str]] = {p: [] for p in kept}

    def absorb(keep: str, drop: str) -> None:
        kept[keep] += kept.pop(drop)
        aliases[keep] += [drop, *aliases.pop(drop, [])]

    manual = {normalize_text(v): normalize_text(k)
              for k, vs in FRAGRANCE_ALIASES.get(brand.name, {}).items() for v in vs}
    for variant, canonical in manual.items():
        if variant in kept and canonical in kept:
            absorb(canonical, variant)
    for p in sorted(kept, key=len):
        if p not in kept:
            continue
        for p2 in list(kept):
            if p2 == p or p2 not in kept:
                continue
            rest = [w for w in p2.split() if w not in brand_words]
            if rest[:1] == ["the"]:
                rest = rest[1:]
            if rest == p.split():
                keep, drop = (p2, p) if kept[p2] >= kept[p] else (p, p2)
                absorb(keep, drop)
                if drop == p:
                    break
    return aliases


def pick_fragrances(brands: list[Brand], perfume: list[str]) -> dict[str, list[tuple[str, int, list[str]]]]:
    prefixes: dict[str, Counter] = defaultdict(Counter)
    for title in perfume:
        text = normalize_text(title)
        found = find_brand(text, brands)
        if not found:
            continue
        brand, alias = found
        tokens = residual_tokens(text, alias)
        for n in range(1, min(3, len(tokens)) + 1):
            phrase = tokens[:n]
            if phrase[-1] in CONNECTORS or all(t.isdigit() for t in phrase):
                continue
            if n == 1 and phrase[0] in GENERIC_SINGLE_WORDS:
                continue
            prefixes[brand.name][" ".join(phrase)] += 1

    by_name = {b.name: b for b in brands}
    out: dict[str, list[tuple[str, int, list[str]]]] = {}
    for brand_name, counts in prefixes.items():
        kept = {p: c for p, c in counts.items() if c >= MIN_FRAGRANCE_TITLES}
        # descarta o começo que é só truncamento de um nome mais longo
        for p, c in list(kept.items()):
            longer = [c2 for p2, c2 in kept.items() if p2.startswith(p + " ")]
            if longer and max(longer) >= TRUNCATION_RATIO * c:
                kept.pop(p, None)
        aliases = merge_variants(by_name[brand_name], kept)
        out[brand_name] = sorted(((p, c, aliases.get(p, [])) for p, c in kept.items()), key=lambda it: -it[1])
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh-brands", action="store_true", help="baixa /marcas/ do Compras Paraguai de novo")
    args = parser.parse_args()

    if args.refresh_brands or not CP_BRANDS_FILE.exists():
        cp_brands = fetch_cp_brands()
        CP_BRANDS_FILE.parent.mkdir(parents=True, exist_ok=True)
        CP_BRANDS_FILE.write_text(json.dumps(cp_brands, ensure_ascii=False, indent=1), encoding="utf-8")
    cp_brands = json.loads(CP_BRANDS_FILE.read_text(encoding="utf-8"))

    perfume, all_titles = load_titles()
    brands, brand_counts = pick_brands(cp_brands, perfume, all_titles)
    fragrances = pick_fragrances(brands, perfume)

    catalog = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source_titles": len(perfume),
        "brands": [
            {
                "name": b.name,
                "aliases": list(b.aliases),
                "offers": brand_counts[b.name],
                "fragrances": [
                    {"name": phrase.title(), "titles": count, **({"aliases": aliases} if aliases else {})}
                    for phrase, count, aliases in fragrances.get(b.name, [])
                ],
            }
            for b in sorted(brands, key=lambda b: -brand_counts[b.name])
        ],
    }
    CATALOG_FILE.write_text(json.dumps(catalog, ensure_ascii=False, indent=1), encoding="utf-8")
    n_frag = sum(len(b["fragrances"]) for b in catalog["brands"])
    print(f"{len(perfume)} títulos de perfume → {len(brands)} marcas, {n_frag} fragrâncias → {CATALOG_FILE}")


if __name__ == "__main__":
    main()
