# MuambaRadar — Managing Muamba

Compares product prices between Paraguay and Brazil, with text and image search.

## Quick Start

### First-time setup (run once)
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
```
This creates the virtual environment, installs dependencies, and copies `.env.example` → `.env`.

### Start dev servers
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1
```
Starts backend + frontend, tails live logs, and health-checks the API before handing control back.

| Service  | URL |
|----------|-----|
| Frontend | http://127.0.0.1:5173 |
| Backend API | http://127.0.0.1:8000 |
| Swagger docs | http://127.0.0.1:8000/docs |

### Stop dev servers
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-dev.ps1
```

### Configuration
Edit `.env` at the project root to override FX rates, ports, or CORS origins.
See `.env.example` for all available options.

## Docs
- `docs/mvp-spec.md` — MVP specification and API contract
- `IMPLEMENTATION_BACKLOG.md` — full feature backlog
