"""
Google Maps scraper via browser automation (no API key needed).
Uses Playwright to search stores, extract data and download photos.

Usage:
    pip install playwright
    playwright install chromium
    python maps_scraper.py --input lojas.json --output resultados/
"""

import asyncio
import json
import os
import re
import sys
import argparse
from pathlib import Path

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("Instale: pip install playwright && playwright install chromium")
    sys.exit(1)


MAPS_SEARCH_URL = "https://www.google.com/maps/search/"


async def scrape_store(page, store_name: str, output_dir: Path) -> dict:
    """Search a store on Google Maps and extract available data."""
    store_dir = output_dir / re.sub(r"[^\w\s-]", "", store_name).strip().replace(" ", "_")
    store_dir.mkdir(parents=True, exist_ok=True)

    result = {"name": store_name, "status": "not_found", "photos": []}

    try:
        query = store_name if "comprasparaguai" in store_name.lower() else f"{store_name} Paraguai"
        await page.goto(f"{MAPS_SEARCH_URL}{query}", wait_until="domcontentloaded", timeout=30000)

        # Wait for first place result to appear, then click it
        first_result = page.locator('a[href*="/maps/place/"]').first
        try:
            await first_result.wait_for(state="visible", timeout=10000)
            await first_result.click()
            # Wait until URL changes to place URL with coordinates
            await page.wait_for_url(lambda u: "@" in u, timeout=10000)
        except Exception:
            pass

        # --- Extract text data ---
        name_el = page.locator('h1[class*="fontHeadlineLarge"]').first
        if await name_el.count():
            result["name_maps"] = (await name_el.inner_text()).strip()

        address_el = page.locator('[data-item-id="address"]').first
        if await address_el.count():
            result["address"] = (await address_el.inner_text()).strip()

        phone_el = page.locator('[data-item-id^="phone:tel:"]').first
        if await phone_el.count():
            result["phone"] = (await phone_el.get_attribute("data-item-id")).replace("phone:tel:", "")

        rating_el = page.locator('div[jslog*="rating"] span[aria-hidden]').first
        if await rating_el.count():
            result["rating"] = (await rating_el.inner_text()).strip()

        hours_el = page.locator('[data-item-id*="oh"] table').first
        if await hours_el.count():
            result["hours"] = (await hours_el.inner_text()).strip()

        website_el = page.locator('[data-item-id="authority"]').first
        if await website_el.count():
            result["website"] = await website_el.get_attribute("href")

        # --- Coordinates from URL (@lat,lng,zoom) ---
        url = page.url
        coord_match = re.search(r"@(-?\d+\.\d+),(-?\d+\.\d+)", url)
        if coord_match:
            result["lat"] = float(coord_match.group(1))
            result["lng"] = float(coord_match.group(2))

        # --- Google Maps URL ---
        result["google_maps_url"] = url

        # --- Hero image (foto do topo do painel esquerdo) ---
        photo_path = None
        hero = page.locator('button[jsaction*="heroHeaderImage"] img, div[jsaction*="heroHeaderImage"] img').first
        try:
            await hero.wait_for(state="visible", timeout=5000)
            src = await hero.get_attribute("src")
            if src:
                src_hd = re.sub(r"=w\d+-h\d+.*", "=w1200-h800", src)
                photo_path = str(store_dir / "photo.jpg")
                from urllib.request import urlretrieve
                urlretrieve(src_hd, photo_path)
        except Exception:
            pass

        if not photo_path:
            # fallback: screenshot
            photo_path = str(store_dir / "screenshot.png")
            await page.screenshot(path=photo_path)

        result["photos"] = [photo_path]

        result["status"] = "ok"

    except Exception as e:
        result["status"] = f"error: {e}"

    return result


async def run(store_list: list[str], output_dir: Path, headless: bool = True):
    output_dir.mkdir(parents=True, exist_ok=True)
    results = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless)
        context = await browser.new_context(
            locale="pt-BR",
            user_agent=(
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
        )
        page = await context.new_page()

        for i, store in enumerate(store_list):
            print(f"[{i+1}/{len(store_list)}] Pesquisando: {store}")
            data = await scrape_store(page, store, output_dir)
            results.append(data)
            print(f"  -> {data['status']} | fotos: {len(data.get('photos', []))}")

            # Polite delay to avoid detection
            await page.wait_for_timeout(1500)

        await browser.close()

    out_file = output_dir / "resultados.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"\nPronto. {len(results)} lojas. Resultados em: {out_file}")
    return results


def main():
    parser = argparse.ArgumentParser(description="Scraper Google Maps sem API")
    parser.add_argument("--input", help="JSON com lista de lojas (array de strings ou objetos com 'name')")
    parser.add_argument("--stores", nargs="+", help="Nomes das lojas direto na linha de comando")
    parser.add_argument("--output", default="resultados_maps", help="Pasta de saída")
    parser.add_argument("--visible", action="store_true", help="Mostrar navegador (debug)")
    args = parser.parse_args()

    store_list: list[str] = []

    if args.input:
        with open(args.input, encoding="utf-8") as f:
            raw = json.load(f)
        if raw and isinstance(raw[0], dict):
            store_list = [s.get("name") or s.get("nome") for s in raw]
        else:
            store_list = raw
    elif args.stores:
        store_list = args.stores
    else:
        # Demo
        store_list = ["McDonald's Copacabana Rio de Janeiro", "Burger King Ipanema"]

    asyncio.run(run(store_list, Path(args.output), headless=not args.visible))


if __name__ == "__main__":
    main()
