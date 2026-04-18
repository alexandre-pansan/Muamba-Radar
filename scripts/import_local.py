"""
Importa resultados do maps_scraper.py direto no banco local.

Uso:
    cd backend
    python ../scripts/import_local.py --input ../resultados_maps/resultados.json
"""

import argparse
import json
import os
import shutil
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("Instale: pip install psycopg2-binary")
    sys.exit(1)

STATIC_PHOTOS_DIR = Path(__file__).parent.parent / "backend" / "static" / "store-photos"


def _load_db_url() -> str:
    try:
        from app.config import settings
        return settings.database_url
    except Exception:
        return os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/mamu")


def copy_photo(src: str, base_dir: Path) -> str | None:
    p = Path(src)
    if not p.is_absolute():
        p = base_dir / p
    if not p.exists():
        return None
    STATIC_PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
    ext = p.suffix or ".jpg"
    dest = STATIC_PHOTOS_DIR / f"{uuid.uuid4().hex}{ext}"
    shutil.copy2(p, dest)
    return f"/static/store-photos/{dest.name}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--db", default=_load_db_url())
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    base_dir = input_path.parent.parent  # resultados_maps/../ = repo root

    with open(input_path, encoding="utf-8") as f:
        results = json.load(f)

    conn = psycopg2.connect(args.db)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    now = datetime.now(timezone.utc)
    created = updated = skipped = 0

    for r in results:
        if r.get("status") != "ok":
            continue

        name = r.get("name_maps") or r["name"]
        address = r.get("address", "").strip().lstrip("\n") or None
        lat = r.get("lat")
        lng = r.get("lng")
        google_maps_url = r.get("google_maps_url")

        # Copy photo to static dir
        photo_url = None
        for p in r.get("photos", []):
            photo_url = copy_photo(p, base_dir)
            if photo_url:
                break

        # Check if store already exists
        cur.execute("SELECT id, photo_url FROM stores WHERE lower(name) = lower(%s)", (name,))
        existing = cur.fetchone()

        if args.dry_run:
            action = "UPDATE" if existing else "CREATE"
            print(f"[{action}] {name} | lat={lat} lng={lng} | foto={'sim' if photo_url else 'nao'}")
            continue

        if existing:
            fields, vals = [], []
            if address:
                fields.append("address = %s"); vals.append(address)
            if lat is not None:
                fields.append("lat = %s"); vals.append(lat)
            if lng is not None:
                fields.append("lng = %s"); vals.append(lng)
            if google_maps_url:
                fields.append("google_maps_url = %s"); vals.append(google_maps_url)
            if photo_url and not existing["photo_url"]:
                fields.append("photo_url = %s"); vals.append(photo_url)
            if fields:
                fields.append("updated_at = %s"); vals.append(now)
                vals.append(existing["id"])
                cur.execute(f"UPDATE stores SET {', '.join(fields)} WHERE id = %s", vals)
                updated += 1
            else:
                skipped += 1
        else:
            cur.execute(
                """INSERT INTO stores (name, country, address, lat, lng, photo_url, google_maps_url, created_at, updated_at)
                   VALUES (%s, 'py', %s, %s, %s, %s, %s, %s, %s)""",
                (name, address, lat, lng, photo_url, google_maps_url, now, now),
            )
            created += 1

    if not args.dry_run:
        conn.commit()

    cur.close()
    conn.close()
    print(f"criadas={created} atualizadas={updated} ignoradas={skipped}")


if __name__ == "__main__":
    main()
