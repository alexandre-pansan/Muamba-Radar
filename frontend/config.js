// Runtime config — overwritten by Docker entrypoint (docker-entrypoint.sh).
// For local dev: run scripts/setup.ps1 to set this to http://localhost:8000.
// Empty string = use relative URLs (nginx proxies to backend in Docker).
window.__MUAMBA_API__ = "http://localhost:8000";
