"""Exporta/importa o catálogo de ofertas (product_offers) como arquivo .jsonl.gz.

Fluxo: Admin local → "Exportar catálogo" baixa o arquivo → Admin de prod →
"Importar catálogo" faz upload. Nenhuma conexão direta entre os ambientes.

Formato: 1ª linha é um cabeçalho {"_meta": {...}}, cada linha seguinte é uma oferta.

Dedup no import (o mesmo arquivo pode ser importado N vezes sem duplicar nada):
  1. Mesma URL = mesma oferta. Vence a captura mais recente (arquivo ou banco).
  2. Mesma loja + título normalizado + preço com URLs diferentes = mesma oferta
     também (o crawler gerava isso quando o CP linkava a oferta pra páginas
     diferentes). Fica só a captura mais recente.
     Título igual com preço diferente NÃO é duplicata: no Buscapé, por exemplo,
     são vendedores diferentes do mesmo produto.
"""
from __future__ import annotations

import gzip
import io
import json
import zlib
from collections.abc import Iterator
from datetime import datetime, timezone
from typing import BinaryIO

from sqlalchemy import Engine

FORMAT = "muambaradar-catalog"
FORMAT_VERSION = 1
COLUMNS = (
    "url", "source", "country", "store", "title", "title_norm", "image_url",
    "price_amount", "price_currency", "brand", "model", "specs",
    "captured_at", "expires_at",
)
_EXPORT_BATCH = 5000


def export_catalog(engine: Engine) -> Iterator[bytes]:
    """Gera o .jsonl.gz em pedaços (streaming) — não monta 300k linhas em memória."""
    gz = zlib.compressobj(6, zlib.DEFLATED, 31)  # wbits=31 → container gzip
    raw = engine.raw_connection()
    try:
        with raw.cursor() as cur:
            cur.execute("SELECT count(*) FROM product_offers WHERE expires_at > now() AND lower(store) NOT IN ('comprasparaguai', 'compras paraguai')")
            total = cur.fetchone()[0]
        header = {"_meta": {
            "format": FORMAT,
            "version": FORMAT_VERSION,
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "count": total,
        }}
        yield gz.compress((json.dumps(header) + "\n").encode())

        # Cursor nomeado = server-side, busca em lotes.
        with raw.cursor(name="catalog_export") as cur:
            cur.itersize = _EXPORT_BATCH
            cur.execute(
                f"SELECT {', '.join(COLUMNS)} FROM product_offers "
                "WHERE expires_at > now() AND lower(store) NOT IN ('comprasparaguai', 'compras paraguai') ORDER BY id"
            )
            buf = io.StringIO()
            for n, row in enumerate(cur, 1):
                rec = dict(zip(COLUMNS, row))
                rec["captured_at"] = rec["captured_at"].isoformat()
                rec["expires_at"] = rec["expires_at"].isoformat()
                buf.write(json.dumps(rec, ensure_ascii=False))
                buf.write("\n")
                if n % _EXPORT_BATCH == 0:
                    yield gz.compress(buf.getvalue().encode())
                    buf = io.StringIO()
            yield gz.compress(buf.getvalue().encode())
        yield gz.flush()
    finally:
        raw.close()


class CatalogImportError(ValueError):
    pass


def _iter_records(fileobj: BinaryIO) -> tuple[dict, Iterator[dict]]:
    text = io.TextIOWrapper(gzip.GzipFile(fileobj=fileobj, mode="rb"), encoding="utf-8")
    try:
        first = json.loads(text.readline())
    except (OSError, EOFError, json.JSONDecodeError) as exc:
        raise CatalogImportError("Arquivo inválido — use o .jsonl.gz gerado por 'Exportar catálogo'.") from exc
    meta = first.get("_meta") if isinstance(first, dict) else None
    if not meta or meta.get("format") != FORMAT:
        raise CatalogImportError("Arquivo não é um export de catálogo do MuambaRadar.")
    if meta.get("version") != FORMAT_VERSION:
        raise CatalogImportError(f"Versão de export não suportada: {meta.get('version')}")

    def records():
        for line in text:
            if line.strip():
                yield json.loads(line)
    return meta, records()


def _copy_text(value) -> str:
    """Escapa um valor pro formato texto do COPY."""
    if value is None:
        return r"\N"
    if isinstance(value, dict):
        value = json.dumps(value, ensure_ascii=False)
    return (
        str(value).replace("\\", "\\\\").replace("\t", "\\t")
        .replace("\n", "\\n").replace("\r", "\\r")
    )


def import_catalog(engine: Engine, fileobj: BinaryIO) -> dict:
    """Importa o arquivo. Tudo numa transação: ou entra inteiro, ou nada."""
    meta, records = _iter_records(fileobj)
    now = datetime.now(timezone.utc)

    # Monta o payload do COPY já descartando o que venceu.
    read = expired = 0
    payload = io.StringIO()
    try:
        for rec in records:
            read += 1
            if datetime.fromisoformat(rec["expires_at"]) <= now:
                expired += 1
                continue
            payload.write("\t".join(_copy_text(rec.get(c)) for c in COLUMNS))
            payload.write("\n")
    except (OSError, EOFError, json.JSONDecodeError, KeyError) as exc:
        raise CatalogImportError(f"Arquivo corrompido ou truncado (linha {read + 1}).") from exc
    if read != meta.get("count"):
        raise CatalogImportError(
            f"Arquivo incompleto: cabeçalho diz {meta.get('count')} ofertas, arquivo tem {read}."
        )
    payload.seek(0)

    cols = ", ".join(COLUMNS)
    natural_key = "country, source, lower(store), title_norm, price_amount"
    raw = engine.raw_connection()
    try:
        with raw.cursor() as cur:
            cur.execute("ALTER TABLE product_offers ADD COLUMN IF NOT EXISTS specs JSONB")
            cur.execute(f"""
                CREATE TEMP TABLE catalog_in (LIKE product_offers INCLUDING DEFAULTS) ON COMMIT DROP;
                ALTER TABLE catalog_in DROP COLUMN id;
            """)
            cur.copy_expert(f"COPY catalog_in ({cols}) FROM STDIN", payload)
            cur.execute("SELECT count(*) FROM catalog_in")
            loaded = cur.fetchone()[0]

            # 1) Dedup dentro do próprio arquivo: por URL, depois por chave natural.
            cur.execute(f"""
                DELETE FROM catalog_in a USING (
                    SELECT ctid, row_number() OVER (
                        PARTITION BY url ORDER BY captured_at DESC
                    ) AS rn FROM catalog_in
                ) d WHERE a.ctid = d.ctid AND d.rn > 1
            """)
            dup_url_in_file = cur.rowcount
            cur.execute(f"""
                DELETE FROM catalog_in a USING (
                    SELECT ctid, row_number() OVER (
                        PARTITION BY {natural_key} ORDER BY captured_at DESC, url
                    ) AS rn FROM catalog_in
                ) d WHERE a.ctid = d.ctid AND d.rn > 1
            """)
            dup_key_in_file = cur.rowcount

            # 2) Mesma oferta já no banco com outra URL: fica a mais recente.
            #    Banco mais novo → descarta a do arquivo.
            cur.execute(f"""
                DELETE FROM catalog_in i USING product_offers p
                WHERE (p.country, p.source, lower(p.store), p.title_norm, p.price_amount)
                    = (i.country, i.source, lower(i.store), i.title_norm, i.price_amount)
                  AND p.url <> i.url AND p.captured_at >= i.captured_at
            """)
            kept_db_same_offer = cur.rowcount
            #    Arquivo mais novo → remove a do banco, a do arquivo entra no lugar.
            cur.execute(f"""
                DELETE FROM product_offers p USING catalog_in i
                WHERE (p.country, p.source, lower(p.store), p.title_norm, p.price_amount)
                    = (i.country, i.source, lower(i.store), i.title_norm, i.price_amount)
                  AND p.url <> i.url AND p.captured_at < i.captured_at
            """)
            replaced_db_same_offer = cur.rowcount

            # 3) Upsert por URL — só sobrescreve se a captura do arquivo for mais nova.
            cur.execute("SELECT count(*) FROM catalog_in i JOIN product_offers p USING (url)")
            existing_urls = cur.fetchone()[0]
            updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in COLUMNS if c != "url")
            cur.execute(f"""
                INSERT INTO product_offers ({cols})
                SELECT {cols} FROM catalog_in
                ON CONFLICT (url) DO UPDATE SET {updates}
                WHERE product_offers.captured_at < EXCLUDED.captured_at
            """)
            written = cur.rowcount
        raw.commit()
    except Exception:
        raw.rollback()
        raise
    finally:
        raw.close()

    remaining = loaded - dup_url_in_file - dup_key_in_file - kept_db_same_offer
    inserted = remaining - existing_urls
    updated = written - inserted
    return {
        "exported_at": meta.get("exported_at"),
        "read": read,
        "inserted": inserted,
        "updated": updated,
        "unchanged": existing_urls - updated,  # banco já tinha igual ou mais novo
        "duplicates_in_file": dup_url_in_file + dup_key_in_file,
        "kept_db_newer": kept_db_same_offer,
        "replaced_db_older": replaced_db_same_offer,
        "expired_skipped": expired,
    }
