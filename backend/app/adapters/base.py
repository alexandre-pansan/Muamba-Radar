from __future__ import annotations

from abc import ABC, abstractmethod

from app.schemas import RawOfferModel, SourceInfoModel


class SourceAdapter(ABC):
    source_id: str
    country: str

    @abstractmethod
    def search(self, query: str) -> list[RawOfferModel]:
        raise NotImplementedError

    def info(self) -> SourceInfoModel:
        return SourceInfoModel(source=self.source_id, country=self.country, enabled=True)
