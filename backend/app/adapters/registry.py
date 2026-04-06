from __future__ import annotations

from app.adapters.base import SourceAdapter
from app.adapters.buscape import BuscapeAdapter
from app.adapters.comprasparaguai import ComprasParaguaiAdapter
from app.adapters.mercadolivre import MercadoLivreAdapter


def get_adapters() -> list[SourceAdapter]:
    return [
        # ── Paraguay ─────────────────────────────────────────────────────────
        ComprasParaguaiAdapter(),
        # ── Brazil ───────────────────────────────────────────────────────────
        MercadoLivreAdapter(),
        BuscapeAdapter(),
    ]
