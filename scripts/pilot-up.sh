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
  if curl -fsS http://localhost:8080/health >/dev/null; then
    echo "Health check passed: http://localhost:8080/health"
    exit 0
  fi
  sleep 2
done

echo "Health check did not pass yet. Inspect logs with:" >&2
echo "docker compose -f docker-compose.yml -f docker-compose.pilot.yml logs --tail=100" >&2
exit 1
