"""
Exporta lojas direto do banco local para um arquivo JSON (com fotos em base64).
Esse arquivo pode ser importado no prod via:

    python scripts/import_prod.py --input stores_export.json \
        --api https://api.muambaradar.com --email ... --password ...

Uso:
    cd backend
    python ../scripts/export_stores.py --output ../stores_export.json
"""

import argparse
import base64
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("Instale: pip install psycopg2-binary")
    sys.exit(1)

STATIC_DIR = Path(__file__).parent.parent / "backend" / "static"

MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
        ".webp": "image/webp", ".gif": "image/gif"}


def _load_db_url() -> str:
    try:
        from app.config import settings
        return settings.database_url
    except Exception:
        return os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/mamu")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default=_load_db_url())
    parser.add_argument("--output", default="stores_export.json")
    args = parser.parse_args()

    conn = psycopg2.connect(args.db)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM stores ORDER BY name")
    rows = cur.fetchall()
    cur.close()
    conn.close()

    stores = []
    for row in rows:
        s = dict(row)
        # Convert datetime to string
        for k in ("created_at", "updated_at"):
            if s.get(k):
                s[k] = s[k].isoformat()

        # Embed photo as base64
        photo_url = s.get("photo_url") or ""
        if photo_url.startswith("/static/"):
            photo_path = STATIC_DIR / photo_url.removeprefix("/static/").lstrip("/")
            if photo_path.exists():
                ext = photo_path.suffix.lower()
                s["photo_data"] = base64.b64encode(photo_path.read_bytes()).decode()
                s["photo_mime"] = MIME.get(ext, "image/jpeg")
                s["photo_url"] = None  # don't send local path to prod

        stores.append(s)

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(stores, f, ensure_ascii=False, indent=2)

    with_photo = sum(1 for s in stores if s.get("photo_data"))
    print(f"Exportado: {args.output} | {len(stores)} lojas | {with_photo} com foto")


if __name__ == "__main__":
    main()
