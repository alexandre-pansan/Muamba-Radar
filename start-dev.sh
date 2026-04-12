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
  # Kill entire process groups so uvicorn reload workers and vite children also die
  kill -- -$API_PGID 2>/dev/null
  kill -- -$UI_PGID  2>/dev/null
  wait 2>/dev/null
  exit 0
}

trap cleanup INT TERM EXIT

# Start each process in its own process group (setsid)
cd "$SCRIPT_DIR/backend"
setsid "$SCRIPT_DIR/.venv/bin/python" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload 2>&1 | prefix "API" &
API_PID=$!
API_PGID=$(ps -o pgid= -p $API_PID 2>/dev/null | tr -d ' ') || API_PGID=$API_PID

cd "$SCRIPT_DIR/frontend"
setsid npm run dev 2>&1 | prefix "UI" &
UI_PID=$!
UI_PGID=$(ps -o pgid= -p $UI_PID 2>/dev/null | tr -d ' ') || UI_PGID=$UI_PID

wait
