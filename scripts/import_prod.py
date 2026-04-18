"""
Importa o arquivo gerado pelo export_stores.py na API de produção.

Uso:
    python scripts/import_prod.py \
        --input stores_export.json \
        --api https://api.muambaradar.com \
        --email admin@... --password suasenha
"""

import argparse
import json
import requests


def login(api: str, email: str, password: str) -> str:
    r = requests.post(f"{api}/auth/login", data={"username": email, "password": password}, timeout=15)
    r.raise_for_status()
    return r.json()["access_token"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--api", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    with open(args.input, encoding="utf-8") as f:
        stores = json.load(f)

    with_photo = sum(1 for s in stores if s.get("photo_data"))
    print(f"{len(stores)} lojas | {with_photo} com foto")

    if args.dry_run:
        for s in stores:
            print(f"  - {s['name']} | foto={'sim' if s.get('photo_data') else 'nao'} | lat={s.get('lat')}")
        return

    token = login(args.api.rstrip("/"), args.email, args.password)

    r = requests.post(
        f"{args.api.rstrip('/')}/admin/stores/import",
        json=stores,
        headers={"Authorization": f"Bearer {token}"},
        timeout=120,
    )
    r.raise_for_status()
    result = r.json()
    print(f"Pronto! criadas={result['created']} atualizadas={result['updated']} ignoradas={result['skipped']}")


if __name__ == "__main__":
    main()
