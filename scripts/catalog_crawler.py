"""
Crawler de catálogo em lote — varre as categorias do Compras Paraguai e, para
cada produto encontrado, roda o mesmo pipeline de busca/comparação (PY + BR)
que o backend já usa nas buscas ao vivo. Feito pra rodar por horas, retomável
via checkpoint em disco.

Uso:
    cd backend
    python ../scripts/catalog_crawler.py                       # roda tudo, retomando de onde parou
    python ../scripts/catalog_crawler.py --max-tier 4                   # só as categorias prioritárias
    python ../scripts/catalog_crawler.py --only-category /perfume/ --max-pages 2   # smoke test
    python ../scripts/catalog_crawler.py --workers 2 --host-delay 3     # mais devagar/educado
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

STATE_DIR = Path(__file__).parent / "catalog_crawler_state"
CATEGORIES_FILE = STATE_DIR / "categories.json"
CHECKPOINT_FILE = STATE_DIR / "checkpoint.json"
STATUS_FILE = STATE_DIR / "status.json"
STOP_FLAG_FILE = STATE_DIR / "stop.flag"
LOG_FILE = STATE_DIR / "crawler.log"
CATEGORIES_MAX_AGE_DAYS = 30
# Pacing: em vez de dormir entre produtos (que segurava tudo, inclusive hosts que nem
# estavam sendo incomodados), o ritmo agora é um intervalo mínimo por host, aplicado
# dentro do SourceAdapter._get. Com isso dá pra processar vários produtos em paralelo
# sem aumentar a pressão em servidor nenhum: comprasparaguai, buscape e mercadolibre
# têm cada um o seu próprio intervalo.
DEFAULT_HOST_DELAY_SECONDS = 1.0
DEFAULT_WORKERS = 4
# Adapter que devolve 0 oferta esse tanto de vezes seguidas está fora do ar (o
# mercadolivre, por exemplo, responde 403 em tudo enquanto o app estiver em sandbox).
# Continuar chamando só gasta tempo de crawl.
ADAPTER_DEAD_AFTER_EMPTY = 30
ADAPTER_COOLDOWN_SECONDS = 15 * 60
# Falhas seguidas listando páginas de categoria (timeouts, 5xx) antes de abortar a run.
MAX_CONSECUTIVE_PAGE_FAILURES = 5
CATALOG_TTL_DAYS = 30

log = logging.getLogger("catalog_crawler")


def _setup_logging() -> None:
    if log.handlers:
        return

    STATE_DIR.mkdir(parents=True, exist_ok=True)
    log.setLevel(logging.INFO)
    log.propagate = False

    fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s")

    stream = logging.StreamHandler()
    stream.setFormatter(fmt)
    log.addHandler(stream)

    file_handler = RotatingFileHandler(LOG_FILE, maxBytes=5_000_000, backupCount=3)
    file_handler.setFormatter(fmt)
    log.addHandler(file_handler)


def _atomic_write_json(path: Path, data: dict) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    os.replace(tmp, path)


class EmptyCategoryTree(RuntimeError):
    """A varredura de /categorias/ voltou vazia — quase sempre o HTML do site mudou."""


def _load_categories(adapter, force_refresh: bool) -> list[dict]:
    if not force_refresh and CATEGORIES_FILE.exists():
        payload = json.loads(CATEGORIES_FILE.read_text())
        fetched_at = datetime.fromisoformat(payload["fetched_at"])
        cached = payload["categories"]
        # Um cache vazio nunca é válido: em 22/09/2026 o Compras Paraguai foi
        # reconstruído em Tailwind, `fetch_category_tree()` voltou 0 categorias e o
        # resultado vazio ficou gravado aqui. Como o cache vale 30 dias, toda run
        # seguinte lia esse [] e terminava em meio segundo sem crawlear nada — falha
        # silenciosa. Cache vazio agora é ignorado e refetchado.
        if cached and datetime.now(timezone.utc) - fetched_at < timedelta(days=CATEGORIES_MAX_AGE_DAYS):
            return cached
        if not cached:
            log.warning("categories.json está vazio — ignorando cache e buscando de novo")

    log.info("Buscando árvore de categorias em /categorias/ ...")
    categories = adapter.fetch_category_tree()
    if not categories:
        # Aborta alto em vez de gravar o vazio e "concluir" com 0 ofertas.
        raise EmptyCategoryTree(
            "fetch_category_tree() não achou nenhuma categoria em /categorias/. "
            "O HTML do Compras Paraguai provavelmente mudou de novo — conferir os "
            "seletores em ComprasParaguaiAdapter.fetch_category_tree()."
        )
    _atomic_write_json(CATEGORIES_FILE, {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "categories": categories,
    })
    log.info("Encontradas %d categorias", len(categories))
    return categories


# ── Ordem de ataque ───────────────────────────────────────────────────────────
# O site lista ~511 categorias-folha em ordem de departamento, o que deixa celular e
# perfume no meio do caminho e notebook lá no fim. Como um crawl completo leva horas
# (e pode ser interrompido a qualquer momento), a ordem importa: o que o usuário mais
# busca tem que entrar no catálogo primeiro. Cada regra abaixo é um tier; categoria
# cai no primeiro tier cujo teste passa, e dentro do tier a ordem do site é mantida.
PRIORITY_TIERS: list[tuple[str, object]] = [
    ("celular",             lambda c: c["url"] == "/celular/"),
    ("fone de ouvido",      lambda c: c["url"] == "/fone-de-ouvido-headset/"),
    ("perfume",             lambda c: c["url"] == "/perfume/"),
    ("notebook",            lambda c: c["url"] == "/notebook/"),
    ("informática",         lambda c: c["department"] == "Informática"),
    ("o resto",             lambda c: True),
]


def _tier_of(category: dict) -> int:
    for index, (_label, matches) in enumerate(PRIORITY_TIERS):
        if matches(category):
            return index
    return len(PRIORITY_TIERS) - 1


def _order_categories(categories: list[dict]) -> list[dict]:
    """Reordena as categorias pelos tiers de PRIORITY_TIERS (ordem estável: dentro de
    cada tier a ordem original do site é preservada)."""
    return sorted(categories, key=_tier_of)


def _order_fingerprint(categories: list[dict]) -> str:
    """Identifica a ordem de crawl. O checkpoint guarda um índice posicional, então se
    os tiers ou a árvore de categorias mudarem esse índice passa a apontar pra outra
    categoria — retomar por cima disso pularia categorias sem ninguém perceber."""
    joined = "|".join(c["url"] for c in categories)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()[:16]


def _log_tier_summary(categories: list[dict]) -> None:
    counts: dict[int, int] = {}
    for c in categories:
        tier = _tier_of(c)
        counts[tier] = counts.get(tier, 0) + 1
    parts = [
        f"{PRIORITY_TIERS[t][0]} {counts[t]}"
        for t in sorted(counts)
    ]
    log.info("Ordem de ataque: %s", " → ".join(parts))


def _load_checkpoint(order_key: str) -> dict:
    fresh = {"category_index": 0, "page": 1, "seen_titles": [], "order_key": order_key}
    if not CHECKPOINT_FILE.exists():
        return fresh
    saved = json.loads(CHECKPOINT_FILE.read_text())
    if saved.get("order_key") != order_key:
        log.warning(
            "checkpoint é de outra ordem de crawl (%s ≠ %s) — recomeçando da primeira "
            "categoria pra não pular nada",
            saved.get("order_key"), order_key,
        )
        return fresh
    return saved


def _save_checkpoint(category_index: int, page: int, seen_titles: set[str], order_key: str) -> None:
    _atomic_write_json(CHECKPOINT_FILE, {
        "category_index": category_index,
        "page": page,
        "seen_titles": sorted(seen_titles),
        "order_key": order_key,
    })


def _write_status(**fields) -> None:
    """Escreve/atualiza status.json (lido por GET /admin/crawler/status) — merge por
    cima do que já existe, então cada chamada só precisa passar os campos que mudaram."""
    payload = json.loads(STATUS_FILE.read_text()) if STATUS_FILE.exists() else {}
    payload.update(fields)
    payload["pid"] = os.getpid()
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    _atomic_write_json(STATUS_FILE, payload)


def _set_specs(db, url: str, specs: dict) -> None:
    from app.models import ProductOffer

    if not specs:
        return

    db.query(ProductOffer).filter(ProductOffer.url == url).update({"specs": specs})


def _extend_expiry(db, url: str, expires_at: datetime) -> None:
    """_upsert_offers() sets the live-search cache TTL (30min) — the catalog
    needs to survive until the next crawl, not get purged by the next live
    search. Push expires_at out further for rows the crawler itself wrote."""
    from app.models import ProductOffer

    db.query(ProductOffer).filter(ProductOffer.url == url).update({"expires_at": expires_at})


_thread_local = threading.local()


def _thread_db(session_factory):
    """Uma Session por thread — Session do SQLAlchemy não é thread-safe, então
    compartilhar a do run principal entre os workers corromperia a unit of work."""
    db = getattr(_thread_local, "db", None)
    if db is None:
        db = session_factory()
        _thread_local.db = db
    return db


def _close_thread_dbs(sessions: list) -> None:
    for db in sessions:
        try:
            db.close()
        except Exception:
            pass


class AdapterHealth:
    """Pausa adapter que só devolve vazio. O sinal é indireto de propósito: os
    adapters engolem o erro de rede e retornam [], então 'quebrado' e 'sem resultado'
    chegam aqui iguais — só uma sequência longa de zeros distingue os dois.

    A pausa é temporária: uma sequência de categorias sem equivalente no Brasil
    (peças de modelismo, acessórios genéricos) também gera zeros seguidos, e a versão
    antiga, que desligava pelo resto da run, matou o buscape no 1º minuto de um crawl
    de 2 dias. Depois da pausa o adapter volta e é re-testado."""

    def __init__(
        self,
        adapters: list,
        dead_after: int = ADAPTER_DEAD_AFTER_EMPTY,
        cooldown_seconds: float = ADAPTER_COOLDOWN_SECONDS,
    ) -> None:
        self._empty_streak = {a.source_id: 0 for a in adapters}
        self._paused_until: dict[str, float] = {}
        self._dead_after = dead_after
        self._cooldown = cooldown_seconds
        self._lock = threading.Lock()

    def alive(self, adapters: list) -> list:
        now = time.monotonic()
        with self._lock:
            return [a for a in adapters if self._paused_until.get(a.source_id, 0) <= now]

    def record(self, source_id: str, offer_count: int) -> None:
        with self._lock:
            if offer_count > 0:
                self._empty_streak[source_id] = 0
                return
            self._empty_streak[source_id] = self._empty_streak.get(source_id, 0) + 1
            if self._empty_streak[source_id] >= self._dead_after:
                self._empty_streak[source_id] = 0
                self._paused_until[source_id] = time.monotonic() + self._cooldown
                log.warning(
                    "adapter %s devolveu 0 oferta %d vezes seguidas — pausando por %ds",
                    source_id, self._dead_after, self._cooldown,
                )


def _process_product(cp_adapter, br_adapters, db, title: str, model_url: str, now: datetime, health=None) -> int:
    """Extrai ofertas PY direto da página do produto (sem rebuscar no Compras
    Paraguai — a busca deles retorna 0 resultados pra queries longas/específicas,
    mesmo quando o produto existe: confirmado ao vivo com o título completo de um
    Bvlgari Man vs. só "Bvlgari Man"). Já sabemos a URL exata pela varredura de
    categoria, então não precisamos arriscar isso. BR: deriva query limpa a partir
    das ofertas PY e busca nos adapters BR, igual scrape_offers ao vivo."""
    from app.main import _upsert_offers
    from app.services.compare import _br_queries_from_py_offers, _convert_raw_offers, _run_adapters
    from app.services.matcher import extract_specs
    from app.services.normalization import normalize_text

    normalized_title = normalize_text(title)

    try:
        raw_py_offers = cp_adapter._extract_offers_from_model_page(title, model_url, title)
    except Exception:
        log.exception("  falha extraindo ofertas de %s", model_url)
        raw_py_offers = []

    # O adapter já filtrou relevância (ou confiou no casamento do próprio CP) —
    # refiltrar pelo título longo do modelo derrubava ~85% das ofertas reais.
    py_offers = _convert_raw_offers(raw_py_offers, normalized_title, match_query=False)

    br_queries = _br_queries_from_py_offers(py_offers, normalized_title) if py_offers else [normalized_title]

    br_offers = []
    seen_queries = set()
    seen_br_offers = set()
    for br_query in br_queries:
        if br_query in seen_queries:
            continue
        seen_queries.add(br_query)

        # Um adapter por vez (em vez de _run_adapters na lista toda) só pra conseguir
        # contar o resultado de cada um e alimentar o AdapterHealth.
        for adapter in (health.alive(br_adapters) if health else br_adapters):
            found = _run_adapters([adapter], br_query)
            if health:
                health.record(adapter.source_id, len(found))
            for offer in found:
                key = (offer.store.lower(), normalize_text(offer.title), offer.price.amount)
                if key in seen_br_offers:
                    continue
                seen_br_offers.add(key)
                br_offers.append(offer)

    offers = py_offers + br_offers
    if not offers:
        return 0

    _upsert_offers(db, offers, now)

    catalog_expiry = now + timedelta(days=CATALOG_TTL_DAYS)
    for offer in offers:
        _set_specs(db, offer.url, extract_specs(offer.title))
        _extend_expiry(db, offer.url, catalog_expiry)
    db.commit()

    return len(offers)


def run(only_category: str | None, max_pages: int | None, host_delay: float, workers: int, refresh_categories: bool, max_tier: int | None = None) -> None:
    from app.adapters.buscape import BuscapeAdapter
    from app.adapters.comprasparaguai import ComprasParaguaiAdapter
    from app.adapters.mercadolivre import MercadoLivreAdapter
    from app.adapters.base import set_request_throttle
    from app.database import SessionLocal, init_db

    _setup_logging()
    init_db()

    set_request_throttle(host_delay)
    adapter = ComprasParaguaiAdapter()
    br_adapters = [BuscapeAdapter(), MercadoLivreAdapter()]
    health = AdapterHealth(br_adapters)
    log.info("Ritmo: %d workers, %.1fs entre requisições ao mesmo host", workers, host_delay)

    # Fora do try/except principal lá embaixo, então precisa do seu próprio — senão uma
    # falha aqui escapa sem nunca escrever status.json e a Admin UI fica mostrando o
    # snapshot da run anterior pra sempre.
    try:
        categories = (
            [{"url": only_category, "name": only_category, "group": None, "department": None}]
            if only_category
            else _load_categories(adapter, refresh_categories)
        )
    except Exception as exc:
        log.exception("Não foi possível carregar as categorias")
        _write_status(state="error", error=str(exc), started_at=datetime.now(timezone.utc).isoformat())
        raise

    if only_category is None:
        categories = _order_categories(categories)
        if max_tier is not None:
            kept = [c for c in categories if _tier_of(c) <= max_tier]
            log.info(
                "--max-tier %d (%s): %d de %d categorias",
                max_tier, PRIORITY_TIERS[max_tier][0], len(kept), len(categories),
            )
            categories = kept
        _log_tier_summary(categories)
    order_key = _order_fingerprint(categories)

    resumable = only_category is None
    checkpoint = _load_checkpoint(order_key) if resumable else {"category_index": 0, "page": 1, "seen_titles": []}
    seen_titles = set(checkpoint["seen_titles"])
    start_index = checkpoint["category_index"]
    start_page = checkpoint["page"]

    total_offers = 0
    stopped = False
    progress_lock = threading.Lock()
    worker_sessions: list = []
    STOP_FLAG_FILE.unlink(missing_ok=True)
    _write_status(
        state="running",
        started_at=datetime.now(timezone.utc).isoformat(),
        total_categories=len(categories),
        category_index=start_index,
        current_page=start_page,
        current_product=None,
        products_mapped=len(seen_titles),
        offers_this_run=0,
        error=None,
    )
    consecutive_page_failures = 0
    try:
        for cat_idx in range(start_index, len(categories)):
            category = categories[cat_idx]
            category_url = category["url"]
            page = start_page if cat_idx == start_index else 1

            log.info(
                "Categoria [%d/%d] %s > %s > %s (a partir da página %d)",
                cat_idx + 1, len(categories), category["department"], category["group"], category["name"], page,
            )
            _write_status(category_index=cat_idx, current_page=page, current_category={
                "department": category["department"], "group": category["group"],
                "name": category["name"], "url": category["url"],
            })

            while True:
                if max_pages and page > max_pages:
                    break

                try:
                    products = adapter.list_category_page(category_url, page)
                    consecutive_page_failures = 0
                except Exception as exc:
                    consecutive_page_failures += 1
                    # 403/429 = bloqueio (Cloudflare). Seguir em frente só "pularia" todas
                    # as categorias restantes e marcaria a run como concluída — foi o que
                    # aconteceu em 2026-10-01 com ~140 categorias. Para com erro e deixa o
                    # checkpoint na última página boa pra retomar dali.
                    status = getattr(getattr(exc, "response", None), "status_code", None)
                    if status in (403, 429) or consecutive_page_failures >= MAX_CONSECUTIVE_PAGE_FAILURES:
                        raise RuntimeError(
                            f"Compras Paraguai bloqueando ({status or exc.__class__.__name__}) em "
                            f"{category_url} página {page} — abortando pra não pular categorias"
                        ) from exc
                    log.exception("Falha ao buscar %s página %d — pulando categoria", category_url, page)
                    break

                if not products:
                    break

                todo = [(t, u) for t, u in products if t not in seen_titles]
                seen_titles.update(t for t, _ in todo)

                def _work(item):
                    """Roda num worker. O ritmo não é mais um sleep aqui — quem segura é
                    o throttle por host dentro do adapter, então N workers em paralelo
                    não aumentam a pressão em nenhum servidor."""
                    nonlocal total_offers
                    title, model_url = item
                    if STOP_FLAG_FILE.exists():
                        return
                    db = _thread_db(SessionLocal)
                    with progress_lock:
                        if db not in worker_sessions:
                            worker_sessions.append(db)
                    try:
                        count = _process_product(
                            adapter, br_adapters, db, title, model_url,
                            datetime.now(timezone.utc), health,
                        )
                    except Exception:
                        db.rollback()
                        log.exception("  falha processando %r", title)
                        return
                    with progress_lock:
                        total_offers += count
                        log.info("  %-60s -> %d ofertas (total: %d)", title[:60], count, total_offers)
                        _write_status(
                            category_index=cat_idx, current_page=page, current_product=title,
                            products_mapped=len(seen_titles), offers_this_run=total_offers,
                        )

                if todo:
                    with ThreadPoolExecutor(max_workers=workers) as pool:
                        # list() força o consumo — o map é preguiçoso e o __exit__ do
                        # pool já espera os workers em voo terminarem, que é o que a
                        # parada graciosa precisa (nenhum produto fica pela metade).
                        list(pool.map(_work, todo))

                if STOP_FLAG_FILE.exists():
                    log.info("Parada solicitada — salvando checkpoint e encerrando.")
                    stopped = True

                if resumable:
                    _save_checkpoint(cat_idx, page, seen_titles, order_key)
                if stopped:
                    break
                page += 1

            if stopped:
                break
    except Exception as exc:
        log.exception("Crawler encerrou com erro")
        _write_status(state="error", error=str(exc))
        raise
    finally:
        _close_thread_dbs(worker_sessions)

    if stopped:
        STOP_FLAG_FILE.unlink(missing_ok=True)
        log.info("Encerrado por pedido de parada. %d ofertas processadas nesta sessão.", total_offers)
        _write_status(state="stopped", offers_this_run=total_offers)
        return

    log.info("Concluído. %d ofertas processadas.", total_offers)
    if resumable:
        CHECKPOINT_FILE.unlink(missing_ok=True)
    _write_status(state="completed", offers_this_run=total_offers)


def main() -> None:
    parser = argparse.ArgumentParser(description="Crawler de catálogo — varre categorias do Compras Paraguai")
    parser.add_argument("--only-category", help="Roda só uma categoria (ex: /perfume/), ignora o checkpoint")
    parser.add_argument("--max-pages", type=int, help="Limite de páginas por categoria (útil pra smoke test)")
    parser.add_argument("--host-delay", type=float, default=DEFAULT_HOST_DELAY_SECONDS,
                        help="Intervalo mínimo (s) entre requisições ao MESMO host. 0 desliga o freio.")
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS,
                        help="Produtos processados em paralelo")
    # Aceitos só pra não quebrar quem tem o comando antigo no histórico do shell.
    parser.add_argument("--delay-min", type=float, help=argparse.SUPPRESS)
    parser.add_argument("--delay-max", type=float, help=argparse.SUPPRESS)
    parser.add_argument("--refresh-categories", action="store_true", help="Força re-fetch da árvore de categorias")
    parser.add_argument(
        "--max-tier", type=int,
        help="Para no tier N da ordem de prioridade (0=%s ... %d=%s). Ex: --max-tier 4 crawleia as prioritárias e para antes de 'o resto'." % (
            PRIORITY_TIERS[0][0], len(PRIORITY_TIERS) - 1, PRIORITY_TIERS[-1][0]),
    )
    args = parser.parse_args()

    host_delay = args.host_delay
    if args.delay_min is not None or args.delay_max is not None:
        legacy = [d for d in (args.delay_min, args.delay_max) if d is not None]
        host_delay = sum(legacy) / len(legacy)
        print(
            f"aviso: --delay-min/--delay-max saíram de cena (o freio agora é por host, "
            f"não entre produtos). Usando --host-delay {host_delay:.1f}.",
            file=sys.stderr,
        )

    run(args.only_category, args.max_pages, host_delay, args.workers, args.refresh_categories, args.max_tier)


if __name__ == "__main__":
    main()
