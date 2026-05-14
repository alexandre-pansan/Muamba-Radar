"""
MercadoLivre adapter — uses the official ML search API.

Requires ML_APP_ID and ML_CLIENT_SECRET in the environment/.env file.
Register a free app at: https://developers.mercadolivre.com.br/

Token flow: client_credentials grant → application-level access token
(no user login required). Tokens last 6 hours; refreshed automatically.
"""
from __future__ import annotations

import logging
import time
from datetime import UTC, datetime

from app.adapters.base import SourceAdapter
from app.schemas import RawOfferModel
from app.services.normalization import matches_query

log = logging.getLogger("muambaradar.adapters")

_API_BASE  = "https://api.mercadolibre.com"
_TOKEN_URL = f"{_API_BASE}/oauth/token"
_SEARCH_URL = f"{_API_BASE}/sites/MLB/search"

_HEADERS = {
    "User-Agent": "MuambaRadar/1.0",
    "Accept": "application/json",
}

# Module-level token cache (shared across all adapter instances)
_cached_token: str = ""
_token_expires_at: float = 0.0


def _get_token(app_id: str, client_secret: str, session) -> str:
    global _cached_token, _token_expires_at
    if _cached_token and time.time() < _token_expires_at - 300:
        return _cached_token
    resp = session.post(
        _TOKEN_URL,
        data={
            "grant_type": "client_credentials",
            "client_id": app_id,
            "client_secret": client_secret,
        },
        headers={"Accept": "application/json"},
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    _cached_token = data["access_token"]
    _token_expires_at = time.time() + data.get("expires_in", 21600)
    return _cached_token


class MercadoLivreAdapter(SourceAdapter):
    source_id = "mercadolivre"
    country = "br"

    def __init__(self) -> None:
        super().__init__()
        from app.config import settings
        self._app_id = settings.ml_app_id
        self._client_secret = settings.ml_client_secret

    def _enabled(self) -> bool:
        return bool(self._app_id and self._client_secret)

    def _search_url(self, query: str) -> str:
        from urllib.parse import quote_plus
        return f"{_SEARCH_URL}?q={quote_plus(query)}&limit=50"

    def fetch_raw(self, query: str) -> tuple[str, str]:
        if not self._enabled():
            raise NotImplementedError("ML_APP_ID / ML_CLIENT_SECRET not configured")
        token = _get_token(self._app_id, self._client_secret, self._session)
        url = self._search_url(query)
        resp = self._get(url, headers={**_HEADERS, "Authorization": f"Bearer {token}"})
        return url, resp.text

    def search(self, query: str) -> list[RawOfferModel]:
        if not self._enabled():
            log.debug("mercadolivre: ML_APP_ID/ML_CLIENT_SECRET not set — skipping")
            return []
        try:
            token = _get_token(self._app_id, self._client_secret, self._session)
        except Exception as exc:
            log.warning("mercadolivre: token fetch failed — %s", exc)
            return []

        url = self._search_url(query)
        try:
            resp = self._get(url, headers={**_HEADERS, "Authorization": f"Bearer {token}"})
        except Exception as exc:
            log.warning("mercadolivre: request failed — %s", exc)
            return []

        try:
            data = resp.json()
        except Exception:
            log.warning("mercadolivre: invalid JSON response")
            return []

        if data.get("error") == "forbidden":
            log.warning("mercadolivre: 403 forbidden — app may still be in sandbox mode. "
                        "Go to developers.mercadolivre.com.br and activate production mode.")
            return []

        results = data.get("results", [])
        now = datetime.now(UTC)
        offers: list[RawOfferModel] = []

        for item in results:
            if item.get("condition") != "new":
                continue
            if item.get("buying_mode") not in ("buy_it_now", None):
                continue

            title = (item.get("title") or "").strip()
            if not title or not matches_query(query, title):
                continue

            price = item.get("price")
            if not price or float(price) < 30:
                continue

            url_item = item.get("permalink") or ""
            if not url_item:
                continue

            seller = (item.get("seller") or {}).get("nickname") or "Mercado Livre"
            thumbnail = item.get("thumbnail") or None

            offers.append(RawOfferModel(
                source=self.source_id,
                country=self.country,
                store=seller,
                title=title,
                url=url_item,
                image_url=thumbnail,
                price_amount=float(price),
                price_currency="BRL",
                captured_at=now,
            ))

            if len(offers) >= 30:
                break

        return offers
