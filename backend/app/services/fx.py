from __future__ import annotations

import re
import time
import logging

import requests
from bs4 import BeautifulSoup

from app.config import settings
from app.schemas import PriceModel

logger = logging.getLogger(__name__)

# Cache: (rate_value, fetched_at_timestamp)
_fx_cache: tuple[float, float] | None = None
_FX_CACHE_TTL = 1800  # 30 minutes


def _fetch_brl_per_usd() -> float | None:
    try:
        resp = requests.get(
            "https://www.comprasparaguai.com.br",
            timeout=10,
            headers={"User-Agent": "Mozilla/5.0 (PriceSourcerer/0.1)"},
        )
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        node = soup.select_one("span.cotacao-real") or soup.select_one(".txt-quotation strong")
        if not node:
            return None
        text = node.get_text(" ", strip=True)
        match = re.search(r"[\d]+[,\.][\d]+", text)
        if not match:
            return None
        value = float(match.group().replace(",", "."))
        return value if value > 0 else None
    except Exception as e:
        logger.warning("FX scrape failed: %s", e)
        return None


def get_brl_per_usd() -> float:
    global _fx_cache
    now = time.monotonic()
    if _fx_cache is not None and (now - _fx_cache[1]) < _FX_CACHE_TTL:
        return _fx_cache[0]
    rate = _fetch_brl_per_usd()
    if rate is not None:
        _fx_cache = (rate, now)
        logger.info("FX rate updated: 1 USD = R$ %.4f", rate)
        return rate
    # fallback to cached value or .env
    if _fx_cache is not None:
        return _fx_cache[0]
    return settings.fx_brl_per_usd


def to_brl(
    amount: float,
    currency: str,
    pyg_per_brl: float | None = None,
    brl_per_usd: float | None = None,
) -> tuple[float, float]:
    pyg_per_brl = pyg_per_brl if pyg_per_brl is not None else settings.fx_pyg_per_brl
    brl_per_usd = brl_per_usd if brl_per_usd is not None else get_brl_per_usd()
    currency_upper = currency.upper()
    if currency_upper == "BRL":
        return amount, pyg_per_brl
    if currency_upper == "PYG":
        return amount / pyg_per_brl, pyg_per_brl
    if currency_upper == "USD":
        return amount * brl_per_usd, pyg_per_brl
    return amount, pyg_per_brl


def build_price(amount: float, currency: str) -> PriceModel:
    amount_brl, rate = to_brl(amount, currency)
    return PriceModel(
        amount=amount,
        currency=currency.upper(),
        amount_brl=round(amount_brl, 2),
        fx_rate_used=rate,
        fx_rate_timestamp=None,
    )
