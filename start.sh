#!/usr/bin/env bash
# One-command dev runner: FastAPI backend + Vite frontend.
set -euo pipefail
cd "$(dirname "$0")"

APP_PORT="${APP_PORT:-3001}"
BACKEND_PORT=$((APP_PORT + 100))
export APP_PORT

if [ -f /usr/local/lib/workshop-devguard.sh ]; then
    source /usr/local/lib/workshop-devguard.sh
    devguard_acquire "$APP_PORT" "$BACKEND_PORT"
fi

# --- deps (idempotent) ---
if [ ! -d .venv ]; then uv sync; fi
if [ ! -d frontend/node_modules ]; then (cd frontend && npm install); fi

# --- backend ---
uv run uvicorn backend.main:app --host 0.0.0.0 --port "$BACKEND_PORT" &
BACKEND_PID=$!

# --- frontend (vite proxies /api -> backend) ---
(cd frontend && npm run dev -- --strictPort --host --port "$APP_PORT") &
FRONTEND_PID=$!

trap 'kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true' EXIT
echo ""
echo "  Photo Coach running:"
echo "    UI      -> http://localhost:$APP_PORT"
echo "    API     -> http://localhost:$BACKEND_PORT/api/health"
echo ""
wait
