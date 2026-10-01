from __future__ import annotations

import threading
import time
from abc import ABC, abstractmethod
from urllib.parse import urlsplit

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from app.schemas import RawOfferModel, SourceInfoModel

_DEFAULT_HEADERS = {
    # UA de navegador real: o Cloudflare do comprasparaguai passou a dar 403 pro UA
    # identificado ("PriceSourcerer") em 2026-10-01.
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept-Language": "pt-BR,pt;q=0.9",
}

# ── Throttle por host ─────────────────────────────────────────────────────────
# Desligado por padrão: a busca ao vivo do usuário nunca deve ser atrasada. Quem liga
# é o crawler em lote (set_request_throttle), que roda por horas e precisa ser educado
# com os sites. O limite é por host justamente porque comprasparaguai, buscape e
# mercadolibre são servidores diferentes — segurar um atrás do outro não protege
# ninguém, só faz o crawl demorar mais.
_throttle_lock = threading.Lock()
_throttle_interval = 0.0
_last_request_at: dict[str, float] = {}


def set_request_throttle(seconds: float) -> None:
    """Intervalo mínimo entre requisições ao MESMO host, compartilhado entre threads.
    0 desliga."""
    global _throttle_interval
    _throttle_interval = max(0.0, seconds)


def _wait_turn(url: str) -> None:
    if _throttle_interval <= 0:
        return
    host = urlsplit(url).netloc
    while True:
        with _throttle_lock:
            now = time.monotonic()
            earliest = _last_request_at.get(host, 0.0) + _throttle_interval
            if now >= earliest:
                # Marca antes de soltar o lock: duas threads não podem achar que é a
                # vez das duas.
                _last_request_at[host] = now
                return
            wait = earliest - now
        time.sleep(wait)


def _make_session() -> requests.Session:
    """HTTP session with connection pooling and conservative retry."""
    session = requests.Session()
    session.headers.update(_DEFAULT_HEADERS)
    retry = Retry(total=2, backoff_factor=0.3, status_forcelist=[429, 500, 502, 503, 504])
    adapter = HTTPAdapter(max_retries=retry, pool_connections=4, pool_maxsize=8)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


class SourceAdapter(ABC):
    source_id: str
    country: str

    def __init__(self) -> None:
        self._session = _make_session()

    def _get(self, url: str, **kwargs) -> requests.Response:
        """Shared HTTP GET via pooled session."""
        kwargs.setdefault("timeout", 15)
        _wait_turn(url)
        resp = self._session.get(url, **kwargs)
        resp.raise_for_status()
        return resp

    @abstractmethod
    def search(self, query: str) -> list[RawOfferModel]:
        raise NotImplementedError

    def fetch_raw(self, query: str) -> tuple[str, str]:
        """Return (url, raw_content) for debugging. Adapters override this."""
        raise NotImplementedError(f"{self.__class__.__name__} does not support fetch_raw")

    def info(self) -> SourceInfoModel:
        return SourceInfoModel(source=self.source_id, country=self.country, enabled=True)
