# Autonomous release QA execution artifacts

Recovery branch: `agent/release-polish-recovery`

Base commit: `764ac29e92cf22210fa399836f8fd5843bedfe57`

Execution date: 2026-07-15 UTC

## Static results

| Check | Result |
| --- | --- |
| `python3 -m compileall apps/api workers packages scripts` | PASS |
| Fixture test | PASS — 2 tests after deterministic-byte assertion |
| Transcript wrapper test | PASS |
| `apps/web && pnpm test` | PASS — 2 tests |
| `apps/web && pnpm run build` | PASS |
| `docker compose config` | PASS — output intentionally discarded |
| Pilot Compose config | PASS — output intentionally discarded |
| `./scripts/release-check.sh` | PASS — 12 pass, 0 fail, 5 blocked prerequisites |

## Blocked Python checks

The host interpreter has no SQLAlchemy, Redis, or pytest. The dependency-bound
API discovery, release-hardening suite, and worker pytest suite cannot provide
valid evidence in that interpreter. An attempt inside the existing containers
also found that the API/STT images omit test directories and the QA image lacks
pytest. No dependency installation was performed.

## Existing-stack evidence

`docker compose -f docker-compose.yml -f docker-compose.pilot.yml ps -a` showed
API, Postgres, Redis, web, gateway, and all workers up; API, Postgres, and Redis
were healthy. This only demonstrates the already-running environment, not the
candidate source.

## Playwright result

`apps/web && pnpm test:e2e` started 10 desktop/mobile checks against the local
gateway. The public/login tests failed because the running web image presented
unassociated login labels. This exactly matches a stale deployment of the
pre-fix UI, not the current workspace source (which has input IDs and `htmlFor`
associations). No candidate image was built or restarted during recovery, so the
browser gate is **BLOCKED**, not accepted as a candidate regression.

Playwright traces, reports, and test results are ignored by Git. No credentials,
request payloads, raw logs, or Compose-rendered secrets are included here.

## Final-polish execution — 2026-07-17 UTC

Baseline SHA: `1ebfb5a0c844edc1904985ec718aa194b45bc3a3`
Branch: `agent/release-candidate-final-polish`
Environment: local macOS Codex workspace, bundled Python 3.12 and Node 24;
Docker unavailable.

| Check | Result |
| --- | --- |
| Python compileall (`apps/api`, `workers`, `packages`, `scripts`) | PASS |
| Transcript validation and synthetic fixture tests | PASS |
| Docker-unavailable release-gate regression test | PASS |
| `apps/web && pnpm test` | PASS — 16 tests |
| `apps/web && pnpm run build` | PASS |
| `./scripts/release-check.sh` | PASS — 10 pass, 0 fail, 7 blocked |
| Base and pilot Compose parse | BLOCKED — `docker: command not found` |
| Playwright release smoke | BLOCKED — Chromium headless-shell executable is not installed; 10 tests stopped before navigation |
| Candidate stack, auth, worker pipeline, exports, real LLM | BLOCKED — Docker and approved disposable credentials/provider evidence unavailable |

The release gate was run with the bundled runtimes and a temporary Python bytecode
cache. It did not start or restart services, alter `.env`, print secret values,
or create test users.

Release verdict: **NOT READY** for a public demo until the critical live-stack
and real-provider evidence is collected.
