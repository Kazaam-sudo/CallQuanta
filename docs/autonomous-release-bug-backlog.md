# Autonomous release bug backlog

Candidate: `agent/release-polish-recovery` based on `764ac29e`.

## ARQ-REC-001 — Candidate browser smoke is not running against candidate images

- **Severity:** Critical release blocker
- **Status:** Blocked
- **Evidence:** The live Playwright run reached the login page, but accessibility
  snapshots showed plain text beside unlabeled textboxes. The workspace source
  now pairs those labels with input IDs, so the running web image is stale.
- **Required action:** Build/deploy the candidate web image, then rerun
  `pnpm test:e2e` with the local gateway as `PLAYWRIGHT_BASE_URL`.

## ARQ-REC-002 — Full Python suites lack host dependencies

- **Severity:** High release-validation blocker
- **Status:** Blocked
- **Evidence:** The Codespaces host has no `sqlalchemy`, `redis`, or `pytest`.
  API discovery therefore skips its dependency-bound tests, release-hardening
  cannot import Redis, and worker pytest cannot start. Existing production
  containers also omit at least some test directories/tools.
- **Required action:** Run the suites in the project’s provisioned test
  environment or add a documented non-production test environment with the
  declared dependencies. Do not install unpinned packages as part of the gate.

## ARQ-REC-003 — Authenticated and real-provider evidence remains absent

- **Severity:** Critical release blocker
- **Status:** Blocked
- **Evidence:** Recovery did not use credentials or approved customer audio, and
  no configured real-provider evidence was collected.
- **Required action:** Use disposable release credentials and approved synthetic
  test data after candidate deployment; record only redacted outcomes.

## Confirmed fixes in this candidate

- Auth-state feedback is translated for English, Russian, and Uzbek.
- Login email/password labels are programmatically associated with their inputs.
- Non-admin language selection stays local and no longer writes shared workspace
  settings, including during initial authenticated settings load.
- Release checks now default to non-mutating operation and require explicit
  opt-in for image builds, live checks, and disposable-data probes.

## Final-polish follow-up — 2026-07-17 UTC

Baseline: `1ebfb5a0c844edc1904985ec718aa194b45bc3a3`.

### ARQ-FINAL-001 — Missing Docker was reported as a product failure

- **Severity:** Medium release-tooling defect
- **Status:** Fixed
- **Evidence:** `./scripts/release-check.sh` reported two `FAIL` results when
  the host had no `docker` executable, despite the gate definition treating a
  missing prerequisite as `BLOCKED`.
- **Fix:** Detect Docker Compose availability before parsing either Compose
  configuration and emit two explicit `BLOCKED` results when it is absent.
- **Regression check:** `scripts/test_release_check_docker_availability.py`
  runs the gate with no Docker command and verifies its zero-failure outcome.

### Remaining release blockers

- **Critical:** Build and run current-candidate images, then capture public and
  authenticated Playwright evidence against the local gateway.
- **Critical:** Run an approved synthetic recording through local
  faster-whisper and an active real LLM provider; do not use placeholder output.
- **High:** Run API, hardening, and worker test suites in a provisioned Python
  environment with their declared dependencies.
- **High:** Validate role boundaries, exports, and atomic quota handling only
  against disposable data.
