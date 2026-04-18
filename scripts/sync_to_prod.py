"""
Exporta lojas do banco local e importa na API de produção.

Uso:
    cd backend
    python ../scripts/sync_to_prod.py \
        --api https://api.muambaradar.com \
        --email admin@... --password suasenha
"""

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

import requests


def _load_local_api_url() -> str:
    try:
        from app.config import settings
        _ = settings.database_url  # just to confirm config loads
    except Exception:
        pass
    return os.getenv("LOCAL_API", "http://localhost:8000")


def login(api: str, email: str, password: str) -> str:
    r = requests.post(f"{api}/auth/login", data={"username": email, "password": password}, timeout=15)
    r.raise_for_status()
    return r.json()["access_token"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--local-api", default="http://localhost:8000")
    parser.add_argument("--api", required=True, help="URL da API de produção")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    local = args.local_api.rstrip("/")
    prod = args.api.rstrip("/")

    # Login em ambos
    print("Login local...")
    local_token = login(local, args.email, args.password)

    print("Login produção...")
    prod_token = login(prod, args.email, args.password)

    # Exportar do local (já vem com photo_data em base64)
    print("Exportando lojas do local...")
    r = requests.get(f"{local}/admin/stores/export", headers={"Authorization": f"Bearer {local_token}"}, timeout=60)
    r.raise_for_status()
    stores = r.json()
    print(f"  {len(stores)} lojas exportadas")

    if args.dry_run:
        for s in stores:
            print(f"  - {s['name']} | foto={'sim' if s.get('photo_data') else 'nao'} | lat={s.get('lat')}")
        return

    # Importar no prod
    print("Importando na produção...")
    r = requests.post(
        f"{prod}/admin/stores/import",
        json=stores,
        headers={"Authorization": f"Bearer {prod_token}"},
        timeout=120,
    )
    r.raise_for_status()
    result = r.json()
    print(f"Pronto! criadas={result['created']} atualizadas={result['updated']} ignoradas={result['skipped']}")


if __name__ == "__main__":
    main()
