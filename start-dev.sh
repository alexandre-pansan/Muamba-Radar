#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

prefix() {
  local label=$1
  while IFS= read -r line; do
    echo "[$label] $line"
  done
}

cleanup() {
  echo ""
  echo "[DEV] Encerrando processos..."
  pkill -f "uvicorn app.main" 2>/dev/null || true
  pkill -f "vite"             2>/dev/null || true
  pkill -f "npm run dev"      2>/dev/null || true
  wait 2>/dev/null
  exit 0
}

trap cleanup INT TERM EXIT

# API
cd "$SCRIPT_DIR/backend"
"$SCRIPT_DIR/.venv/bin/python" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload 2>&1 | prefix "API" &

# UI
cd "$SCRIPT_DIR/frontend"
npm run dev 2>&1 | prefix "UI" &

wait
