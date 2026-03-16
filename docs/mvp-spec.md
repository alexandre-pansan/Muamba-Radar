# MVP Spec - MAMU

## Goal
Compare the same product prices between Paraguay and Brazil from a single search query.

## Scope (V1)
- Input modes:
  - Text search by product name.
  - Image upload endpoint placeholder (implemented later).
- Countries:
  - Paraguay: `comprasparaguai.com.br`.
  - Brazil: first source `mercadolivre.com.br`.
- Categories (initially optimized): phones, GPUs, notebooks.

## API Contract (V1)
### GET `/compare?q=<query>`
- Required query param: `q`.
- Optional query params:
  - `country` (`all|py|br`, default `all`)
  - `sort` (`best_match|lowest_price`, default `best_match`)

### Response shape
```json
{
  "query": "iphone 15 128gb",
  "generated_at": "2026-02-26T19:00:00Z",
  "groups": [
    {
      "product_key": "apple_iphone_15_128gb",
      "canonical_name": "Apple iPhone 15 128GB",
      "match_confidence": 0.93,
      "offers": [
        {
          "source": "comprasparaguai",
          "country": "py",
          "store": "Loja X",
          "title": "Apple iPhone 15 128GB Preto",
          "brand": "Apple",
          "model": "iPhone 15",
          "price": {
            "amount": 5600000,
            "currency": "PYG",
            "amount_brl": 3920.50,
            "fx_rate_used": 1428.40,
            "fx_rate_timestamp": "2026-02-26T18:55:00Z"
          },
          "url": "https://...",
          "captured_at": "2026-02-26T18:58:00Z"
        }
      ],
      "cheapest": {
        "overall_offer_id": "...",
        "py_offer_id": "...",
        "br_offer_id": "..."
      }
    }
  ]
}
```

## Canonical Offer Schema
Each source adapter must emit:
- `source`: short source id.
- `country`: `py` or `br`.
- `store`: seller/store name.
- `title`: original listing title.
- `brand`: normalized brand if found.
- `model`: normalized model if found.
- `price_amount`: numeric original amount.
- `price_currency`: ISO code (`PYG`, `BRL`).
- `url`: listing URL.
- `captured_at`: UTC timestamp.

## Matching Rules (V1)
1. Exact `model`/SKU match if available.
2. Otherwise match by `brand + model` fuzzy similarity.
3. Otherwise fallback to title similarity.
4. Accept only score >= `0.82`.

## Non-Goals (V1)
- Tax/import simulation.
- Historical charts.
- Multi-image product recognition.

## Immediate Build Order
1. Build adapter interface + two adapters.
2. Build normalizer + matcher.
3. Build `/compare` endpoint returning this contract.
4. Connect simple frontend table.
