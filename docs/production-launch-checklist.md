# CallQuanta production launch checklist

Use this checklist for the first domain-backed buyer demo and every production deployment. Do not treat a successful image build as proof that data isolation, providers, backups, and recovery work.

## Release identity

- [ ] Record the exact release commit SHA and image digests.
- [ ] Deploy from a clean checkout of the intended commit; `git status --short` is empty.
- [ ] Confirm the release contains `docs/pre-launch-audit.md` and review all deferred Critical/High findings.
- [ ] Keep a tested rollback target and database/upload backup from immediately before deployment.

## Domain and DNS

- [ ] Register the production domain under an account with MFA and recovery contacts.
- [ ] Create only required DNS records; avoid wildcard records unless deliberately used.
- [ ] Set a low TTL during the first cutover, then raise it after stability is confirmed.
- [ ] Confirm the domain resolves to the intended reverse proxy, not directly to PostgreSQL, Redis, Ollama, API, or worker hosts.
- [ ] Document who owns domain renewal and billing.

## HTTPS and reverse proxy

- [ ] Terminate HTTPS at Caddy, Nginx, Traefik, a managed load balancer, or equivalent.
- [ ] Redirect HTTP to HTTPS.
- [ ] Enable automatic certificate renewal and alert before expiration.
- [ ] Publish only ports 80/443 externally. PostgreSQL, Redis, Ollama, API, and worker ports must remain private.
- [ ] Set a request body limit compatible with `MAX_UPLOAD_BYTES_PER_FILE` and bulk-upload policy.
- [ ] Configure proxy read/send timeouts for uploads and streaming without allowing unbounded requests.
- [ ] Preserve `Range` headers and streaming responses for call recordings.
- [ ] Pass trusted forwarding headers only from the known proxy; do not trust arbitrary client-supplied `X-Forwarded-*` values.
- [ ] Add security headers appropriate for the UI: HSTS after HTTPS is stable, `X-Content-Type-Options`, frame restrictions, referrer policy, and a tested CSP.

## Environment variables and secrets

- [ ] Set `APP_ENV=production` (or `pilot` for an invite-only pilot).
- [ ] Set `REQUIRE_AUTH=true`.
- [ ] Generate a high-entropy `SESSION_SECRET`; do not reuse the example/default value.
- [ ] Set a unique strong PostgreSQL password and update `DATABASE_URL`.
- [ ] Set the exact public origin(s) in `CORS_ORIGINS`; no wildcard with credentials.
- [ ] Set `PUBLIC_APP_URL` and frontend/API same-origin values for the real HTTPS domain.
- [ ] Set `QA_MODE` and `STT_MODE` explicitly to real provider modes.
- [ ] Keep `ALLOW_PLACEHOLDER_AI` unset/false. Placeholder output must never be shown as real QA/STT.
- [ ] Configure provider keys in the approved secret store or write-only product settings.
- [ ] Verify saved API keys are not returned by any API response or rendered in frontend HTML/JS.
- [ ] Rotate any key ever placed in chat, logs, screenshots, shell history, or committed files.
- [ ] Validate every numeric variable: upload limits, provider timeouts, retention days, worker heartbeat, and demo quota.
- [ ] Store the final environment outside the repository with restricted filesystem permissions.

## Initial administrator and authentication

- [ ] Set a unique initial admin email and temporary high-entropy password.
- [ ] Log in through HTTPS and change the initial password immediately.
- [ ] Confirm the initial password is not logged or exposed by container inspection to unauthorized operators.
- [ ] Create named administrator accounts; do not share one generic admin login.
- [ ] Confirm the last active admin cannot be disabled/demoted.
- [ ] Test logout, expired session behavior, password change, and required first-login password change.
- [ ] Add rate limiting for login and sensitive mutations before broad public exposure.
- [ ] Define account recovery/support procedure; SMTP password reset is not currently implemented.

## Authorization and demo access

- [ ] Run the endpoint authorization matrix for admin, manager, supervisor, agent, and viewer.
- [ ] Test ID tampering for calls, audio, transcript, QA review, topics, users, integrations, exports, audit log, and retention endpoints.
- [ ] Test cross-team restrictions and own-call restrictions with real seeded users.
- [ ] Ensure demo users cannot change system-wide provider secrets, users, retention, integrations, or system settings.
- [ ] Confirm recording playback and download use the same visibility checks as call details.
- [ ] Treat the current deployment as single-workspace. Do not offer self-service multi-buyer signup until tenant ownership exists across all data and files.

## Demo quota

- [ ] Set `DEMO_CALL_LIMIT` to the approved global limit; `0` disables it.
- [ ] Confirm the displayed quota matches the backend value.
- [ ] Test under-limit, exactly-at-limit, and over-limit behavior.
- [ ] Test mixed single and batch analysis attempts.
- [ ] Test concurrent requests; the current audit identifies non-atomic quota reservation as a Critical deferred risk.
- [ ] Confirm invalid transcripts and failed/degraded provider outputs follow the agreed quota-consumption policy.
- [ ] Confirm retries and duplicate queue deliveries cannot consume quota twice.
- [ ] Confirm already analyzed calls remain readable after the limit is reached.
- [ ] Until atomic reservations are implemented, keep the free demo invite-only and monitor usage manually.

## Database and migrations

- [ ] Back up PostgreSQL before every migration.
- [ ] Restore the backup into a disposable environment and verify it is usable.
- [ ] Run migrations from an empty database to head.
- [ ] Run migrations from the most recent deployed schema to head.
- [ ] Compare SQLAlchemy models with migration head.
- [ ] Confirm foreign keys, cascades, nullable transitions, defaults, indexes, and constraint names.
- [ ] Confirm the application does not rely solely on runtime migration helpers in place of a reproducible migration history.
- [ ] Record migration duration and locking impact.
- [ ] Define and test rollback/forward-fix procedure; never assume a destructive migration can be automatically downgraded.

## Storage and recordings

- [ ] Use durable persistent storage for `/app/uploads`.
- [ ] Confirm API, STT worker, and recording worker mount the intended volume with the minimum required permissions.
- [ ] Confirm the STT worker read-only mount is sufficient for its temporary normalization behavior.
- [ ] Verify storage survives container replacement and host reboot.
- [ ] Back up recordings if required by the business/legal policy; otherwise document that database-only restore will not restore audio.
- [ ] Test missing-file behavior and orphan-row/file reconciliation.
- [ ] Monitor disk usage, inode usage, and growth rate.
- [ ] Set retention values approved by the buyer and privacy owner.
- [ ] Run retention preview before actual deletion and verify audit records.

## Redis and queues

- [ ] Keep Redis private; never publish it to the internet.
- [ ] Confirm AOF persistence and the `redis_data` volume are active.
- [ ] Document whether Redis persistence is part of backup/restore or whether queued work is reconstructed from database state.
- [ ] Monitor queue lengths and worker heartbeats.
- [ ] Define stale-pending thresholds for transcription, topic classification, recording download, and QA.
- [ ] Add bounded retries, attempt counters, and dead-letter handling before high-volume use.
- [ ] Test Redis restart, worker restart, and API restart while jobs are pending.

## Provider verification

- [ ] Confirm the active STT provider, model, language, credentials, timeout, and base URL.
- [ ] Confirm the active LLM provider, model, credentials, timeout, and base URL.
- [ ] Verify `QA_MODE`/`STT_MODE` are not placeholder in container environment and logs.
- [ ] Run a real-provider call end to end and retain a redacted evidence record of the result.
- [ ] Test invalid credentials, timeout, 429/rate limit, 5xx, malformed JSON, empty transcript, and unsupported audio.
- [ ] Confirm technical failures are shown as unavailable/retryable, not as agent score zero.
- [ ] Confirm no full transcript, raw model response, API key, or authorization header is written to production logs.
- [ ] Validate evidence quotes against transcript segments for representative calls.

## Privacy, terms, and buyer readiness

- [ ] Publish a privacy notice describing recordings, transcripts, AI processing, providers/subprocessors, retention, access, and deletion.
- [ ] Publish terms/demo conditions and identify prohibited uploads.
- [ ] Obtain authority/consent to process call recordings and employee/customer personal data.
- [ ] Provide buyer-facing data deletion/export contact and SLA.
- [ ] Document data residency and external AI provider regions.
- [ ] Ensure only approved test recordings are used in a free demonstration.
- [ ] Prepare a concise incident response and breach-notification process.

## Monitoring and logs

- [ ] Collect API and worker logs centrally with restricted access.
- [ ] Configure log rotation and retention shorter than or aligned with data policy.
- [ ] Alert on API health failure, database/Redis failure, worker heartbeat loss, queue growth, disk pressure, repeated auth failures, provider error rate, and stuck calls.
- [ ] Include call/job IDs, provider/model, elapsed time, and result status in operational logs.
- [ ] Do not log secrets or unrestricted transcript/model content.
- [ ] Define uptime and support expectations honestly for early beta.

## Backups and recovery

- [ ] Automate PostgreSQL backups and verify successful completion.
- [ ] Back up upload storage when required.
- [ ] Encrypt backups at rest and in transit.
- [ ] Store at least one copy outside the primary host/account failure domain.
- [ ] Define retention and access controls for backups.
- [ ] Perform a full restore drill into a clean environment.
- [ ] Confirm restored calls, users, settings, reviews, topics, exports, and recordings are consistent.
- [ ] Record recovery point objective and recovery time objective.

## Rate limits and abuse controls

- [ ] Rate-limit login, uploads, analysis/retry actions, provider tests, exports, webhook ingestion, and audio downloads.
- [ ] Cap list/export page sizes and reject negative/excessive pagination values.
- [ ] Keep upload extension, MIME, size, filename, and storage-path validation enabled.
- [ ] Add reverse-proxy connection/request limits appropriate for expected pilot traffic.
- [ ] Monitor and block repeated unauthorized ID probing.

## Pre-deploy validation commands

Run from a clean Codespace or Linux host:

```bash
set -euo pipefail

git checkout audit/pre-launch-full-system-review
git fetch origin --prune
git reset --hard origin/audit/pre-launch-full-system-review
git status --short
git log -10 --oneline

python3 -m compileall apps/api workers packages scripts
python3 -m unittest discover -s scripts -p 'test_*.py' -v

cp .env.example .env
# CI/test only: keep APP_ENV=test and placeholder modes for deterministic smoke tests.
python3 - <<'PY'
from pathlib import Path
p = Path('.env')
text = p.read_text()
text = text.replace('APP_ENV=development', 'APP_ENV=test')
p.write_text(text)
PY

docker compose config
docker compose -f docker-compose.yml -f docker-compose.pilot.yml config

docker compose down -v --remove-orphans
docker compose up -d --build

docker compose ps
docker compose logs --no-color --tail=200 api stt-worker qa-worker recording-worker
curl -fsS http://localhost:8000/health

cd apps/web
npm install
npm run build
cd ../..

git diff --check
```

The web package currently has `build` but no `lint`, `typecheck`, or `test` scripts. Do not report those checks as passed unless scripts are added and executed.

## Real-provider smoke flow

With protected environment values and real credentials:

```bash
cp .env.pilot.example .env
# Replace every example credential/secret and configure the real providers.
docker compose -f docker-compose.yml -f docker-compose.pilot.yml config
docker compose -f docker-compose.yml -f docker-compose.pilot.yml up -d --build
```

Then verify manually:

- [ ] API, web, Redis, PostgreSQL, STT, QA, and recording workers are healthy.
- [ ] Login and password change work.
- [ ] Valid audio upload completes transcription with a real provider.
- [ ] Transcript validation passes and language is plausible.
- [ ] Topic classification and required actions appear.
- [ ] QA completes with the expected real provider/model; no placeholder labels exist.
- [ ] Audio full playback, seeking/Range, and download work.
- [ ] Manager feedback updates call details and dashboard.
- [ ] CSV/XLSX exports open correctly with Russian text and no formula execution.
- [ ] Invalid/placeholder transcript blocks QA with clear copy.
- [ ] Demo quota behavior is verified, including concurrency limitation noted in the audit.
- [ ] Existing analyzed calls remain readable at quota limit.

## Rollback plan

- [ ] Stop new uploads/analysis or place the app in maintenance mode.
- [ ] Capture current logs, image digests, database state, queue state, and storage state.
- [ ] Roll back application images only when the database schema remains compatible.
- [ ] Otherwise restore the pre-deploy database and matching upload snapshot together.
- [ ] Verify authentication, call access, audio, latest QA review, topics, dashboard, and exports after rollback.
- [ ] Document the incident, affected calls/jobs, and required replay/reconciliation.
