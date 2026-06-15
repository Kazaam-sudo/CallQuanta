#!/usr/bin/env bash
set -euo pipefail

if ! command -v cloudflared >/dev/null 2>&1; then
  cat >&2 <<'MSG'
cloudflared is not installed.
Install it from Cloudflare's official packages or download page:
  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

macOS:
  brew install cloudflared

Debian/Ubuntu examples are listed in the Cloudflare docs above.
MSG
  exit 1
fi

echo "Starting Cloudflare Quick Tunnel for http://localhost:8080 ..."
echo "Look for the public URL printed by cloudflared, like: https://random.trycloudflare.com"
echo "Copy that URL into PUBLIC_APP_URL in .env and restart the pilot stack if you need full webhook URLs in Settings."
echo ""
cloudflared tunnel --url http://localhost:8080
