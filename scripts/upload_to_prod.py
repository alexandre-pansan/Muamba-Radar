"""
Envia os resultados do maps_scraper.py para a API de produção.

Lê resultados_maps/resultados.json, converte para o formato StoreImportItem
(com foto em base64) e faz POST em /admin/stores/import.

Uso:
    python scripts/upload_to_prod.py \
        --input resultados_maps/resultados.json \
        --api https://api.muambaradar.com \
        --email admin@exemplo.com \
        --password suasenha

    # ou com token já em mãos:
    python scripts/upload_to_prod.py \
        --input resultados_maps/resultados.json \
        --api https://api.muambaradar.com \
        --token eyJ...
"""

import argparse
import base64
import json
import mimetypes
import sys
from pathlib import Path

import requests


# ── auth ──────────────────────────────────────────────────────────────────────

def login(api: str, email: str, password: str) -> str:
    r = requests.post(
        f"{api}/auth/login",
        data={"username": email, "password": password},
        timeout=15,
    )
    r.raise_for_status()
    return r.json()["access_token"]


# ── build payload ─────────────────────────────────────────────────────────────

def _encode_photo(path: str) -> tuple[str, str] | tuple[None, None]:
    p = Path(path)
    if not p.exists():
        return None, None
    mime = mimetypes.guess_type(str(p))[0] or "image/jpeg"
    data = base64.b64encode(p.read_bytes()).decode()
    return data, mime


def build_payload(results: list[dict]) -> list[dict]:
    payload = []
    for r in results:
        if r.get("status") != "ok":
            continue

        item: dict = {
            "name": r.get("name_maps") or r["name"],
            "country": "py",
        }

        if r.get("address"):
            item["address"] = r["address"]
        if r.get("lat") is not None:
            item["lat"] = r["lat"]
        if r.get("lng") is not None:
            item["lng"] = r["lng"]
        if r.get("google_maps_url"):
            item["google_maps_url"] = r["google_maps_url"]

        # Use first available photo as the store photo
        for photo_path in r.get("photos", []):
            data, mime = _encode_photo(photo_path)
            if data:
                item["photo_data"] = data
                item["photo_mime"] = mime
                break

        payload.append(item)
    return payload


# ── upload ────────────────────────────────────────────────────────────────────

def upload(api: str, token: str, payload: list[dict]) -> dict:
    r = requests.post(
        f"{api}/admin/stores/import",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
        timeout=120,
    )
    r.raise_for_status()
    return r.json()


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Envia resultados do scraper para produção")
    parser.add_argument("--input", required=True, help="resultados.json gerado pelo maps_scraper.py")
    parser.add_argument("--api", required=True, help="URL base da API (ex: https://api.muambaradar.com)")
    parser.add_argument("--token", help="Bearer token (se já tiver)")
    parser.add_argument("--email", help="E-mail admin")
    parser.add_argument("--password", help="Senha admin")
    parser.add_argument("--dry-run", action="store_true", help="Mostra payload sem enviar")
    args = parser.parse_args()

    with open(args.input, encoding="utf-8") as f:
        results = json.load(f)

    payload = build_payload(results)
    print(f"Lojas prontas para envio: {len(payload)}")
    with_photo = sum(1 for p in payload if p.get("photo_data"))
    print(f"  Com foto: {with_photo} | Sem foto: {len(payload) - with_photo}")

    if args.dry_run:
        # Print without base64 blobs to keep output readable
        preview = [{k: v for k, v in p.items() if k != "photo_data"} for p in payload]
        print(json.dumps(preview, ensure_ascii=False, indent=2))
        return

    if not payload:
        print("Nenhuma loja com status ok. Abortando.")
        sys.exit(1)

    token = args.token
    if not token:
        if not args.email or not args.password:
            print("Informe --token ou --email + --password")
            sys.exit(1)
        print("Fazendo login...")
        token = login(args.api.rstrip("/"), args.email, args.password)
        print("Login OK")

    print("Enviando para produção...")
    result = upload(args.api.rstrip("/"), token, payload)
    print(f"Resultado: criadas={result['created']} atualizadas={result['updated']} ignoradas={result['skipped']}")


if __name__ == "__main__":
    main()
