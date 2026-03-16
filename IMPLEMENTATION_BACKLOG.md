# MAMU Implementation Backlog

## Recommended Languages
1. Python: backend API, scraping adapters, matching, OCR/vision pipeline.
2. TypeScript: frontend web app.
3. SQL: PostgreSQL schema and queries.
4. PowerShell/Bash: local automation scripts.
5. YAML + Dockerfile: CI/CD and containerization.

## Epic A: Project Foundation
1. A1 - Initialize monorepo with `backend/` and `frontend/` (P0)
- Acceptance: each app runs locally with one command.
2. A2 - Add `.env` config and settings loader (P0)
- Acceptance: startup fails on missing required env vars.
3. A3 - Create PostgreSQL schema + migrations (P0)
- Acceptance: tables for products, offers, sources, search_jobs.

## Epic B: Data Ingestion (Paraguay + Brazil)
4. B1 - Adapter interface `search(query) -> offers[]` (P0)
- Acceptance: common contract shared by all source adapters.
5. B2 - `comprasparaguai` adapter for text queries (P0)
- Acceptance: returns normalized offers with source metadata.
6. B3 - First Brazil adapter (Mercado Livre) (P0)
- Acceptance: same normalized output contract as B2.
7. B4 - Adapter health checks + structured error logging (P1)
- Acceptance: failures tracked per source with timestamps.

## Epic C: Normalization + Matching
8. C1 - Text normalization (accents, symbols, casing) (P0)
- Acceptance: deterministic normalized title per offer.
9. C2 - Attribute extraction (`brand`, `model`, `capacity`, `color`) (P0)
- Acceptance: extracted fields for phones, GPUs, notebooks.
10. C3 - Matching engine (exact model/SKU, fuzzy fallback) (P0)
- Acceptance: grouped offers with confidence score.
11. C4 - Threshold tuning with labeled sample dataset (P1)
- Acceptance: precision/recall report committed.

## Epic D: Compare API
12. D1 - `GET /compare?q=` endpoint (P0)
- Acceptance: grouped Paraguay vs Brazil offers.
13. D2 - Currency conversion BRL/PYG (P0)
- Acceptance: original price, converted price, rate timestamp.
14. D3 - Sort/filter params (`lowest`, `country`, `store`) (P1)
- Acceptance: endpoint supports documented query params.
15. D4 - OpenAPI docs + response examples (P1)
- Acceptance: Swagger shows working examples.

## Epic E: Image Search
16. E1 - `POST /detect-product-image` upload endpoint (P0)
- Acceptance: accepts image and returns extracted candidate text.
17. E2 - OCR integration (Tesseract or cloud OCR) (P0)
- Acceptance: detects brand/model text from packaging photos.
18. E3 - Vision fallback (CLIP or vision API) (P1)
- Acceptance: top-N product name candidates with confidence.
19. E4 - Chain image detection to compare pipeline (P0)
- Acceptance: image input returns same schema as text compare.

## Epic F: Frontend
20. F1 - Search UI with text input + image upload (P0)
- Acceptance: both flows trigger backend search.
21. F2 - Comparison table (country, store, price, converted, link) (P0)
- Acceptance: grouped offers and cheapest highlight.
22. F3 - Filters + sorting controls (P1)
- Acceptance: filter by country/store and sort by cheapest.
23. F4 - Detection confidence panel for image flow (P1)
- Acceptance: user sees detected product + confidence before results.

## Epic G: Reliability + Ops
24. G1 - Query caching (P1)
- Acceptance: repeat queries return faster with cache hit path.
25. G2 - Rate limiting + retry/backoff per adapter (P0)
- Acceptance: controlled request pace and transient recovery.
26. G3 - Scheduled refresh jobs (P1)
- Acceptance: offers refresh without manual trigger.
27. G4 - Docker + CI pipeline (P1)
- Acceptance: tests run in CI and images build.

## Epic H: Quality
28. H1 - Unit tests (normalizer, matcher, currency) (P0)
- Acceptance: core module coverage target met.
29. H2 - Integration tests (adapters + `/compare`) (P0)
- Acceptance: deterministic fixtures for Paraguay + Brazil sources.
30. H3 - E2E tests (text and image flow) (P1)
- Acceptance: one full happy path per flow passes.

## Recommended Delivery Order
1. A1-A3, B1-B3, C1-C3, D1-D2, F1-F2, H1-H2.
2. E1-E4 (image pipeline).
3. G1-G4, C4, F3-F4, H3 (hardening and polish).

## Initial P0 Sprint Suggestion
1. Build backend skeleton + adapter interface + two source adapters.
2. Implement normalization/matching + `/compare` API.
3. Add BRL/PYG conversion and minimal frontend comparison table.
4. Add unit and integration tests for compare flow.
