#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "No .env found. Create one first, for example: cp .env.pilot.example .env" >&2
  exit 1
fi

docker compose -f docker-compose.yml -f docker-compose.pilot.yml up -d --build

echo ""
echo "Pilot stack started."
echo "Local pilot URL: http://localhost:8080"
echo "Local web URL:   http://localhost:${WEB_PORT:-3000}"
echo "Local API URL:   http://localhost:${API_PORT:-8000}"
echo ""
echo "Checking API health through pilot gateway..."
for attempt in {1..30}; do
  health_body="$(curl -sS http://localhost:8080/health || true)"
  if printf '%s' "$health_body" | python -c 'import json,sys; data=json.load(sys.stdin); sys.exit(0 if data.get("status") == "ok" else 1)' 2>/dev/null; then
    echo "Health check passed: http://localhost:8080/health"
    exit 0
  fi

  if printf '%s' "$health_body" | grep -qiE '<!doctype html|<html|404'; then
    echo "Pilot gateway is running, but /health is not routed to API. Check deploy/pilot/Caddyfile." >&2
    exit 1
  fi

  sleep 2
done

echo "Health check did not pass yet. Inspect logs with:" >&2
echo "docker compose -f docker-compose.yml -f docker-compose.pilot.yml logs --tail=100" >&2
exit 1
