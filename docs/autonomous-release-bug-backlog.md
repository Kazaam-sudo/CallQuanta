# Autonomous release bug backlog

Baseline: `633816d7b05452d00c54d6665793a299338eeb46`

No new production-code defect was proven because this audit environment could not access the live Codespaces stack. The entries below are release blockers that require runtime evidence before implementation changes.

## ARQ-BLOCK-001 — Production-like end-to-end evidence is missing

- **Severity:** Critical
- **Reproduction steps:** Attempt startup, gateway, authentication, real STT/LLM and recovery validation without access to the running Codespaces instance.
- **Expected:** Evidence from the exact merged SHA covers startup, authentication, one real call, quota and recovery.
- **Actual:** Source and unit evidence exist, but the live matrix was unavailable.
- **Probable root cause:** QA execution environment has no Codespaces, browser or Docker access.
- **Affected files/components:** Release process and all deployed services.
- **Recommended fix:** Run `docs/autonomous-release-qa.md` in Codespaces and attach sanitized outputs, screenshots, call IDs, timings and logs.
- **Regression test required:** A required release smoke and end-to-end workflow for every candidate.

## ARQ-BLOCK-002 — Queue recovery is not runtime-proven

- **Severity:** High
- **Reproduction steps:** Enqueue recording, STT and QA jobs; stop workers after claim; restart workers and Redis; replay duplicate payloads.
- **Expected:** Jobs recover once, retries are bounded, duplicate final records are absent and exhausted jobs enter the dead-letter queue.
- **Actual:** Source and unit tests implement the behavior, but no live Redis or worker evidence was available.
- **Probable root cause:** Runtime access limitation, not a confirmed code failure.
- **Affected files/components:** `packages/reliable_queue.py`, worker release entrypoints and Redis.
- **Recommended fix:** Execute controlled fault-injection tests before changing implementation.
- **Regression test required:** Compose integration test for claim, stop, restart, duplicate delivery and retry exhaustion.

## ARQ-BLOCK-003 — Atomic demo quota is not concurrency-proven

- **Severity:** High
- **Reproduction steps:** Configure a small limit and send concurrent single, batch, retry and auto-QA requests at the last slot.
- **Expected:** Accepted capacity never exceeds the limit and same-call retries are idempotent.
- **Actual:** Lua reservation and unit tests exist, but no live concurrent run was possible.
- **Probable root cause:** Runtime access limitation.
- **Affected files/components:** `packages/demo_quota.py`, API release entrypoint, STT auto-QA and QA worker.
- **Recommended fix:** Run concurrent gateway tests and inspect Redis and database state.
- **Regression test required:** Parallel requests at one remaining slot, batch crossing the limit and terminal-failure release.

## ARQ-BLOCK-004 — Real provider failure behavior is not proven

- **Severity:** High
- **Reproduction steps:** Use a controlled LLM endpoint returning timeout, HTTP error, malformed JSON and schema-invalid JSON.
- **Expected:** No normal score, bounded retries, one terminal failed review and no sensitive raw response in logs.
- **Actual:** Source rejects fallback success, but runtime behavior was not exercised.
- **Probable root cause:** Provider and runtime unavailable.
- **Affected files/components:** QA release worker, parser, review persistence and logs.
- **Recommended fix:** Add a controlled OpenAI-compatible mock provider to integration testing.
- **Regression test required:** Timeout, provider error, malformed payload, retry success and retry exhaustion.

## ARQ-BLOCK-005 — Export and localization artifacts are missing

- **Severity:** High
- **Reproduction steps:** Store Russian text and formula-like prefixes, download CSV and XLSX, and inspect RU and EN routes at desktop, tablet and mobile widths.
- **Expected:** Values remain literal, Unicode is correct and screens contain no mixed or raw localization or layout defects.
- **Actual:** Sanitizer and unit tests exist, but downloadable artifacts and browser screenshots were unavailable.
- **Probable root cause:** Browser and runtime access limitation.
- **Affected files/components:** Exports, spreadsheet sanitizer, i18n catalogs and web routes.
- **Recommended fix:** Attach representative exports and screenshots from the exact release SHA.
- **Regression test required:** Export integration tests plus browser localization and responsive smoke coverage.
