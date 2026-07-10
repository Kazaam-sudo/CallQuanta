# CallQuanta pre-launch audit

Baseline: `2f242887f63ab3315d65891b028cefcaccbef9dd` (`main`, merge of PR #70).

## 1. Executive summary

CallQuanta has a coherent early-beta workflow and several good security foundations: authenticated recording playback, scoped-access helpers, write-only provider secrets, bounded upload sizes, transcript validation, provider timeouts, and explicit failed/blocked statuses. It is not yet ready for an unattended public production launch.

The highest confirmed launch risk is the demo quota implementation. It counts only successful QA reviews and performs non-atomic check-then-enqueue checks in both API and worker code. Concurrent analysis requests can exceed the configured limit, queued work is not reserved, and duplicate jobs can create duplicate successful reviews. The worker also defaults to `QA_MODE=placeholder`; a missing environment variable can therefore produce deterministic fake QA while marking the call as successfully analyzed.

This PR intentionally avoids a broad rewrite. It documents confirmed findings, hardens local service exposure and Redis persistence in Compose, improves safe environment documentation, and supplies an executable launch checklist. Business-logic changes that require schema-level idempotency/quota reservations are deferred rather than patched with another race-prone counter.

## 2. Architecture map

- Web: Next.js app-router application in `apps/web` with same-origin proxy routes.
- API: FastAPI application concentrated in `apps/api/app/main.py`.
- Database: PostgreSQL through SQLAlchemy models in `apps/api/app/db.py`, plus Alembic/runtime migration helpers.
- Queues: Redis lists for transcription, QA, topic classification, and recording download.
- Workers: `workers/stt-worker`, `workers/qa-worker`, and `workers/recording-worker`.
- Storage: mounted local upload volume shared by API/workers.
- AI configuration: database-backed LLM/STT provider configuration with environment fallback.

Primary flow:

```text
Upload/import
  -> durable audio path + Call row
  -> transcription queue
  -> transcript segments + transcript validation
  -> topic classification
  -> QA queue
  -> QAReview + topic action results
  -> manager feedback/human review
  -> dashboard and exports
```

Transition controls observed:

- API sets user-visible pending/failed states around enqueue operations.
- STT/QA workers persist failure details on permanent processing errors.
- Transcript validation blocks QA and records a failed QA review.
- Authorization is centralized but concentrated in one large API module, increasing regression risk.
- Queue delivery uses Redis list pop semantics; no durable job identity, lease, or dead-letter queue is evident.

## 3. Critical findings

### CQ-001 — Demo quota can be exceeded concurrently

- Area: Demo quota / QA processing
- Severity: Critical
- Evidence: `_demo_quota_status()` counts distinct successful `QAReview.call_id`; `_ensure_demo_quota_available()` performs a separate read before status update/enqueue. Batch operations keep only an in-request counter. `qa-worker` repeats the same non-locking count before execution.
- User impact: A public free demo configured for 50 calls can process more than 50 calls when users click concurrently, use batch and single endpoints together, or when multiple workers consume queued jobs.
- Root cause: Check-then-act logic without a database reservation row, unique job identity, transaction lock, or quota ledger.
- Recommended fix: Add a database-backed analysis reservation/usage ledger with a unique constraint per call and an atomic transaction that reserves capacity before enqueue. Release or finalize according to the explicit failed/blocked quota policy.
- Status: Deferred — requires a migration and coordinated API/worker change; a counter-only patch would remain bypassable.

### CQ-002 — Missing `QA_MODE` enables fake successful QA

- Area: AI output / deployment configuration
- Severity: Critical
- Evidence: `workers/qa-worker/worker.py` defaults `QA_MODE` to `placeholder`; placeholder reviews are saved with `status="success"` and calls become `analyzed`.
- User impact: A production/demo deployment with a missing or misspelled environment value can display fabricated deterministic scoring as completed AI analysis to buyers.
- Root cause: Test-safe default is also the runtime default and no production startup guard distinguishes CI/test from buyer-facing environments.
- Recommended fix: In non-test environments, fail worker startup unless `QA_MODE` is explicitly set to an approved real mode; clearly label placeholder output in UI and exclude it from buyer-facing demo quota/metrics unless intentionally enabled.
- Status: Deferred — startup guard and UI behavior require worker tests and coordinated product decision. Environment documentation is hardened in this PR.

## 4. High-priority findings

### CQ-003 — Duplicate or stale QA jobs are not idempotent

- Area: Queue / QA worker / data integrity
- Severity: High
- Evidence: `process_qa_job(call_id)` does not carry or verify a job/version ID and always inserts a new `QAReview`. A delayed duplicate can run after a newer analysis and set the call back to `analyzed` with another review.
- User impact: Duplicate review history, double provider cost, stale results becoming the apparent latest review, and inconsistent exports/dashboard values.
- Root cause: Queue payload contains only `call_id`; no uniqueness constraint or expected transcript/revision token is checked.
- Recommended fix: Add analysis job IDs plus transcript revision/version. Enforce unique successful completion per job and reject stale jobs before provider invocation and before commit.
- Status: Deferred.

### CQ-004 — Topic classification can overwrite a manual correction

- Area: Topic classification
- Severity: High
- Evidence: Worker selects the latest classification row or creates one, then overwrites primary/secondary topic, confidence, rationale, evidence, and `classified_by`; no manual-lock/revision check is visible.
- User impact: A manager’s correction can disappear when a delayed classification or QA job runs.
- Root cause: Automated and manual topic states share a mutable row without provenance/locking semantics.
- Recommended fix: Preserve manual overrides and store automated suggestions separately, or refuse automated overwrite when `classified_by` is manual unless explicitly reclassified.
- Status: Deferred.

### CQ-005 — Invalid LLM output is converted into successful zero-score QA

- Area: AI validation / reliability
- Severity: High
- Evidence: JSON/value parsing errors call `fallback_review()`, after which the worker inserts `QAReview(status="success")` and marks the call `analyzed`.
- User impact: Provider/model failures can look like a legitimate 0 score rather than a technical failure requiring retry, damaging trust and dashboard accuracy.
- Root cause: Recovery output and valid model output share the same success state.
- Recommended fix: Store a distinct `degraded`/`invalid_model_output` state, exclude it from successful analytics/quota, retain the raw provider correlation ID in logs, and expose retry.
- Status: Deferred.

### CQ-006 — Raw model response may leak transcript content into logs

- Area: Privacy / logging
- Severity: High
- Evidence: On parse failure the QA worker prints the complete raw LLM response. Responses can repeat transcript excerpts and sensitive customer data.
- User impact: Sensitive call data may be retained in container/platform logs beyond configured transcript retention.
- Root cause: Debug logging is unbounded and not privacy-aware.
- Recommended fix: Log only length, hash/correlation ID, provider/model, and a short redacted structural excerpt; never the complete response in production.
- Status: Deferred.

### CQ-007 — Infrastructure services are exposed on all host interfaces by default

- Area: Deployment security
- Severity: High
- Evidence: Compose publishes PostgreSQL, Redis, and Ollama using bare host ports (`5432`, `6379`, `11434`).
- User impact: On a public VPS or permissive Codespace port configuration, unauthenticated Redis/Ollama and password-protected PostgreSQL may be reachable externally.
- Root cause: Development convenience defaults are unsafe when reused for deployment.
- Recommended fix: Bind development-only ports to `127.0.0.1`, keep service-to-service traffic on the Compose network, and use a production override that publishes only the reverse proxy.
- Status: Fixed in this PR.

## 5. Medium-priority findings

### CQ-008 — Redis queue data has no persistence configuration

- Area: Reliability
- Severity: Medium
- Evidence: Redis had no volume and no explicit append-only persistence.
- User impact: Host/container replacement can lose queued transcription/QA/download jobs, leaving calls pending until manually retried.
- Root cause: Redis was treated as ephemeral despite being the sole queue.
- Recommended fix: Enable AOF persistence with a named volume, or move to a queue with explicit durable delivery semantics.
- Status: Fixed in this PR for Compose.

### CQ-009 — API/provider request models have weak bounds

- Area: API validation
- Severity: Medium
- Evidence: Provider names, URLs, models, and timeout values use unconstrained primitive Pydantic fields in the API module; invalid/negative/very large values are normalized later or can reach runtime code.
- User impact: Misconfiguration, long hangs, oversized payloads, and inconsistent HTTP errors.
- Root cause: Validation is distributed in endpoint code rather than request schemas.
- Recommended fix: Add length/range/URL constraints and centralized validators without changing accepted legitimate presets.
- Status: Deferred.

### CQ-010 — Monolithic API module increases security regression risk

- Area: Maintainability / security
- Severity: Medium
- Evidence: `apps/api/app/main.py` contains authentication, access control, calls, exports, providers, retention, telemetry, and system endpoints in more than 4,000 lines.
- User impact: Small feature changes can accidentally bypass shared authorization or mutate unrelated behavior.
- Root cause: Routing and domain logic are co-located.
- Recommended fix: Split only after endpoint-level authorization and lifecycle tests exist; do not perform a speculative rewrite before launch.
- Status: Deferred.

### CQ-011 — Queue retry/dead-letter behavior is incomplete

- Area: Reliability
- Severity: Medium
- Evidence: Redis list workers pop jobs and handle processing exceptions locally; no explicit attempt counter, backoff schedule, dead-letter queue, or lease/reclaim mechanism is documented.
- User impact: A worker crash after pop can lose a job; permanent and transient failures are not consistently differentiated.
- Root cause: Minimal queue implementation optimized for MVP simplicity.
- Recommended fix: Add job IDs, attempts, bounded exponential retry, dead-letter storage, and a reconciliation task for stale pending calls.
- Status: Deferred.

## 6. UX and product findings

### CQ-012 — Technical fallback can be presented as business score

- Area: Call details/dashboard
- Severity: High
- Evidence: Fallback invalid-model output is stored as successful QA with a computed zero score.
- User impact: Buyers may interpret an integration error as catastrophic agent performance.
- Root cause: Missing degraded state and buyer-facing error copy.
- Recommended fix: Separate “analysis unavailable” from score, offer retry, and exclude degraded records from aggregates.
- Status: Deferred.

### CQ-013 — Demo semantics are global rather than workspace-specific

- Area: Product/demo isolation
- Severity: Medium
- Evidence: The quota query has no workspace/team condition and the data model references a single global workspace setting.
- User impact: Multiple buyers sharing one environment consume one global quota and may affect each other’s demo availability; this architecture is unsuitable for multi-tenant public signup.
- Root cause: Current product is a single-workspace pilot application, not a multi-tenant SaaS.
- Recommended fix: Keep public demo single-tenant and invite-only, or introduce explicit tenant/workspace ownership throughout calls, users, settings, reviews, files, and exports before self-service launch.
- Status: Deferred.

## 7. Security findings

Confirmed positive controls:

- Recording playback is authenticated and scoped to call visibility.
- Upload extensions/content types and size limits exist.
- Filenames use sanitization and generated storage names.
- Provider keys are documented as write-only.
- CORS defaults to local origins rather than wildcard.

Remaining launch risks:

- CQ-006 sensitive LLM output logging.
- CQ-007 unsafe default host-port exposure (fixed).
- No rate limiting/brute-force control was confirmed for login, uploads, provider tests, exports, or analysis actions.
- A public demo should not expose settings/provider mutation to demo users; this needs role-by-role endpoint verification in a running stack.
- Single-workspace architecture must not be advertised as isolated multi-tenant SaaS.

## 8. Reliability findings

- Redis persistence was absent and is fixed for Compose.
- Worker crash-after-pop can lose jobs.
- Duplicate/stale delivery is not idempotent.
- Invalid provider output is incorrectly converted into business success.
- Pending-call reconciliation is not evident; add an operational query/command for calls stuck beyond an SLA.
- API and workers use `pool_pre_ping`, which is a useful database reconnect control.

## 9. Data integrity findings

- Successful QA reviews are append-only but duplicate jobs can create duplicate logical analyses.
- Latest-review selection must be based on a stable created timestamp/ID and should ignore failed/degraded reviews unless explicitly requested.
- Automated topic classification can overwrite manual state.
- Transcript replacement needs a revision token so stale QA/topic jobs cannot commit against prior segments.
- Retention must delete associated files and dependent rows transactionally or record partial cleanup failures.

## 10. Performance findings

- Counting distinct successful calls on every demo status/check becomes increasingly expensive without a supporting partial/indexed strategy.
- Large dashboard/export queries require explicit pagination or streaming; verify all list endpoints cap page size.
- Excel export is built in memory; large exports can consume API memory. Set export limits or move generation to a background job for production volume.
- The monolithic API increases the chance of N+1 query patterns; use SQL logging/query-count tests on calls, dashboard, review history, and topic analytics.

## 11. Test coverage gaps

Required before public launch:

1. Atomic demo quota reservation: under/exact/over limit, concurrent single requests, mixed batch/single, retry, failed/degraded/invalid transcript policy, and non-demo mode.
2. QA idempotency: duplicate delivery, stale transcript revision, provider timeout, malformed JSON, worker crash after provider response and before commit.
3. Topic override: manual correction survives delayed automatic jobs; explicit reclassification is audited.
4. Authorization matrix: every read/write endpoint for admin, manager, supervisor, agent, viewer, cross-team, and cross-call IDs.
5. Audio: valid/invalid Range, suffix/open-ended Range, missing file, unauthorized/forbidden, content type, download audit.
6. Exports: UTF-8 Russian text, nulls, current review selection, topic fields, transcript validity, and CSV formula injection.
7. Migration: empty database to head and upgrade from the last public-demo schema.

## 12. Deployment readiness

Not ready for public production until Critical/High deferred items are addressed or operationally constrained.

Acceptable interim scope:

- Invite-only, single-buyer demo.
- Explicit real-provider configuration and manual verification that placeholder mode is disabled.
- Reverse proxy publishes only HTTPS web traffic.
- Database/Redis/Ollama remain private.
- Daily PostgreSQL and upload-volume backups.
- Monitoring for queue depth, worker heartbeat, stuck calls, disk usage, provider failures, and authentication abuse.

## 13. Fixes implemented in this PR

- Bound PostgreSQL, Redis, and Ollama host ports to loopback by default.
- Enabled Redis AOF persistence and a named volume.
- Added a Redis health check and made dependent services wait for Redis health.
- Added safer environment guidance for demo quota and explicit placeholder-mode warnings.
- Added `docs/production-launch-checklist.md`.

## 14. Remaining risks

Critical:

- Atomic demo quota reservation.
- Placeholder QA runtime default/startup guard.

High:

- QA job idempotency and stale-job protection.
- Manual topic override protection.
- Invalid LLM response represented as success.
- Sensitive raw LLM response logging.
- Full endpoint authorization verification.

Medium:

- Durable retry/dead-letter/reconciliation flow.
- API schema bounds and rate limits.
- Large export memory usage.
- Migration-from-zero and recent-upgrade verification.
- Multi-tenant isolation is not implemented.

## 15. Recommended post-launch backlog

1. Introduce `analysis_jobs`/quota reservations with unique call+revision keys and transactional capacity reservation.
2. Add transcript revision and expected-revision fields to QA/topic queue payloads.
3. Add explicit `degraded` analysis state and remove raw model output from production logs.
4. Protect manual topic overrides and audit explicit reclassification.
5. Add endpoint authorization matrix tests before splitting the API module.
6. Add bounded retry/dead-letter queues and stale-pending reconciliation.
7. Add production Compose/Helm deployment that exposes only a reverse proxy and uses managed PostgreSQL/Redis where appropriate.
8. Decide explicitly between single-workspace deployments and true multi-tenant SaaS before public signup.

## Validation notes

Repository inspection was performed against GitHub `main` at the baseline SHA. The execution environment used for this audit did not have outbound DNS access to clone the repository or start Docker, so Python tests, frontend build, Compose rendering, migrations, and end-to-end provider flows were not claimed as executed. Exact Codespaces commands are included in the launch checklist and PR description for final verification.