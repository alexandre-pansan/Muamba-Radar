"""
Exporta lojas do banco local e importa no VPS via SSH.

Uso:
    cd backend
    python ../scripts/push_to_vps.py
    python ../scripts/push_to_vps.py --dry-run
    python ../scripts/push_to_vps.py --from ../stores_export.json  # usar JSON existente
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

SSH_KEY         = str(Path.home() / "Downloads" / "github_actions_deploy")
SSH_HOST        = "root@92.112.179.40"
SSH             = ["ssh", "-i", SSH_KEY, "-o", "StrictHostKeyChecking=no", SSH_HOST]
BACKEND_SERVICE = "backend"


def sh(cmd: list[str], check=True) -> str:
    result = subprocess.run(cmd, capture_output=True, text=True)
    if check and result.returncode != 0:
        print(result.stderr)
        sys.exit(1)
    return result.stdout.strip()


def get_container_id() -> str:
    out = sh(SSH + [f"docker ps -qf name={BACKEND_SERVICE}"])
    if not out:
        print(f"Container '{BACKEND_SERVICE}' não encontrado.")
        sys.exit(1)
    return out.splitlines()[0]


def export_local() -> list[dict]:
    import base64
    import psycopg2
    import psycopg2.extras

    def _db_url():
        try:
            from app.config import settings
            return settings.database_url
        except Exception:
            return os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/mamu")

    STATIC_DIR = Path(__file__).parent.parent / "backend" / "static"
    MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
            ".webp": "image/webp", ".gif": "image/gif"}

    conn = psycopg2.connect(_db_url())
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM stores ORDER BY name")
    rows = cur.fetchall()
    cur.close(); conn.close()

    stores = []
    for row in rows:
        s = dict(row)
        for k in ("created_at", "updated_at"):
            if s.get(k):
                s[k] = s[k].isoformat()
        photo_url = s.get("photo_url") or ""
        if photo_url.startswith("/static/"):
            p = STATIC_DIR / photo_url.removeprefix("/static/").lstrip("/")
            if p.exists():
                s["photo_data"] = base64.b64encode(p.read_bytes()).decode()
                s["photo_mime"] = MIME.get(p.suffix.lower(), "image/jpeg")
                s["photo_url"]  = None
        stores.append(s)
    return stores


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--from", dest="from_file", help="Usar JSON exportado em vez do banco local")
    args = parser.parse_args()

    if args.from_file:
        with open(args.from_file, encoding="utf-8") as f:
            stores = json.load(f)
        print(f"Carregado: {args.from_file}")
    else:
        print("Exportando banco local...")
        stores = export_local()

    with_photo = sum(1 for s in stores if s.get("photo_data") or s.get("photo_url"))
    print(f"  {len(stores)} lojas | {with_photo} com foto")

    if args.dry_run:
        for s in stores:
            print(f"  - {s['name']} | foto={'sim' if s.get('photo_data') else 'nao'}")
        return

    container = get_container_id()
    print(f"  Container: {container}")

    stores_json = json.dumps(stores, ensure_ascii=False)

    print("Importando no VPS...")
    result = subprocess.run(
        SSH + [f"docker exec -i {container} python3 import_stores.py"],
        input=stores_json,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(result.stderr)
        sys.exit(1)
    print(f"  {result.stdout.strip()}")
    print("Pronto!")


if __name__ == "__main__":
    main()
