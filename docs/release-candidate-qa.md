# Release-candidate QA

## Release verdict

**NOT READY**

The repository baseline is current and the latest authentication architecture removes the known split-brain middleware redirect. However, this audit runtime could not clone GitHub or access the user's live Codespaces environment, so the required production-like browser, worker, role, real-provider, storage, export and resilience scenarios could not be executed. In addition, previously identified source-level release blockers remain present on the current baseline, most importantly the non-atomic demo quota and missing durable/idempotent queue semantics.

## 1. Baseline

- Repository: `Kazaam-sudo/CallQuanta`
- Baseline SHA: `714102a6b5a6f3477e723e59b0888a947b4077f5`
- Latest merged PR: **#74 — Remove split-brain session middleware redirect loop**
- Branch created for QA artifacts: `qa/release-candidate-validation`
- Local `main == origin/main`: **BLOCKED**. The execution runtime could not resolve `github.com`, so a local checkout/fetch was impossible. Baseline was resolved from the GitHub API.

### Environment limitations

- No access to the user's running Codespaces instance or its forwarded HTTPS port 8080.
- No safe access to `.env`, admin credentials, test-user credentials, provider keys or approved audio.
- Local runtime DNS could not resolve `github.com`; Docker build/start commands could not be executed against a checkout.
- GitHub API/source inspection was available.
- No secret values were read or printed.

## 2. Configuration assessment

The requested live-value checks were blocked because the environment file and running containers were unavailable. Source defaults and documented expectations were inspected only.

| Variable | Expected | Actual | Result |
|---|---|---|---|
| `APP_ENV` | `production` | Live value unavailable | BLOCKED |
| `STT_MODE` | `faster_whisper` | Live value unavailable | BLOCKED |
| `FASTER_WHISPER_MODEL` | Explicit model | Live value unavailable | BLOCKED |
| `FASTER_WHISPER_DEVICE` | Explicit device | Live value unavailable | BLOCKED |
| `FASTER_WHISPER_COMPUTE_TYPE` | Explicit compute type | Live value unavailable | BLOCKED |
| `QA_MODE` | `llm` | Live value unavailable | BLOCKED |
| `DEMO_CALL_LIMIT` | Explicit | Live value unavailable | BLOCKED |
| `CORS_ORIGINS` | Explicit Codespaces HTTPS origin | Live value unavailable | BLOCKED |
| `SESSION_SECRET` | Strong; length only | Not accessed | BLOCKED |
| `ADMIN_PASSWORD` | Strong; length only | Not accessed | BLOCKED |

## 3. Test totals

- **Passed: 9**
- **Failed: 5**
- **Blocked: 25**
- **Total recorded scenarios: 39**

`FAILED` includes source-confirmed unresolved release risks, not only runtime assertion failures. `BLOCKED` means the required live evidence could not be produced in this audit environment.

## 4. Test matrix

| ID | Area | Test | Expected | Actual | Result | Evidence | Severity |
|---|---|---|---|---|---|---|---|
| RC-001 | Baseline | Resolve latest `main` | Exact current SHA | `714102a6...` | PASS | GitHub commit API | — |
| RC-002 | Baseline | Identify latest merged PR | Latest merge known | PR #74 | PASS | Merge commit message | — |
| RC-003 | Baseline | Local main equals origin/main | SHAs identical | Local clone unavailable due DNS | BLOCKED | `Could not resolve host: github.com` | Medium |
| RC-004 | Auth architecture | No Next middleware cookie-presence auth | API is sole validity source | `apps/web/middleware.ts` removed by PR #74 | PASS | Baseline merge diff | — |
| RC-005 | Auth policy | Login redirect requires API-validated user | Cookie presence alone insufficient | Policy helper requires authenticated + validated user | PASS | `auth-policy.mjs` / tests | — |
| RC-006 | Auth tests | Stale/malformed cookie policy coverage | Remain on login | Static tests present | PASS | `apps/web/tests/auth-flow.test.mjs` | — |
| RC-007 | Cookie contract | Login and logout cookie name/path match | Same name and `/` path | Source uses `SESSION_COOKIE_NAME`, path `/` | PASS | API source | — |
| RC-008 | Worker safety | Placeholder AI blocked in production | Fail closed | Worker validator exists for QA/STT | PASS | `validate_worker_mode.py` | — |
| RC-009 | Storage | Redis persistence configured | AOF + persistent volume | Present in Compose from hardening baseline | PASS | Compose source | — |
| RC-010 | Network exposure | Service ports bind locally by default | No broad host exposure | Present in Compose from hardening baseline | PASS | Compose source | — |
| RC-011 | Build | Python compileall | Success | Checkout unavailable | BLOCKED | Runtime DNS limitation | High |
| RC-012 | Build | `pnpm test` | Success | Checkout unavailable | BLOCKED | Runtime DNS limitation | High |
| RC-013 | Build | Next production build | Success | Checkout unavailable | BLOCKED | Runtime DNS limitation | High |
| RC-014 | Compose | Base config renders | Success | Checkout unavailable | BLOCKED | Runtime DNS limitation | High |
| RC-015 | Compose | Pilot config renders | Success | Checkout unavailable | BLOCKED | Runtime DNS limitation | High |
| RC-016 | Startup | Dependency-safe startup | All required services Up/healthy | Live Codespaces unavailable | BLOCKED | No runtime access | Critical |
| RC-017 | Gateway | `/` and `/api/health` through 8080 | HTTP 200 | Live gateway unavailable | BLOCKED | No runtime access | Critical |
| RC-018 | Workers | STT/QA workers stable | No restart loop | Live containers unavailable | BLOCKED | No runtime access | Critical |
| RC-019 | Auth | Public homepage unauthenticated | Renders immediately | Browser unavailable | BLOCKED | No browser access | Critical |
| RC-020 | Auth | Login form and next routes | Stable form, preserved next | Browser unavailable | BLOCKED | No browser access | Critical |
| RC-021 | Auth | Protected redirect once | One login redirect, no loop | Browser unavailable | BLOCKED | No browser access | Critical |
| RC-022 | Auth | Invalid/correct login | Error / successful session | Credentials and browser unavailable | BLOCKED | No runtime access | Critical |
| RC-023 | Auth | Refresh, second tab, logout, back | Stable session lifecycle | Browser unavailable | BLOCKED | No browser access | High |
| RC-024 | Roles | Admin/manager/supervisor/agent/viewer matrix | Correct authorization | Credentials/runtime unavailable | BLOCKED | No runtime access | Critical |
| RC-025 | ID tampering | Cross-team call/audio/settings access | Denied | Runtime unavailable | BLOCKED | No runtime access | Critical |
| RC-026 | Localization | RU/EN complete route review | No mixed/raw keys/layout issues | Browser unavailable | BLOCKED | No browser access | High |
| RC-027 | Responsive UI | Desktop/tablet/mobile | No overflow/breakage | Browser unavailable | BLOCKED | No browser access | Medium |
| RC-028 | Real call flow | Approved audio → real STT + real LLM QA | Complete real-provider result | Audio, provider credentials and runtime unavailable | BLOCKED | No real-provider evidence | Critical |
| RC-029 | Invalid data | Invalid transcript/audio matrix | Safe blocked states and retries | Runtime unavailable | BLOCKED | No runtime access | High |
| RC-030 | Demo quota | Atomic reservation under concurrent work | Never exceed configured limit | Current design counts completed reviews and does not reserve capacity transactionally | FAIL | Source-level architecture unchanged since pre-launch audit | Critical |
| RC-031 | Demo quota | Retry/batch/failed-job accounting | Deterministic and non-duplicative | Not executable; architecture has no atomic usage ledger | FAIL | Source inspection / prior audit continuity | Critical |
| RC-032 | Queue reliability | Duplicate/stale queue messages | Idempotent processing | Jobs remain primarily call-ID based; no durable job identity/revision reservation confirmed | FAIL | Source-level architecture unchanged | High |
| RC-033 | Queue reliability | Redis loss/restart recovery | Lease/retry/DLQ/reconciliation | Redis list workers do not provide durable lease/DLQ semantics | FAIL | Source-level architecture | High |
| RC-034 | QA error handling | Malformed LLM response | Technical failure, not normal zero-score review | Previously identified fallback-to-success risk not shown as resolved by PRs #72–#74 | FAIL | No relevant implementation change in latest merges | High |
| RC-035 | Settings | All pages save/validate/mask/restrict | No 500, correct masking | Runtime unavailable | BLOCKED | No runtime access | High |
| RC-036 | Exports | CSV/XLSX content correctness | Correct Unicode/current review/nulls | Runtime unavailable | BLOCKED | No runtime access | High |
| RC-037 | Exports | Formula injection protection | Dangerous prefixes escaped | No confirmed sanitizer in current source | FAIL | Previously identified unresolved source risk | High |
| RC-038 | Persistence | DB/uploads/Redis through restarts | Data persists, no orphans | Runtime unavailable | BLOCKED | No runtime access | High |
| RC-039 | Log review | Two-hour full-stack log audit | No unexpected errors/leaks/reprocessing | Live logs unavailable | BLOCKED | No runtime access | Critical |

## 5. Passed checks

1. Baseline and latest merged PR were resolved from GitHub.
2. PR #74 removed the cookie-presence Next middleware responsible for split-brain authentication.
3. Login redirect policy now requires an API-validated authenticated user.
4. Static auth regression tests include stale and malformed cookie cases.
5. API login/logout use the same session cookie name and root path.
6. Production worker-mode guard exists for placeholder STT/QA modes.
7. Redis persistence hardening is present in the current baseline.
8. Host-bound service ports are present in the current baseline.
9. QA artifacts were isolated on a documentation-only branch.

## 6. Failed checks and confirmed findings

### Critical — demo quota remains non-atomic

The quota is derived from completed successful QA reviews. API checks, queueing and worker execution are separate. There is no confirmed transactional reservation or usage ledger covering queued/in-flight work. Concurrent single, batch or retry submissions can therefore race past the limit.

### High — queue work is not reliably idempotent/durable

Queue messages remain insufficiently versioned for strong idempotency. No confirmed job ID + transcript revision contract, lease, attempt ledger, dead-letter queue or stale-job reconciliation was found.

### High — malformed LLM output may be represented as normal analysis

The previously identified fallback path that can turn parse/provider failure into a stored normal review was not touched by the recent auth-only merges. It requires explicit runtime and source remediation verification.

### High — spreadsheet formula injection is not confirmed mitigated

Exports containing untrusted user/call/transcript strings require escaping cells starting with `=`, `+`, `-` or `@`. No confirmed central export sanitizer was found.

## 7. Blocked checks

All production-like manual scenarios were blocked by lack of access to the user's Codespaces environment, credentials, approved audio and container logs. This includes authentication end-to-end evidence, role authorization, localization, real STT/LLM processing, invalid inputs, settings, exports, persistence and resilience.

## 8. Real-provider evidence

**No real-provider success is claimed.**

The audit could not observe local faster-whisper model loading, transcription output, LLM provider requests, QA reasoning/evidence, processing times or worker logs.

## 9. Authentication evidence

Source evidence confirms that PR #74 removed Next middleware authentication based solely on cookie presence. Static tests cover missing, malformed and stale cookies. Live gateway evidence remains blocked.

## 10. Worker evidence

Source evidence confirms protected-environment placeholder guards and Compose worker definitions. No runtime restart count, Redis reconnect, model-load or provider-failure evidence was available.

## 11. Demo quota evidence

The previously deferred critical quota race remains the principal release blocker. Concurrency safety was not tested and is not claimed.

## 12. Browser and route evidence

No screenshots, HAR, browser console output or live HTTP route traces were available in this audit runtime.

## 13. Recommended implementation order

1. Implement transactional demo-capacity reservation with a durable usage ledger keyed by call and transcript/review revision.
2. Introduce durable idempotent jobs: job ID, revision, attempts, lease/ack, backoff, DLQ and stale-job reconciliation.
3. Separate provider/parse failures from successful QA reviews; never persist fallback technical failure as a normal score.
4. Add centralized CSV/XLSX formula-injection escaping.
5. Execute the full production-like Codespaces matrix from this document and attach HTTP traces, screenshots, worker logs and export samples.
6. Only then reassess for **READY FOR INVITE-ONLY PILOT**; public demo should require concurrency and abuse/rate-limit evidence.
