#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

prefix() {
  local label=$1
  while IFS= read -r line; do
    echo "[$label] $line"
  done
}

cd "$SCRIPT_DIR/backend"
"$SCRIPT_DIR/.venv/bin/python" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload 2>&1 | prefix "API" &
API_PID=$!

cd "$SCRIPT_DIR/frontend"
npm run dev 2>&1 | prefix "UI" &
UI_PID=$!

trap "kill $API_PID $UI_PID 2>/dev/null" EXIT
wait
