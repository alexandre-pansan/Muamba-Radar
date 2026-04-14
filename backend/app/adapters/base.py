from __future__ import annotations

from abc import ABC, abstractmethod

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from app.schemas import RawOfferModel, SourceInfoModel

_DEFAULT_HEADERS = {"User-Agent": "Mozilla/5.0 (PriceSourcerer/0.1)"}


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
        resp = self._session.get(url, **kwargs)
        resp.raise_for_status()
        return resp

    @abstractmethod
    def search(self, query: str) -> list[RawOfferModel]:
        raise NotImplementedError

    def info(self) -> SourceInfoModel:
        return SourceInfoModel(source=self.source_id, country=self.country, enabled=True)
