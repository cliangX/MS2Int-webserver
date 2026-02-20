#!/bin/bash
# MS2Int Web Server — Start Script
# Usage: bash start.sh [--gpu GPU_ID] [--port PORT] [--frontend-port FPORT]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GPU_ID="${MS2INT_GPU:-0}"
BACKEND_PORT=8000
FRONTEND_PORT=5173

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --gpu) GPU_ID="$2"; shift 2 ;;
    --port) BACKEND_PORT="$2"; shift 2 ;;
    --frontend-port) FRONTEND_PORT="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

export MS2INT_GPU="$GPU_ID"

echo "╔═══════════════════════════════════════╗"
echo "║       ★ MS2Int Web Server ★           ║"
echo "╠═══════════════════════════════════════╣"
echo "║  GPU:      $GPU_ID                          ║"
echo "║  Backend:  http://localhost:$BACKEND_PORT       ║"
echo "║  Frontend: http://localhost:$FRONTEND_PORT       ║"
echo "╚═══════════════════════════════════════╝"

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
  # Force-release ports in case conda run left child processes alive
  fuser -k "${BACKEND_PORT}/tcp"  2>/dev/null || true
  fuser -k "${FRONTEND_PORT}/tcp" 2>/dev/null || true
  echo "Done."
}
trap cleanup EXIT INT TERM

# Start backend
echo "[1/2] Starting backend (uvicorn)..."
cd "$SCRIPT_DIR/backend"
conda run --no-capture-output -n mamba uvicorn app:app --host 0.0.0.0 --port "$BACKEND_PORT" &
BACKEND_PID=$!

# Wait for backend to be ready
echo "     Waiting for model to load..."
BACKEND_READY=0
for i in $(seq 1 120); do
  if curl -s "http://localhost:$BACKEND_PORT/api/health" >/dev/null 2>&1; then
    echo "     Backend ready!"
    BACKEND_READY=1
    break
  fi
  sleep 1
done
if [ "$BACKEND_READY" -eq 0 ]; then
  echo "     ⚠ Backend failed to start within 120s. Check logs above."
  exit 1
fi

# Start frontend
echo "[2/2] Starting frontend (vite)..."
cd "$SCRIPT_DIR/frontend"
npx vite --host 0.0.0.0 --port "$FRONTEND_PORT" &
FRONTEND_PID=$!

sleep 2
echo ""
echo "═══════════════════════════════════════"
echo "  MS2Int is running!"
echo "  Open http://localhost:$FRONTEND_PORT"
echo "  Press Ctrl+C to stop"
echo "═══════════════════════════════════════"

wait
