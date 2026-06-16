# Free pilot tunnel mode

CallQuanta pilot tunnel mode exposes the full local development stack through one temporary Cloudflare Quick Tunnel URL. It is intended for short manager pilots before you buy a domain, provision a VPS, or complete production hardening.

## What this mode is

- A local Caddy gateway listens on `http://localhost:8080`.
- The gateway serves the Next.js UI and proxies API paths to the FastAPI service.
- Cloudflare Quick Tunnel publishes that local gateway at a random `https://*.trycloudflare.com` URL.
- Managers use only the temporary public URL; they do not need a separate API URL.

## Testing only

Use this mode only for development and pilot validation. The URL changes whenever the tunnel restarts, the tunnel depends on your local machine or Codespace staying awake, and this is not a replacement for production hosting, a stable domain, HTTPS configuration, monitoring, backups, or deployment hardening.

Do not upload sensitive production recordings unless the pilot owner has explicitly approved that data use.

## Start the pilot

```bash
cp .env.pilot.example .env
# Edit .env and set a strong SESSION_SECRET, ADMIN_EMAIL, and ADMIN_PASSWORD.
docker compose -f docker-compose.yml -f docker-compose.pilot.yml up -d --build
cloudflared tunnel --url http://localhost:8080
```

Alternatively, use the helper scripts:

```bash
cp .env.pilot.example .env
scripts/pilot-up.sh
scripts/pilot-tunnel.sh
```

Open the local gateway at `http://localhost:8080` to verify the stack before sharing the Cloudflare URL.


## Gateway API routing checks

After `scripts/pilot-up.sh` reports the stack is healthy, verify that backend paths are routed through the pilot gateway instead of being served as Next.js pages:

```bash
curl -i http://localhost:8080/health
curl -i http://localhost:8080/auth/me
curl -i http://localhost:8080/settings/upload-limits
```

Expected results:

- `/health` returns API JSON such as `{"status":"ok"}` with HTTP 200.
- `/auth/me` returns an API auth response such as HTTP 401 when you are not logged in, not a Next.js HTML 404 page.
- `/settings/upload-limits` returns API JSON or an auth-protected API response, not Next.js HTML.

If `/health` returns HTML or a 404, the pilot gateway is running but `/health` is not routed to the API. Check `deploy/pilot/Caddyfile` before sharing the tunnel URL.

## Language selector check

Use the same browser origin you plan to share with pilot users (`http://localhost:8080` locally or the `https://*.trycloudflare.com` URL publicly):

1. Open the gateway URL.
2. Change the language selector to Russian.
3. Confirm visible UI text changes immediately.
4. Refresh the page and confirm Russian remains selected.
5. Navigate to **Calls**, **Dashboard**, and **Settings** and confirm the language does not reset to English.

## Public URL and webhooks

Cloudflare prints a URL like `https://random.trycloudflare.com`. Copy that URL into `PUBLIC_APP_URL` in `.env` and restart the pilot stack if you want Settings → Telephony Integrations to display full webhook URLs using the tunnel host.

Do not hardcode the URL in source files. Quick Tunnel URLs are temporary and change after restart.

## Login

Log in with the admin account configured in `.env`:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

Auth remains enabled in pilot mode. Browser session cookies are same-origin through the public gateway.

## Create manager users

1. Log in as an admin.
2. Open **Settings → Users & Access**.
3. Create a manager user.
4. Assign the correct role and scoped access.
5. Copy the temporary password when it is shown.
6. Send the manager the temporary tunnel URL and their credentials through an approved secure channel.

## Give managers the link

Send managers only the Cloudflare URL, for example `https://random.trycloudflare.com`. Do not send separate web or API URLs.

Remind managers that this is a temporary pilot environment and that they should upload only approved test recordings.

## Stop the pilot

```bash
docker compose -f docker-compose.yml -f docker-compose.pilot.yml down
```

Or use:

```bash
scripts/pilot-down.sh
```

Stop `cloudflared` with `Ctrl+C` in the terminal where it is running.

## Common problems

### Tunnel URL changed

Quick Tunnel URLs are random. If `cloudflared` restarts, copy the new `https://*.trycloudflare.com` URL, share it with managers, and update `PUBLIC_APP_URL` before restarting the stack if webhook display needs the new full URL.

### Codespace or local machine slept

The public URL works only while your local stack and `cloudflared` process are running. Wake the machine or Codespace, restart the stack, and start the tunnel again.

### Upload is slow

Uploads travel through the temporary tunnel to your local machine. Use small pilot files where possible and keep the network connection stable.

### Auth cookie issue

Use one public URL consistently. Do not mix `localhost`, Codespaces URLs, and the Cloudflare URL in the same browser session. Clear site cookies and log in again if needed.

### API 401/403

Auth is required and scoped access remains enforced. Verify the manager has the right role, active status, and team/agent scope in **Settings → Users & Access**.

### Workers not processing

Check **Settings → System Status** and container logs. Ensure Redis, `stt-worker`, `qa-worker`, and `recording-worker` are running.

### File too large

Pilot defaults limit a single upload to 100 MB and bulk upload to 500 MB. Adjust `MAX_UPLOAD_BYTES_PER_FILE` and `MAX_BULK_UPLOAD_BYTES` in `.env` only if the pilot owner approves larger files.
