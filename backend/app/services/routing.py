"""Rotas a pé pelas ruas, via OSRM local (serviço "osrm" do docker-compose).

O frontend nunca fala com o OSRM direto: passa por POST /walking-route, que valida,
põe em cache e devolve None quando o roteador não está disponível — aí o mapa usa a
linha reta entre as lojas, como antes.
"""
from __future__ import annotations

import logging
from collections import OrderedDict
from threading import Lock

import requests

from app.config import settings

log = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 3
_CACHE_MAX = 512
_cache: OrderedDict[tuple, dict] = OrderedDict()
_cache_lock = Lock()
_session = requests.Session()


def _cache_get(key: tuple) -> dict | None:
    with _cache_lock:
        hit = _cache.get(key)
        if hit is not None:
            _cache.move_to_end(key)
        return hit


def _cache_put(key: tuple, value: dict) -> None:
    with _cache_lock:
        _cache[key] = value
        _cache.move_to_end(key)
        while len(_cache) > _CACHE_MAX:
            _cache.popitem(last=False)


def _osrm(service: str, points: list[tuple[float, float]], extra: dict) -> tuple[dict, dict] | None:
    coords = ";".join(f"{lng},{lat}" for lat, lng in points)  # OSRM é lng,lat
    url = f"{settings.osrm_url.rstrip('/')}/{service}/v1/foot/{coords}"
    params = {"overview": "full", "geometries": "geojson", **extra}
    try:
        data = _session.get(url, params=params, timeout=_TIMEOUT_SECONDS).json()
    except (requests.RequestException, ValueError) as exc:
        log.warning("OSRM indisponível (%s): %s", url[:80], exc)
        return None
    if data.get("code") != "Ok":
        log.warning("OSRM respondeu %s: %s", data.get("code"), data.get("message"))
        return None
    route = (data.get("trips") or data.get("routes") or [None])[0]
    return (route, data) if route else None


def walking_route(points: list[tuple[float, float]], optimize: bool) -> dict | None:
    """Rota a pé passando por `points` ([(lat, lng), ...]).

    optimize=True: melhor ordem de visita pelas ruas (caminho aberto — começa e termina
    onde for melhor, sem voltar ao início). False: respeita a ordem recebida.

    Retorna {"distance_m", "duration_s", "geometry": [[lat, lng], ...], "order": [i, ...]}
    em que order[k] é o índice (em `points`) da k-ésima parada. None se indisponível.
    """
    if not settings.osrm_url or len(points) < 2:
        return None

    # 6 casas ≈ 10 cm: suficiente pra chave de cache sem perder precisão útil.
    rounded = tuple((round(lat, 6), round(lng, 6)) for lat, lng in points)
    key = (rounded, optimize)
    cached = _cache_get(key)
    if cached is not None:
        return cached

    if optimize:
        # O OSRM não aceita caminho aberto com início E fim livres (NotImplemented),
        # então testa cada loja como ponto de partida e fica com o mais curto.
        # No máximo 25 consultas de ~10 ms ao roteador local.
        best = None
        for start in range(len(rounded)):
            rest = [i for i in range(len(rounded)) if i != start]
            idx = [start] + rest
            got = _osrm(
                "trip",
                [rounded[i] for i in idx],
                {"roundtrip": "false", "source": "first", "destination": "any"},
            )
            if got is None:
                return None
            route, data = got
            if best is None or route["distance"] < best[0]["distance"]:
                # waypoints na ordem enviada; waypoint_index = posição na viagem.
                by_position = sorted(range(len(idx)), key=lambda k: data["waypoints"][k]["waypoint_index"])
                best = (route, [idx[k] for k in by_position])
        route, order = best
    else:
        got = _osrm("route", list(rounded), {})
        if got is None:
            return None
        route, order = got[0], list(range(len(points)))

    result = {
        "distance_m": route["distance"],
        "duration_s": route["duration"],
        "geometry": [[lat, lng] for lng, lat in route["geometry"]["coordinates"]],
        "order": order,
    }
    _cache_put(key, result)
    return result
