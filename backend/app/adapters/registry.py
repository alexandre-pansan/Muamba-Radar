from __future__ import annotations

from app.adapters.base import SourceAdapter
from app.adapters.buscape import BuscapeAdapter
from app.adapters.comprasparaguai import ComprasParaguaiAdapter
from app.adapters.mercadolivre import MercadoLivreAdapter
from app.adapters.paraguay_stores import (
    CellShopAdapter,
    MegaEletronicosAdapter,
    MobileZoneAdapter,
    NewZoneAdapter,
    NisseiAdapter,
    ShoppingChinaAdapter,
)


def get_adapters() -> list[SourceAdapter]:
    return [
        # ── Paraguay ─────────────────────────────────────────────────────────
        ComprasParaguaiAdapter(),
        NisseiAdapter(),
        MegaEletronicosAdapter(),
        CellShopAdapter(),
        MobileZoneAdapter(),
        ShoppingChinaAdapter(),
        NewZoneAdapter(),
        # ── Brazil ───────────────────────────────────────────────────────────
        MercadoLivreAdapter(),
        BuscapeAdapter(),
    ]
