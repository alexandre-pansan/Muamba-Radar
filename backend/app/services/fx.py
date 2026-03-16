from __future__ import annotations

from app.config import settings
from app.schemas import PriceModel


def to_brl(
    amount: float,
    currency: str,
    pyg_per_brl: float | None = None,
    brl_per_usd: float | None = None,
) -> tuple[float, float]:
    pyg_per_brl = pyg_per_brl if pyg_per_brl is not None else settings.fx_pyg_per_brl
    brl_per_usd = brl_per_usd if brl_per_usd is not None else settings.fx_brl_per_usd
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
