# Backend (Python / FastAPI)

## Setup
1. `cd backend`
2. `python -m venv .venv`
3. `.venv\\Scripts\\Activate.ps1`
4. `pip install -r requirements.txt`
5. `uvicorn app.main:app --reload`

## Endpoints
- `GET /health`
- `GET /sources`
- `GET /compare?q=<query>&country=all|py|br&sort=best_match|lowest_price`
- `POST /detect-product-image` (multipart form-data field: `file`)
- `POST /compare/image` (multipart form-data field: `file`)

## Architecture
- `app/adapters/`: source adapters and registry.
- `app/services/normalization.py`: string cleanup + brand/model extraction.
- `app/services/matcher.py`: grouping/fuzzy matching.
- `app/services/fx.py`: currency conversion.
- `app/services/compare.py`: compare orchestration.

## Notes
- Adapters currently return deterministic placeholder offers.
- The API contract is stable for frontend integration.
