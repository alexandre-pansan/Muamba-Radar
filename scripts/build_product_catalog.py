"""
Gera backend/app/data/product_catalog.json (marca → modelos de eletrônicos) minerando os
títulos do catálogo de ofertas. Irmão de build_perfume_catalog.py — rodar de novo depois
de um crawl grande.

1. Marcas: lista do Compras Paraguai (cache backend/app/data/cp_brands.json, baixado por
   build_perfume_catalog.py --refresh-brands) ∩ marcas que aparecem em títulos fora de
   perfume — pelo menos MIN_BRAND_TITLES títulos e ≥ MIN_ELECTRONICS_SHARE deles com
   palavra de eletrônico (deixa tênis, Funko e cosmético de fora).
2. Modelos: em cada título tira marca/categoria/cor/unidades (residual_tokens) e conta os
   começos de 1–4 palavras. Fica o que aparece em ≥ MIN_MODEL_TITLES títulos; começo que
   quase sempre continua igual cede lugar ao nome mais longo.

Uso:
    cd backend
    python ../scripts/build_product_catalog.py
"""
from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from app.database import SessionLocal  # noqa: E402
from app.models import ProductOffer  # noqa: E402
from app.services.matcher import _is_perfume_offer  # noqa: E402
from app.services.normalization import normalize_text  # noqa: E402
from app.services.perfume_catalog import Brand, find_brand  # noqa: E402
from app.services.product_catalog import (  # noqa: E402
    ACCESSORY_RE,
    BRAND_DENYLIST,
    CATALOG_FILE,
    CONNECTORS,
    ELECTRONICS_WORDS,
    VARIANT_WORDS,
    brand_aliases,
    display_name,
    residual_tokens,
)

CP_BRANDS_FILE = CATALOG_FILE.parent / "cp_brands.json"
MIN_BRAND_TITLES = 10
MIN_ELECTRONICS_SHARE = 0.4
MIN_MODEL_TITLES = 3
TRUNCATION_RATIO = 0.8
MAX_MODEL_WORDS = 4


class _Title:  # _is_perfume_offer só olha .title
    def __init__(self, title: str) -> None:
        self.title = title


def load_titles() -> list[str]:
    db = SessionLocal()
    now = datetime.now(timezone.utc)
    titles = {t for (t,) in db.query(ProductOffer.title).filter(ProductOffer.expires_at > now)}
    db.close()
    return [t for t in titles if not _is_perfume_offer(_Title(t))]


def pick_brands(cp_brands: dict[str, str], titles: list[str]) -> tuple[list[Brand], Counter]:
    candidates = [
        Brand(name, brand_aliases(name))
        for name in sorted(set(cp_brands.values()))
        if name not in BRAND_DENYLIST and len(normalize_text(name)) >= 2
    ]
    total: Counter = Counter()
    electronics: Counter = Counter()
    for title in titles:
        text = normalize_text(title)
        found = find_brand(text, candidates)
        if not found:
            continue
        total[found[0].name] += 1
        if ELECTRONICS_WORDS.search(text):
            electronics[found[0].name] += 1
    chosen = [
        b for b in candidates
        if total[b.name] >= MIN_BRAND_TITLES and electronics[b.name] / total[b.name] >= MIN_ELECTRONICS_SHARE
    ]
    return chosen, total


def _valid_model(phrase: list[str]) -> bool:
    if phrase[-1] in CONNECTORS:
        return False
    if len(phrase) == 1 and (phrase[0] in VARIANT_WORDS or phrase[0].isdigit()):
        return False  # "Pro" ou "5" sozinho não é modelo
    return True


def pick_models(brands: list[Brand], titles: list[str]) -> dict[str, list[tuple[str, int]]]:
    prefixes: dict[str, Counter] = defaultdict(Counter)
    for title in titles:
        text = normalize_text(title)
        found = find_brand(text, brands)
        if not found:
            continue
        if ACCESSORY_RE.search(text):
            continue
        brand, alias = found
        tokens = residual_tokens(text, alias)
        for n in range(1, min(MAX_MODEL_WORDS, len(tokens)) + 1):
            phrase = tokens[:n]
            if _valid_model(phrase):
                prefixes[brand.name][" ".join(phrase)] += 1

    out: dict[str, list[tuple[str, int]]] = {}
    for brand_name, counts in prefixes.items():
        kept = {p: c for p, c in counts.items() if c >= MIN_MODEL_TITLES}
        for p, c in list(kept.items()):
            longer = [c2 for p2, c2 in kept.items() if p2.startswith(p + " ")]
            if longer and max(longer) >= TRUNCATION_RATIO * c:
                kept.pop(p, None)
        out[brand_name] = sorted(kept.items(), key=lambda pc: -pc[1])
    return out


def main() -> None:
    if not CP_BRANDS_FILE.exists():
        sys.exit("cp_brands.json não existe — rode build_perfume_catalog.py --refresh-brands antes")
    cp_brands = json.loads(CP_BRANDS_FILE.read_text(encoding="utf-8"))
    titles = load_titles()
    brands, counts = pick_brands(cp_brands, titles)
    models = pick_models(brands, titles)
    catalog = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source_titles": len(titles),
        "brands": [
            {
                "name": b.name,
                "aliases": list(b.aliases),
                "titles": counts[b.name],
                "models": [{"name": display_name(p), "titles": c} for p, c in models.get(b.name, [])],
            }
            for b in sorted(brands, key=lambda b: -counts[b.name])
        ],
    }
    CATALOG_FILE.write_text(json.dumps(catalog, ensure_ascii=False, indent=1), encoding="utf-8")
    n_models = sum(len(b["models"]) for b in catalog["brands"])
    print(f"{len(titles)} títulos (fora de perfume) → {len(brands)} marcas, {n_models} modelos → {CATALOG_FILE}")


if __name__ == "__main__":
    main()
