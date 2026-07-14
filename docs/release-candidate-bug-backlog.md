# Release-candidate bug backlog

Baseline: `714102a6b5a6f3477e723e59b0888a947b4077f5`

This backlog contains only findings supported by current source inspection and continuity from the pre-launch audit. Runtime-only hypotheses are not promoted to bugs without evidence.

## RC-BUG-001 — Demo quota can be exceeded by concurrent or queued work

- **Severity:** Critical
- **Reproduction steps:**
  1. Configure a small `DEMO_CALL_LIMIT`.
  2. Submit enough single/batch/retry analyses concurrently to fill and exceed remaining capacity before workers complete.
  3. Observe that each requester can pass a pre-enqueue count check before successful reviews are committed.
- **Expected:** Capacity is reserved atomically and total accepted usage never exceeds the configured limit.
- **Actual:** Quota is based on completed successful reviews; queued/in-flight work is not transactionally reserved.
- **Probable root cause:** Separate check/enqueue/worker phases with no database-backed reservation ledger.
- **Affected files/components:** API demo quota helpers; analyze/retry/batch endpoints; QA worker completion path; QA review persistence.
- **Recommended fix:** Add a transactional quota ledger with unique keys for call + transcript/review revision, explicit states (`reserved`, `consumed`, `released`) and row-level locking/atomic upsert.
- **Regression test required:** Concurrent requests at `remaining=1`; batch crossing the limit; retry of an already-reserved revision; failed job release policy; exactly-at-limit and over-limit tests.

## RC-BUG-002 — Queue jobs lack strong idempotency and revision identity

- **Severity:** High
- **Reproduction steps:**
  1. Enqueue the same call more than once or replay a Redis message.
  2. Modify/retranscribe the call while an older job remains queued.
  3. Let both jobs execute.
- **Expected:** Duplicate/stale jobs are detected; only the current revision produces final records/provider cost.
- **Actual:** Jobs are primarily call-ID based; no confirmed unique job/revision contract prevents duplicate or stale processing.
- **Probable root cause:** Queue payload schema does not consistently carry durable job ID, transcript revision and idempotency key.
- **Affected files/components:** API queue helpers; STT worker; QA worker; topic-classification worker logic; review/transcript persistence.
- **Recommended fix:** Create a jobs table and immutable job envelope containing job ID, call ID, input revision, type, attempts and state. Workers must compare the revision and commit idempotently.
- **Regression test required:** Duplicate message replay; stale transcript revision; worker restart after provider completion but before acknowledgment; two workers processing one job.

## RC-BUG-003 — Redis list consumption has no durable lease/DLQ workflow

- **Severity:** High
- **Reproduction steps:**
  1. Let a worker `BRPOP` a job.
  2. Terminate the worker before persistence completes.
  3. Restart the worker and inspect queue/job state.
- **Expected:** Job is recovered after lease expiry or appears in a visible failed/dead-letter state.
- **Actual:** Redis list removal occurs before completion; no confirmed lease, acknowledgment, attempt ledger or DLQ exists.
- **Probable root cause:** Basic Redis list queue design rather than a durable acknowledged queue.
- **Affected files/components:** STT, QA and recording workers; Redis queue helpers; system-status UI.
- **Recommended fix:** Use a processing queue/lease pattern or durable job table, explicit acknowledgment, exponential backoff, max attempts and DLQ/reconciliation tooling.
- **Regression test required:** Kill worker at each processing stage; Redis reconnect; API restart; retry exhaustion; stale processing recovery.

## RC-BUG-004 — Malformed/provider-failed LLM output may look like a normal QA result

- **Severity:** High
- **Reproduction steps:**
  1. Configure a provider response that is HTTP-successful but malformed/non-JSON, or force a parse/value error.
  2. Run QA.
  3. Inspect final review status, score and dashboard/quota accounting.
- **Expected:** Review is marked technical failure; no normal score or analyzed status is shown; quota policy is explicit.
- **Actual:** Prior audit found a fallback review path capable of producing a zero-like normal review and success semantics. Recent auth-only merges did not address it.
- **Probable root cause:** Parse/provider errors share the same fallback object and persistence path as legitimate model output.
- **Affected files/components:** QA worker parsing/fallback logic; QA review persistence; call status; dashboard and quota accounting.
- **Recommended fix:** Introduce explicit provider/parse failure states. Never call the normal success persistence path for technical failures. Keep sanitized diagnostics separately.
- **Regression test required:** Malformed JSON; schema-invalid values; timeout; 429/500; empty response; retry then success; ensure no score/quota consumption on technical failure unless intentionally specified.

## RC-BUG-005 — CSV/XLSX formula injection protection is not confirmed

- **Severity:** High
- **Reproduction steps:**
  1. Store a filename, agent, topic, transcript or feedback value beginning with `=`, `+`, `-` or `@`.
  2. Export CSV/XLSX.
  3. Open it in a spreadsheet application.
- **Expected:** Untrusted text is escaped or forced to literal text.
- **Actual:** No confirmed centralized sanitizer exists for exported untrusted strings.
- **Probable root cause:** Export rows write application/user strings directly to CSV/XLSX cells.
- **Affected files/components:** Calls CSV export; topic exports; XLSX generation; any future report export.
- **Recommended fix:** Centralize a spreadsheet-safe text function that prefixes dangerous leading characters with an apostrophe or uses an explicit safe text cell type consistently.
- **Regression test required:** All four dangerous prefixes; whitespace before prefix; Unicode/Russian text; numeric/date values remain correctly typed; CSV and XLSX parity.

## RC-BUG-006 — Full release-candidate runtime evidence is missing

- **Severity:** Release blocker / QA process
- **Reproduction steps:** Not a product defect. Attempt to complete the release matrix without access to the running Codespaces environment, credentials, approved audio and logs.
- **Expected:** A release candidate has attached end-to-end browser, role, real-provider, invalid-input, persistence and resilience evidence.
- **Actual:** This audit could only perform GitHub/source inspection because the runtime could not resolve GitHub and could not access the user's Codespaces gateway.
- **Probable root cause:** Audit execution environment access limitation.
- **Affected files/components:** Release process and evidence package, not production code.
- **Recommended fix:** Run `docs/release-candidate-qa.md` in the actual Codespaces environment and attach sanitized logs, route traces, screenshots, timings and export samples to this QA PR.
- **Regression test required:** Repeat the complete matrix on every release candidate after auth, worker, queue or quota changes.
