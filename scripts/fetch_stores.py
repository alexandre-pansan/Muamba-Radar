"""
Busca lojas direto do banco local e gera lojas.json para o maps_scraper.py.

Uso:
    python scripts/fetch_stores.py --output lojas.json
    python scripts/fetch_stores.py --mode existing   # sem foto
    python scripts/fetch_stores.py --mode all        # ambos
    python scripts/fetch_stores.py --db postgresql://user:pass@localhost/mamu
"""

import argparse
import json
import os
import sys
from pathlib import Path

# Allow running from repo root without installing the package
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("Instale: pip install psycopg2-binary")
    sys.exit(1)


def _load_db_url() -> str:
    try:
        from app.config import settings
        return settings.database_url
    except Exception:
        return os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/mamu")

DEFAULT_DB = _load_db_url()


def get_conn(db_url: str):
    return psycopg2.connect(db_url)


def fetch_unmatched(cur) -> list[str]:
    """Nomes de lojas em product_offers/cart sem Store cadastrada."""
    cur.execute("""
        SELECT DISTINCT store AS name FROM product_offers WHERE country = 'py'
        UNION
        SELECT DISTINCT store_name FROM user_cart_items WHERE store_id IS NULL AND country = 'py'
    """)
    candidates = {row[0] for row in cur.fetchall()}

    cur.execute("SELECT name, name_aliases FROM stores")
    known: set[str] = set()
    for name, aliases in cur.fetchall():
        known.add(name.lower())
        for a in (aliases or []):
            known.add(a.lower())

    return sorted(c for c in candidates if c.lower() not in known)


def fetch_existing_without_photo(cur) -> list[str]:
    cur.execute("SELECT name FROM stores WHERE photo_url IS NULL ORDER BY name")
    return [row[0] for row in cur.fetchall()]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default=DEFAULT_DB, help="PostgreSQL URL")
    parser.add_argument("--output", default="lojas.json")
    parser.add_argument("--mode", choices=["unmatched", "existing", "all"], default="unmatched")
    args = parser.parse_args()

    conn = get_conn(args.db)
    cur = conn.cursor()

    names: list[str] = []

    if args.mode in ("unmatched", "all"):
        u = fetch_unmatched(cur)
        print(f"Lojas sem cadastro: {len(u)}")
        names += u

    if args.mode in ("existing", "all"):
        e = fetch_existing_without_photo(cur)
        print(f"Lojas sem foto: {len(e)}")
        names += e

    seen: set[str] = set()
    unique = [n for n in names if not (n in seen or seen.add(n))]

    cur.close()
    conn.close()

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(unique, f, ensure_ascii=False, indent=2)

    print(f"Salvo: {args.output} ({len(unique)} lojas)")


if __name__ == "__main__":
    main()
