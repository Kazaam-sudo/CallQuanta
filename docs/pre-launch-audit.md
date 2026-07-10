# CallQuanta pre-launch audit

Baseline: `2f242887f63ab3315d65891b028cefcaccbef9dd` (`main`, merge of PR #70).

Audit branch: `audit/pre-launch-full-system-review`.

## 1. Executive summary

CallQuanta has a coherent early-beta workflow and several solid foundations: authenticated call access, role/scope helpers, bounded uploads, generated storage names, transcript validation, explicit blocked/failed statuses, provider timeouts, audit events, and write-only provider-secret behavior in the product API.

The application is suitable for a controlled, invite-only, single-buyer pilot after the manual verification in `docs/production-launch-checklist.md`. It is not yet suitable for unattended public self-service signup or multi-tenant production.

The highest remaining confirmed launch risk is demo quota enforcement. Capacity is checked with a non-atomic count of successful QA reviews, queued work is not reserved, and concurrent requests/workers can exceed the limit. The second major business-logic risk is the absence of job identity/transcript revisions: duplicate or delayed jobs can produce duplicate cost and stale results.

This PR intentionally avoids a speculative rewrite. It fixes concrete deployment and ingestion vulnerabilities, adds fail-closed runtime guards, restores a missed telephony schema migration in the container startup path, adds focused tests, and documents the remaining schema/business-logic work.

## 2. Architecture map

- Web: Next.js 14 app-router application in `apps/web`, including same-origin proxy routes and RU/EN message catalogs.
- API: FastAPI application concentrated in `apps/api/app/main.py` (more than 4,000 lines).
- Data: PostgreSQL through SQLAlchemy models in `apps/api/app/db.py`.
- Schema updates: `Base.metadata.create_all()` plus hand-written runtime migration helpers. No Alembic configuration/history was found at the expected repository paths.
- Queues: Redis lists for transcription, QA, topic classification, and recording downloads.
- Workers: `workers/stt-worker`, `workers/qa-worker`, and `workers/recording-worker`.
- Storage: a named upload volume shared by API and workers.
- AI configuration: database-backed LLM/STT providers with environment fallbacks.

Primary flow:

```text
Upload or telephony webhook
  -> Call row + durable recording path
  -> transcription queue
  -> transcript segment replacement
  -> transcript validation
  -> topic classification + required-action checks
  -> QA queue
  -> QAReview
  -> manager feedback / human review / coaching
  -> dashboard and CSV/XLSX exports
```

Transition assessment:

- API code generally sets pending state before enqueue and failed state when enqueue fails.
- Transcript validation correctly blocks obvious placeholders/invalid content before QA.
- Queue payloads contain only `call_id`; they do not identify an analysis attempt or transcript revision.
- Redis `BRPOP` removes a job before durable completion; a crash after pop can lose the job.
- No bounded retry/dead-letter/reconciliation mechanism is evident.
- Authorization is centralized through scope helpers, but the large route module makes endpoint-by-endpoint regression testing essential.

## 3. Critical findings

### CQ-001 — Demo quota can be exceeded concurrently

- Area: Demo quota / QA lifecycle
- Severity: Critical
- Evidence: `_demo_quota_status()` counts distinct `QAReview.call_id` where status is `success`; API single/batch endpoints perform a separate check before status update/enqueue, and QA worker performs another non-locking count before execution.
- User impact: Concurrent single requests, mixed batch/single operations, or multiple workers can process more calls than `DEMO_CALL_LIMIT`. Queued work is invisible to the counter.
- Root cause: Check-then-act logic without a database reservation/usage ledger, row lock, unique job key, or transactionally reserved capacity.
- Recommended fix: Add an analysis reservation table keyed by call + transcript revision. Reserve quota atomically before enqueue and finalize/release it according to an explicit failed/invalid/degraded policy.
- Status: Deferred. A counter-only patch would still be bypassable.

### CQ-002 — Placeholder AI can be shown as completed buyer-facing analysis

- Area: AI output / deployment
- Severity: Critical
- Evidence: QA and STT workers default to `placeholder`; QA placeholder output is stored as successful and moves calls to `analyzed`.
- User impact: Missing/misspelled configuration can present fabricated deterministic scoring/transcripts as real AI output.
- Root cause: Test-safe defaults were also runtime defaults without protected-environment startup validation.
- Recommended fix: Fail worker startup in buyer-facing environments when placeholder mode is active; require an explicit diagnostic override.
- Status: Fixed for Docker deployments in this PR. `scripts/validate_worker_mode.py` is executed by QA/STT container entrypoints and is covered by focused tests. Direct non-container worker invocation must call the same validator or set explicit real modes.

### CQ-003 — Telephony recording download allowed webhook-driven SSRF

- Area: Telephony ingestion / network security
- Severity: Critical
- Evidence: Recording worker called `requests.get(recording_url, allow_redirects=True)` without scheme, credential, DNS/IP, redirect-target, or proxy-environment restrictions.
- User impact: A valid ingestion token could be abused to request localhost, Compose services, cloud metadata, private network services, or token-bearing redirect targets from the worker network.
- Root cause: Remote recording URLs were treated as trusted provider input.
- Recommended fix: Permit HTTP(S) only, reject embedded credentials, resolve/block private/local/link-local/reserved targets, validate every redirect, disable environment proxies, and allow private PBX hosts only through an exact allowlist.
- Status: Fixed in this PR. Added `url_safety.py`, redirect-by-redirect validation, explicit allowlist controls, partial-file cleanup, and tests.

## 4. High-priority findings

### CQ-004 — Duplicate and stale QA jobs are not idempotent

- Area: Queue / QA worker / data integrity
- Severity: High
- Evidence: Queue payload carries only `call_id`; `process_qa_job()` always invokes the provider and inserts a new `QAReview` without checking an analysis job ID or transcript revision.
- User impact: Duplicate provider cost, duplicate review history, stale results becoming latest, and incorrect dashboards/exports.
- Root cause: No durable job identity, expected revision, or unique completion constraint.
- Recommended fix: Add analysis job IDs and transcript revision tokens; reject stale work before provider invocation and before commit; enforce unique completion per logical job.
- Status: Deferred.

### CQ-005 — Automated topic classification can overwrite a manual correction

- Area: Topic classification
- Severity: High
- Evidence: API and QA worker reuse the latest `CallTopicClassification` row and overwrite primary topic, confidence, rationale, evidence, and action results. The model contains `manually_overridden`, but automatic classification does not protect it.
- User impact: A manager correction can disappear after delayed QA/classification or re-delivery.
- Root cause: Automated suggestion and manual decision share mutable state without a lock/provenance rule.
- Recommended fix: Preserve manual overrides; store automated suggestion separately or require an explicit audited reclassification command to replace manual state.
- Status: Deferred.

### CQ-006 — Invalid LLM JSON is converted into successful zero-score QA

- Area: AI validation / buyer-facing reliability
- Severity: High
- Evidence: JSON/value errors call `fallback_review()`, after which the worker stores `QAReview(status="success")` and marks the call `analyzed`.
- User impact: A provider/model integration error looks like catastrophic agent performance rather than a technical failure; it enters quota, dashboard, and export calculations.
- Root cause: Recovered/degraded output and valid model output share one success state.
- Recommended fix: Introduce `degraded`/`invalid_model_output`, exclude it from successful analytics/quota, show retryable buyer-facing copy, and retain only safe correlation metadata in logs.
- Status: Deferred.

### CQ-007 — Raw LLM response can leak transcript content to logs

- Area: Privacy / logging
- Severity: High
- Evidence: On parse failure QA worker prints the complete raw model content. Model responses may reproduce sensitive call text.
- User impact: Personal/customer data can persist in platform logs beyond product retention settings.
- Root cause: Debug logging is not privacy-bounded.
- Recommended fix: Log provider/model, call/job ID, response length/hash, parse error, and a short redacted structural excerpt; never full content in production.
- Status: Deferred.

### CQ-008 — CSV/XLSX exports are vulnerable to spreadsheet formula injection

- Area: Exports
- Severity: High
- Evidence: `_calls_csv_rows()` and topic export write user/provider-controlled strings such as filename, agent, campaign, external ID, topic text, rationale, and evidence directly to CSV/XLSX cells.
- User impact: Opening an export in Excel/LibreOffice can evaluate cells beginning with `=`, `+`, `-`, or `@`, enabling malicious formulas or external-data prompts.
- Root cause: No spreadsheet-cell escaping/sanitization layer.
- Recommended fix: Prefix dangerous string cells with an apostrophe (or use a centrally tested safe-cell function) for both CSV and XLSX; add UTF-8/formula-injection tests.
- Status: Deferred because the export implementation is embedded in the monolithic API module; must be fixed before accepting untrusted public filenames/metadata.

### CQ-009 — Public pilot session cookie lacked `Secure`

- Area: Authentication / deployment
- Severity: High
- Evidence: Login sets `secure=True` only for `APP_ENV in {"production", "prod"}`, while pilot examples/defaults previously used `APP_ENV=pilot`.
- User impact: A buyer-facing HTTPS pilot could issue a session cookie without the Secure attribute.
- Root cause: Pilot deployment label did not inherit production cookie semantics.
- Recommended fix: Run public pilots with `APP_ENV=production` and fail startup for `APP_ENV=pilot` until the application supports a separate explicit cookie-security setting.
- Status: Fixed in this PR. Pilot Compose/example now use production security semantics; API container validates auth, strong secrets, admin credentials, and HTTPS-only explicit CORS.

### CQ-010 — Telephony migration helper was referenced but not invoked

- Area: Database migration / telephony idempotency
- Severity: High
- Evidence: API startup contained `migrate_telephony_ingestion_tables, migrate_topic_tables(engine)`, which evaluates the telephony function object instead of calling it, then invokes topic migration twice.
- User impact: Upgraded databases can miss `uq_calls_source_provider_external_call_id`; concurrent/repeated webhook imports may create duplicate calls or fail later on missing schema.
- Root cause: Comma typo in a hand-written runtime migration sequence; no migration-order test.
- Recommended fix: Invoke migrations in one deterministic pre-start sequence and test empty plus upgraded schemas.
- Status: Fixed for Docker deployments in this PR through `scripts/prestart_api.py`, which explicitly calls all runtime helpers including telephony before Uvicorn starts. The duplicate/incorrect line remains technical debt in `main.py` for non-container startup.

### CQ-011 — Login and expensive actions have no confirmed rate limiting

- Area: Authentication / abuse protection
- Severity: High
- Evidence: Login verifies password and audits failures but no application/proxy rate limiter is present; upload, analyze, retry, provider-test, export, and audio download endpoints also lack confirmed request limits.
- User impact: Password guessing, resource exhaustion, provider-cost abuse, and demo quota contention.
- Root cause: MVP deployment assumes trusted pilot access.
- Recommended fix: Apply reverse-proxy and/or application rate limits keyed by IP/user/action, with stricter limits on login and provider-cost operations.
- Status: Deferred. Required before broad public exposure.

### CQ-012 — No reproducible Alembic migration history

- Area: Database lifecycle
- Severity: High
- Evidence: Schema management relies on `create_all()` and imperative migration helpers; expected Alembic configuration/history was not found.
- User impact: Upgrade order, rollback, drift detection, destructive changes, and clean-to-head reproducibility are difficult to prove.
- Root cause: Incremental MVP migration helpers replaced a versioned migration system.
- Recommended fix: Baseline the current schema in Alembic, add versioned forward migrations, and test empty-to-head plus last-release-to-head in CI.
- Status: Deferred. Pre-start helper improves current safety but is not a substitute for versioned migrations.

## 5. Medium-priority findings

### CQ-013 — Redis queue state was ephemeral

- Area: Reliability
- Severity: Medium
- Evidence: Redis had no data volume or AOF configuration.
- User impact: Container/host replacement could lose queued work and leave calls pending.
- Root cause: Redis was configured as a cache despite being the queue of record.
- Recommended fix: Enable AOF and persistent volume; still add DB reconciliation because popped jobs can be lost.
- Status: Fixed in this PR for Compose.

### CQ-014 — Internal services and direct API/web ports were broadly published

- Area: Deployment security
- Severity: High
- Evidence: Base Compose published PostgreSQL, Redis, Ollama, API, and web without loopback host binding.
- User impact: A public VPS/Codespace port policy could expose internal services or permit direct HTTP API access that bypasses reverse-proxy controls.
- Root cause: Development convenience settings reused as launch defaults.
- Recommended fix: Bind development ports to `127.0.0.1`; publish only the production reverse proxy externally.
- Status: Fixed in this PR.

### CQ-015 — Queue retry/dead-letter/reconciliation behavior is incomplete

- Area: Reliability
- Severity: Medium
- Evidence: Workers use Redis `BRPOP`; no lease, attempt count, exponential backoff, dead-letter queue, or stale-state reconciler is evident.
- User impact: Crash-after-pop loses work; transient/permanent failures are treated inconsistently; calls can remain pending.
- Root cause: Minimal MVP queue semantics.
- Recommended fix: Add durable job rows, bounded retries, dead-letter status, and a scheduled stale-pending reconciler.
- Status: Deferred.

### CQ-016 — API request models have weak bounds

- Area: API validation
- Severity: Medium
- Evidence: Several provider/settings/review payloads use unconstrained primitive Pydantic fields; string lengths, timeout ranges, scores, and list sizes are often checked later or not capped.
- User impact: Misconfiguration, oversized DB/log values, long timeouts, and inconsistent validation errors.
- Root cause: Validation is distributed in route code.
- Recommended fix: Add conservative schema bounds and enums while preserving current legitimate inputs.
- Status: Deferred.

### CQ-017 — Product is single-workspace, not multi-tenant

- Area: Product isolation
- Severity: Medium
- Evidence: Calls/settings/reviews do not carry a workspace/tenant foreign key; demo quota is global.
- User impact: Multiple independent buyers cannot be safely isolated in one public deployment.
- Root cause: Current architecture targets one pilot workspace per deployment.
- Recommended fix: Keep deployments single-buyer or add tenant ownership to every user, call, file, review, topic, setting, event, export, and quota query before self-service signup.
- Status: Deferred by product scope.

### CQ-018 — Large exports and analytics are memory/query intensive

- Area: Performance
- Severity: Medium
- Evidence: Calls are loaded into memory for exports; XLSX is generated in memory; dashboard/topic code loads broad collections and includes per-item lookups.
- User impact: Slow requests and API memory pressure with large datasets.
- Root cause: Pilot-scale synchronous reporting implementation.
- Recommended fix: Set export caps, stream CSV, use write-only XLSX/background jobs, and add query-count/performance tests for representative volume.
- Status: Deferred.

### CQ-019 — Foreign keys lack explicit cascade/orphan policy

- Area: Data integrity / retention
- Severity: Medium
- Evidence: Dependent models reference calls/reviews without ORM relationships or `ondelete` behavior; cleanup is implemented manually.
- User impact: Partial deletion can leave orphan records or fail mid-retention run; file/database state can diverge.
- Root cause: Retention/deletion semantics are procedural rather than schema-enforced.
- Recommended fix: Define and test deletion policy per entity, add safe cascades where appropriate, and reconcile orphan files/rows.
- Status: Deferred.

### CQ-020 — Monolithic API increases authorization regression risk

- Area: Maintainability / security
- Severity: Medium
- Evidence: Authentication, calls, providers, users, exports, telephony, retention, audit, and analytics share one route module.
- User impact: Small changes can accidentally skip scope checks or alter unrelated flows.
- Root cause: MVP growth in a single module.
- Recommended fix: First add endpoint authorization/lifecycle tests, then split by domain without changing behavior.
- Status: Deferred; no speculative rewrite performed.

## 6. UX and product findings

- Technical provider/parse failure can currently appear as a real zero score (CQ-006). This is the most serious buyer-facing UX defect.
- Raw queue states are translated in many places, but every newly introduced status must have RU/EN labels and retry guidance.
- Long Russian text, filenames, topics, empty demo state, mobile tables, focus states, and keyboard operation still require browser-level verification in a running build.
- Green accent consistency was implemented in recent PRs; red/orange should remain reserved for warning/error states and be verified route-by-route.
- No large visual redesign was made in this PR.

## 7. Security findings

Confirmed positive controls:

- Auth middleware protects non-exempt routes; telephony webhook is token-authenticated separately.
- Call visibility helpers support all/team/own scopes and are reused by call/export paths inspected.
- Provider/integration settings require admin role.
- Upload extension, declared MIME, size, basename, generated storage filename, and cleanup controls exist.
- Recording playback was previously hardened with authenticated scoped access and Range handling.
- Ingestion tokens are hashed at rest and returned only at generation/regeneration.

Fixed here:

- Recording URL SSRF and redirect validation.
- Partial recording-file cleanup and safer URL logging.
- Placeholder worker startup in protected environments.
- Weak public API environment startup.
- Direct host exposure of internal/application ports.
- Secure-cookie semantics for public pilot.

Remaining:

- CQ-007 raw LLM response logging.
- CQ-008 spreadsheet injection.
- CQ-011 rate limiting/brute-force/resource abuse.
- Full endpoint role/scope matrix must be executed against a running stack.

## 8. Reliability findings

- Redis AOF/volume and health-gated service dependencies are added.
- API container now runs deterministic pre-start schema preparation.
- Recording downloads validate every redirect and remove partial files on network/content/DB failure.
- Crash-after-pop, duplicate delivery, stale jobs, and absence of dead-letter/reconciliation remain.
- Database engines use `pool_pre_ping`, which helps reconnect after stale connections.

## 9. Data integrity findings

- Latest successful QA ordering uses created timestamp and ID, which is deterministic, but duplicate logical analyses remain possible.
- Topic dashboards contain code paths that may select an arbitrary review per call unless all such maps explicitly order latest review; add regression tests.
- Manual topic overrides are not protected from automation.
- Transcript replacement has no revision guard against stale QA/topic completion.
- Telephony uniqueness migration is restored in container pre-start.
- Deletion/retention lacks schema-enforced cascade policy.

## 10. Performance findings

- Demo status performs a distinct successful-review count on every check.
- Dashboard/report routes load broad result sets and some nested data per review.
- CSV/XLSX exports are synchronous and XLSX is memory-backed.
- Redis/worker concurrency and provider rate limits are not capacity-planned in repository configuration.

## 11. Test coverage gaps

Added in this PR:

- Protected-environment QA/STT placeholder guard.
- Production API environment guard: auth, strong secret, admin credentials, HTTPS CORS, pilot-cookie safety.
- Recording URL policy: schemes, embedded credentials, private/loopback DNS, public targets, explicit private-host allowlist, unresolved host.
- Compose rendering assertions for loopback bindings, Redis persistence, demo limit, and obsolete banner removal.

Still required:

1. Atomic demo quota: under/exact/over, concurrent single, mixed batch, retry, invalid/degraded policy, and disabled/non-demo mode.
2. QA idempotency: duplicate delivery, stale transcript revision, timeout, malformed output, crash after provider response.
3. Topic manual override/reclassification and required-action integrity.
4. Complete role/scope matrix for calls, audio, transcript, QA, topic, users, integrations, settings, exports, audit, and retention.
5. Audio full/Range/invalid Range/missing file/download/unauthorized/forbidden.
6. CSV/XLSX UTF-8, nulls, latest review, topic/transcript fields, and formula injection.
7. Empty schema and recent deployed schema migration tests.
8. Browser route smoke in RU/EN and responsive/accessibility checks.

## 12. Deployment readiness

Current verdict:

- Controlled single-buyer pilot: conditionally ready after CI and manual Codespaces smoke succeed, real providers are verified, and the Critical demo-quota race is operationally constrained.
- Public self-service/multi-tenant launch: not ready.

Required interim constraints:

- Invite-only users.
- One buyer/workspace per deployment.
- `APP_ENV=production`, HTTPS, strong secrets, explicit CORS.
- Real STT/QA provider modes; no placeholder override.
- Reverse proxy is the only externally published service.
- Daily PostgreSQL/upload backups and restore drill.
- Queue depth, worker heartbeat, stuck-call, disk, auth-failure, and provider-error monitoring.
- Manual demo usage monitoring until atomic reservations exist.

## 13. Fixes implemented in this PR

1. Added evidence-based audit and production launch checklist.
2. Added fail-closed QA/STT worker mode guard for production/pilot containers.
3. Added fail-closed API environment guard for public deployment.
4. Changed public pilot to production cookie/security semantics.
5. Bound PostgreSQL, Redis, Ollama, API, and web host ports to loopback by default.
6. Enabled Redis AOF, persistent volume, health check, and health-gated dependencies.
7. Added deterministic API pre-start schema preparation and restored telephony migration invocation.
8. Blocked recording-download SSRF, unsafe redirects, embedded credentials, and private/local targets by default.
9. Added explicit private PBX hostname allowlist controls.
10. Removed partial downloaded files after failure and stopped logging full invalid job payloads/URL query tokens.
11. Removed obsolete pilot banner default.
12. Expanded `.gitignore` for OS/editor/local-data/generated artifacts.
13. Added focused unit and Compose hardening CI checks.

## 14. Remaining risks

Critical:

- Non-atomic demo quota reservation.

High:

- Duplicate/stale QA and transcript jobs.
- Manual topic override can be overwritten.
- Malformed LLM output is stored as successful zero-score QA.
- Full raw LLM response may enter logs.
- Spreadsheet formula injection in CSV/XLSX exports.
- No confirmed login/provider-cost rate limiting.
- No versioned Alembic migration history.
- Full endpoint authorization matrix not yet executed in this environment.

Medium:

- No durable retry/dead-letter/stale-job reconciliation.
- Weak schema bounds on several API payloads.
- Single-workspace architecture only.
- Synchronous large exports and broad analytics queries.
- Manual cascade/orphan cleanup policy.
- Browser/mobile/accessibility validation remains manual.

## 15. Recommended post-launch backlog

1. Add `analysis_jobs` plus transactional quota reservations and transcript revisions.
2. Add degraded AI state; never convert provider/schema errors into business score.
3. Remove full raw model response logging and add privacy-safe structured logs.
4. Preserve manual topic decisions and audit explicit reclassification.
5. Add central spreadsheet-safe cell serialization and export tests.
6. Baseline schema in Alembic and test empty/recent upgrades.
7. Add endpoint authorization matrix and rate limiting before module split.
8. Add bounded retries, dead-letter state, and stale-pending reconciliation.
9. Add export limits/background generation and query-count tests.
10. Decide explicitly between isolated single-buyer deployments and true multi-tenant SaaS.

## Validation record and environment limitations

Confirmed through repository inspection:

- Baseline is latest `origin/main` at audit start; PRs #68, #69, and #70 are present.
- Branch is based directly on baseline and was not behind at comparison time.
- Existing CI already compiles Python, builds Next.js, renders Compose, and runs authenticated upload/transcript/QA smoke flows.
- Web package exposes `build` only; no repository `lint`, `typecheck`, or frontend `test` script was found.

Executed for this PR through added CI configuration when the draft PR runs:

- Python unit discovery for API/worker guards and recording URL safety.
- Base and pilot Compose rendering assertions.
- Protected-environment rejection checks.
- Existing full repository CI workflow.

Not claimed as locally executed by the audit agent:

- Docker stack, PostgreSQL migrations, Next.js build, browser smoke, real STT/LLM provider flow, and 51st-call quota test. The available shell could not resolve GitHub to clone the repository. These are explicit Codespaces verification items in `docs/production-launch-checklist.md`.
