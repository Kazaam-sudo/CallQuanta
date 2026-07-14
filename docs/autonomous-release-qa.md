# Autonomous release QA

## Verdict

**NOT READY**

This verdict is conservative. The latest `main` contains the release-blocking fixes from PR #76, but this execution environment could not resolve `github.com` for a local checkout and had no access to the owner's running Codespaces gateway, environment, credentials, Docker daemon state, approved audio, browser session or service logs. Therefore the end-to-end production-like release path could not be proven.

## Baseline

- Repository: `Kazaam-sudo/CallQuanta`
- Baseline SHA: `633816d7b05452d00c54d6665793a299338eeb46`
- Latest merge: PR #76 — confirmed Critical/High release findings
- Previous QA documentation merge: PR #75
- QA branch: `qa/autonomous-release-validation`

### Baseline attempt

A local clone/sync was attempted first and failed before any repository data was downloaded:

```text
fatal: unable to access 'https://github.com/Kazaam-sudo/CallQuanta.git/': Could not resolve host: github.com
```

The baseline was therefore resolved using the connected GitHub API. Local `HEAD == origin/main` could not be independently asserted.

## Environment

No secret values were accessed or printed.

| Setting | Expected | Evidence available | Result |
|---|---|---|---|
| `APP_ENV` | `production` | Live environment unavailable | BLOCKED |
| `STT_MODE` | `faster_whisper` | Source supports and production guard rejects placeholder | PARTIAL |
| `FASTER_WHISPER_MODEL` | Explicit model | Live value unavailable | BLOCKED |
| `FASTER_WHISPER_DEVICE` | `cpu` | Source default is `cpu`; live value unavailable | PARTIAL |
| `FASTER_WHISPER_COMPUTE_TYPE` | `int8` | Source default is `int8`; live value unavailable | PARTIAL |
| `QA_MODE` | `llm` | Production guard rejects placeholder; live value unavailable | PARTIAL |
| `DEMO_CALL_LIMIT` | Configured | Source/Compose support present; live value unavailable | PARTIAL |
| `SESSION_SECRET` | Strong | Length unavailable | BLOCKED |
| CORS origins | Explicit gateway origins | Live value unavailable | BLOCKED |

## Totals

- **Passed: 13**
- **Failed: 0**
- **Blocked: 29**
- **Total: 42**

A blocked result is not treated as a pass. No runtime success is inferred from source code or prior user statements.

## Test matrix

| ID | Area | Test | Expected | Actual | Result | Evidence | Severity |
|---|---|---|---|---|---|---|---|
| ARQ-001 | Baseline | Resolve latest main | Exact SHA | `633816d7...` | PASS | GitHub commit API | — |
| ARQ-002 | Baseline | Latest release fixes merged | PR #76 on main | Confirmed | PASS | Merge commit | — |
| ARQ-003 | Baseline | Local main equals origin/main | Equal | Clone blocked by DNS | BLOCKED | Clone error | High |
| ARQ-004 | Build | Python compileall | Success | No checkout | BLOCKED | Environment limitation | Critical |
| ARQ-005 | Build | Frontend tests/build | Success | No checkout | BLOCKED | Environment limitation | Critical |
| ARQ-006 | Compose | Base/pilot config | Valid | No checkout/Docker access | BLOCKED | Environment limitation | Critical |
| ARQ-007 | Startup | All services healthy | Healthy/Up | Codespaces unavailable | BLOCKED | No runtime access | Critical |
| ARQ-008 | Gateway | Ports 3000/8080 and `/api/health` | HTTP 200 | Unavailable | BLOCKED | No gateway access | Critical |
| ARQ-009 | Startup | No restart loops/500/502/DNS failures | None | Unavailable | BLOCKED | No logs | Critical |
| ARQ-010 | Auth source | API is session source of truth | No cookie-presence middleware | Middleware removed | PASS | PR #74/main source | — |
| ARQ-011 | Auth source | Stale/malformed cookie policy | Stay on login | Regression tests exist | PASS | Auth test suite | — |
| ARQ-012 | Auth runtime | Public/protected routes | Correct redirects, no loop | Browser unavailable | BLOCKED | No browser | Critical |
| ARQ-013 | Auth runtime | Invalid/valid login/session/logout | Correct lifecycle | Credentials/browser unavailable | BLOCKED | No runtime | Critical |
| ARQ-014 | Roles | Admin/manager/supervisor/agent/viewer | Correct permissions | Credentials/runtime unavailable | BLOCKED | No runtime | Critical |
| ARQ-015 | Access tampering | Cross-team/audio/settings/export | Denied | Runtime unavailable | BLOCKED | No runtime | Critical |
| ARQ-016 | UI | RU/EN route review | Complete/localized | Browser unavailable | BLOCKED | No screenshots | High |
| ARQ-017 | UI | Desktop/tablet/mobile | No layout/accessibility breakage | Browser unavailable | BLOCKED | No browser | High |
| ARQ-018 | STT source | Local faster-whisper implementation | Real provider path exists | Confirmed | PASS | STT worker source | — |
| ARQ-019 | Worker guard | Placeholder disabled in protected env | Fail closed | Confirmed | PASS | Validation script/tests | — |
| ARQ-020 | Valid flow | Upload through final export | Complete | Runtime/audio unavailable | BLOCKED | No runtime | Critical |
| ARQ-021 | Real LLM | Real configured provider | Real result | Credentials unavailable | BLOCKED | No provider evidence | Critical |
| ARQ-022 | Invalid inputs | Audio/transcript edge matrix | Safe errors/no scores | Runtime unavailable | BLOCKED | No runtime | High |
| ARQ-023 | Demo quota source | Atomic admission | No over-limit race | Redis Lua reservation merged | PASS | `packages/demo_quota.py` | — |
| ARQ-024 | Demo quota tests | Capacity/idempotency/release | Pass | Regression tests merged | PASS | `test_release_critical_hardening.py` | — |
| ARQ-025 | Demo quota runtime | Concurrent exactly/over limit | Never exceed | Not executed | BLOCKED | No runtime | Critical |
| ARQ-026 | Queue source | Processing queue/recovery/DLQ | Durable bounded processing | Merged | PASS | `packages/reliable_queue.py` | — |
| ARQ-027 | Queue tests | Duplicate/retry/recovery | Pass | Regression tests merged | PASS | Unit tests | — |
| ARQ-028 | Queue runtime | Worker kill/Redis restart/stale delivery | Recover safely | Not executed | BLOCKED | No runtime | Critical |
| ARQ-029 | LLM failure source | Malformed output not success | Technical failure | Fallback success rejected | PASS | QA release worker | — |
| ARQ-030 | LLM failure runtime | Malformed JSON/provider timeout | Retry then failed/DLQ | Not executed | BLOCKED | No provider/runtime | High |
| ARQ-031 | Export source | Formula injection protection | Literal text | Central sanitizer merged | PASS | Spreadsheet safety module | — |
| ARQ-032 | Export tests | Dangerous prefixes/Unicode | Pass | Regression tests merged | PASS | Unit tests | — |
| ARQ-033 | Export runtime | CSV/XLSX complete fields | Correct samples | Not executed | BLOCKED | No runtime | High |
| ARQ-034 | Settings | All settings save/validate/mask | Correct | Runtime unavailable | BLOCKED | No runtime | High |
| ARQ-035 | Persistence | DB/uploads/Redis through restart | Persist | Runtime unavailable | BLOCKED | No runtime | High |
| ARQ-036 | Reliability | API/Postgres/Redis reconnect | Recover | Runtime unavailable | BLOCKED | No runtime | Critical |
| ARQ-037 | Reliability | Missing audio/partial failure | Visible terminal state | Runtime unavailable | BLOCKED | No runtime | High |
| ARQ-038 | Logs | Traceback/error/500/502 audit | No unexplained defects | Logs unavailable | BLOCKED | No logs | Critical |
| ARQ-039 | Security logs | No secrets/raw LLM output | No leakage | Runtime unavailable | BLOCKED | No logs | High |
| ARQ-040 | CI source | Regression suite wired | Runs on PR | Workflow contains unittest discovery | PASS | Workflow source | — |
| ARQ-041 | Scope | No broad UI redesign in #76 | Targeted only | Confirmed | PASS | PR diff | — |
| ARQ-042 | Release evidence | Production-like E2E evidence attached | Complete | Missing | BLOCKED | No Codespaces evidence | Critical |

## Passed evidence

The following release-risk remediations are present on current `main`:

1. API-backed authentication with no independent cookie-presence middleware redirect.
2. Static stale/malformed-cookie regression coverage.
3. Production placeholder-mode guards.
4. Atomic Redis demo quota reservation and call-id idempotency.
5. Reliable queue envelopes with job ID, attempts and idempotency key.
6. Processing queues, startup recovery, bounded retries and dead-letter queues.
7. Malformed LLM output rejected from the normal success path.
8. Spreadsheet formula-prefix sanitization for CSV/XLSX.
9. Regression tests for quota, queue, LLM failure wiring and spreadsheet safety.

## Failed checks

No new product defect was marked failed because no live test produced a reproducible failure. This is not equivalent to release readiness: 29 essential checks remain blocked.

## Critical findings

### Critical process blocker — production-like end-to-end validation is absent

The application cannot be declared ready without observing the current merged code in the actual Codespaces production-like environment. Authentication, worker startup, real faster-whisper, real LLM, concurrent quota and restart recovery remain unproven on this baseline.

## High findings

### High — runtime durability claims remain unproven

PR #76 introduces processing lists, recovery and DLQ semantics, but worker termination, Redis restart and duplicate delivery were not exercised against a live stack.

### High — export and localization behavior remain unproven in the browser

Source-level export sanitization is present, but downloadable CSV/XLSX samples and responsive RU/EN screens were not inspected.

## Fixes applied in this QA phase

**None.**

No new small Critical/High product defect was proven in the available environment. Making additional production changes without runtime evidence would violate the test-first scope.

## Exact remaining human-only checks

These require access to the owner's Codespaces instance, credentials or browser and cannot be performed from this execution environment:

1. Confirm sanitized environment lengths/origins and live modes.
2. Build and start the exact Compose stack.
3. Verify all service health, restart counts and gateway responses.
4. Complete browser authentication, second-tab, stale-cookie and logout/back tests.
5. Create temporary role users and execute the full authorization/tampering matrix.
6. Capture RU/EN screenshots at desktop, tablet and mobile widths.
7. Run an approved audio through local faster-whisper and the real configured LLM.
8. Execute invalid/corrupt/duplicate/missing-audio cases.
9. Run concurrent quota requests at and over the limit.
10. Kill workers during processing; restart Redis, API and Postgres.
11. Download and inspect CSV/XLSX exports, including formula payloads.
12. Review two hours of combined logs for errors, retries and leakage.

## Recommended release decision

Keep the candidate at **NOT READY** until the blocked critical runtime matrix is completed on the exact merged baseline. If startup, authentication, one real call, concurrent quota and restart recovery all pass, reassess for **READY FOR INVITE-ONLY PILOT** before considering a public demo.
