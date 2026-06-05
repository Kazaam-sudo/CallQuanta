# CallQuanta production deployment checklist

CallQuanta stores sensitive call recordings, transcripts, QA reviews, webhook tokens and provider API keys. Treat the host, database, Redis and upload volume as production secrets.

## VPS requirements

- 2+ vCPU and 4 GB RAM for light usage; use more CPU/RAM if you run local STT/LLM models.
- 40+ GB SSD to start, sized for your expected call recording retention.
- Docker Engine with Docker Compose v2.
- A domain name with HTTPS termination through a reverse proxy.

## Start with Docker Compose

```bash
cp .env.example .env
# edit .env before starting
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='change-me' docker compose up -d --build
```

Check services:

```bash
docker compose ps
docker compose logs -f api web stt-worker qa-worker recording-worker
```

Restart services after configuration changes:

```bash
docker compose restart api web stt-worker qa-worker recording-worker
```

Update the app:

```bash
git pull
docker compose up -d --build
```

## `.env` production checklist

Set these before exposing the app:

- `APP_ENV=production`
- `REQUIRE_AUTH=true`
- `ADMIN_EMAIL=admin@example.com`
- `ADMIN_PASSWORD=<strong one-time bootstrap password>`
- `SESSION_SECRET=<long random value>`
- `POSTGRES_PASSWORD=<strong database password>`
- `DATABASE_URL=postgresql+psycopg://...`
- `CORS_ORIGINS=https://your-callquanta-domain.example`
- `NEXT_PUBLIC_API_BASE_URL=` when web and API are served through the same Next.js origin, or the public API URL if split.
- Provider keys such as `LLM_API_KEY` only if you intentionally use environment fallback instead of UI settings.
- Retention defaults if desired: `RETENTION_AUDIO_DAYS`, `RETENTION_TRANSCRIPTS_DAYS`, `RETENTION_QA_REVIEWS_DAYS`, `RETENTION_INGESTION_EVENTS_DAYS`.

If no users exist, the API creates the first active admin from `ADMIN_EMAIL` and `ADMIN_PASSWORD` during startup. In production mode, a missing `ADMIN_PASSWORD` emits a clear warning and login will not be available until credentials are configured and the API is restarted.

## Storage volume notes

Uploaded and downloaded call recordings are stored in the API container at `/app/uploads`, backed by the Docker volume `api_uploads`. Keep this volume private and encrypted at the host/storage layer where possible.

Retention cleanup can delete old audio files while keeping call metadata. Use **Settings → Retention** to save retention settings, review the dry-run preview and run manual cleanup.

## Backups

Back up at least:

- PostgreSQL database (`postgres_data`) for calls, metadata, transcripts, reviews, settings, users and token hashes.
- Upload volume (`api_uploads`) for audio files that have not been deleted by retention.
- `.env` or your secret manager entries, stored securely and separately.

Example database dump:

```bash
docker compose exec postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > callquanta.sql
```

## Webhook URL setup

Create a telephony integration in **Settings → Telephony Integrations** and copy the token immediately. Tokens are shown only after creation/regeneration. Configure your telephony provider to call:

```text
https://your-callquanta-domain.example/api/integrations/telephony/webhook/{integration_id}
```

Send the token as either:

```text
Authorization: Bearer <token>
```

or:

```text
X-CallQuanta-Token: <token>
```

Webhook token authentication remains independent from browser session authentication.

## Reverse proxy and HTTPS

Use Caddy, Nginx, Traefik or your platform load balancer to terminate HTTPS and proxy to the web service on port `3000`. HTTPS is strongly recommended because session cookies protect access to sensitive recordings and QA results.

Example proxy target:

```text
https://your-callquanta-domain.example -> http://127.0.0.1:3000
```

Avoid exposing PostgreSQL, Redis or Ollama ports to the public internet.

## Provider key security

- Saved LLM/STT API keys are never returned by the API after save; the UI only shows whether a key is configured.
- Replace keys from the provider portal if you suspect they were copied from browser dev tools, logs or backups.
- Telephony ingestion tokens are hashed in the database and shown only immediately after generation/regeneration.

## Logs and status

View logs:

```bash
docker compose logs -f api
docker compose logs -f web
docker compose logs -f stt-worker qa-worker recording-worker
```

Health endpoints:

- `GET /health` for a lightweight liveness check.
- `GET /health/ready` for database and Redis readiness.
- **Settings → System Status** or `GET /system/status` as an authenticated admin for detailed DB/Redis/queue/worker/provider/storage status.
