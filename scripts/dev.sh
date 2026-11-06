#!/usr/bin/env bash
set -euo pipefail

export BACKEND_PORT="${BACKEND_PORT:-8000}"
export VITE_PORT=5000

API_PID=""
FRONTEND_PID=""

stop_process() {
  local pid="$1"
  if [[ -n "$pid" ]]; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
}

cleanup() {
  stop_process "$FRONTEND_PID"
  stop_process "$API_PID"
}

trap cleanup EXIT
trap 'exit 0' INT TERM

(cd server && exec python app.py) &
API_PID=$!

api_ready=false
for _ in $(seq 1 30); do
  if ! kill -0 "$API_PID" 2>/dev/null; then
    echo "FastAPI exited before its health check passed." >&2
    wait "$API_PID" || exit $?
    exit 1
  fi

  if curl -fsS --max-time 1 "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null 2>&1; then
    api_ready=true
    break
  fi
  sleep 1
done

if [[ "$api_ready" != true ]]; then
  echo "FastAPI did not become healthy on port ${BACKEND_PORT} within 30 seconds." >&2
  exit 1
fi

(cd client && exec node ./node_modules/vite/bin/vite.js --host 0.0.0.0 --port "$VITE_PORT") &
FRONTEND_PID=$!

while true; do
  if ! kill -0 "$API_PID" 2>/dev/null; then
    echo "FastAPI stopped unexpectedly." >&2
    wait "$API_PID" || status=$?
    exit "${status:-1}"
  fi

  if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    echo "Vite stopped unexpectedly." >&2
    wait "$FRONTEND_PID" || status=$?
    exit "${status:-1}"
  fi
  sleep 1
done
