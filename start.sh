#!/bin/bash
# MS2Int Web Server — Start Script
# Usage: bash start.sh [--gpu GPU_ID] [--port PORT] [--frontend-port FPORT] [--tunnel TOKEN]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GPU_ID="${MS2INT_GPU:-0}"
BACKEND_PORT=8000
FRONTEND_PORT=5173
TUNNEL_TOKEN=""

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --gpu) GPU_ID="$2"; shift 2 ;;
    --port) BACKEND_PORT="$2"; shift 2 ;;
    --frontend-port) FRONTEND_PORT="$2"; shift 2 ;;
    --tunnel) TUNNEL_TOKEN="$2"; shift 2 ;;
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
if [ -n "$TUNNEL_TOKEN" ]; then
echo "║  Tunnel:   enabled (http2)             ║"
fi
echo "╚═══════════════════════════════════════╝"

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $BACKEND_PID $FRONTEND_PID $TUNNEL_PID 2>/dev/null
  wait $BACKEND_PID $FRONTEND_PID $TUNNEL_PID 2>/dev/null
  # Force-release ports in case conda run left child processes alive
  fuser -k "${BACKEND_PORT}/tcp"  2>/dev/null || true
  fuser -k "${FRONTEND_PORT}/tcp" 2>/dev/null || true
  echo "Done."
}
trap cleanup EXIT INT TERM

# Start backend
TOTAL_STEPS=2
if [ -n "$TUNNEL_TOKEN" ]; then TOTAL_STEPS=3; fi

echo "[1/$TOTAL_STEPS] Starting backend (uvicorn)..."
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
echo "[2/$TOTAL_STEPS] Starting frontend (vite)..."
cd "$SCRIPT_DIR/frontend"
npx vite --host 0.0.0.0 --port "$FRONTEND_PORT" &
FRONTEND_PID=$!

# Start cloudflare tunnel (optional)
TUNNEL_PID=""
if [ -n "$TUNNEL_TOKEN" ]; then
  echo "[3/$TOTAL_STEPS] Starting Cloudflare Tunnel (http2)..."
  cloudflared tunnel run --protocol http2 --token "$TUNNEL_TOKEN" &
  TUNNEL_PID=$!
  sleep 3
  if kill -0 $TUNNEL_PID 2>/dev/null; then
    echo "     Tunnel started (PID $TUNNEL_PID)"
  else
    echo "     ⚠ Tunnel failed to start. Check cloudflared installation."
  fi
fi

sleep 2
echo ""
echo "═══════════════════════════════════════"
echo "  MS2Int is running!"
echo "  Open http://localhost:$FRONTEND_PORT"
if [ -n "$TUNNEL_TOKEN" ]; then
echo "  Tunnel active (http2 protocol)"
fi
echo "  Press Ctrl+C to stop"
echo "═══════════════════════════════════════"

wait
