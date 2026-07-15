# Autonomous release QA

This is the repeatable release gate for CallQuanta. Run it from the repository
root on the candidate branch. It never prints environment values, writes `.env`,
removes volumes, runs `down`, or starts/restarts services by default.

## Safe default gate

```bash
./scripts/release-check.sh
```

The default gate validates environment and worker modes, available Python checks,
the deterministic non-speech WAV fixture, transcript validation, frontend unit
tests/build, and non-interpolated Compose files. It writes only the generated
`.release-check/synthetic-tone.wav`, which is ignored by Git.

`BLOCKED` means a prerequisite is absent; `FAIL` means an executed check failed.
The command returns non-zero only for failures.

## Compose validation without exposing secrets

The following satisfy the full Compose parse check while discarding rendered
output rather than displaying interpolated values:

```bash
docker compose config | wc -c
docker compose -f docker-compose.yml -f docker-compose.pilot.yml config | wc -c
```

The release script itself uses `config --no-interpolate` and discards its output.

## Existing live stack checks

Do not use this gate to create a stack. First start and verify the intended
candidate by the normal deployment procedure. Then supply disposable credentials
through the process environment (never the command line or a checked-in file):

```bash
export RELEASE_CHECK_ADMIN_EMAIL='...'
export RELEASE_CHECK_ADMIN_PASSWORD='...'
RELEASE_CHECK_RUN_LIVE=true ./scripts/release-check.sh
```

Live mode only inspects already-running services, performs HTTP/auth/export
checks, and attempts Playwright. It does not run `docker compose up`, `restart`,
`down`, or volume commands. The optional role and Redis-quota probes mutate
disposable test state, so both require explicit acknowledgement:

```bash
RELEASE_CHECK_RUN_LIVE=true RELEASE_CHECK_ALLOW_MUTATIONS=true ./scripts/release-check.sh
```

The authenticated API helper reads only `RELEASE_CHECK_ADMIN_EMAIL` and
`RELEASE_CHECK_ADMIN_PASSWORD`; it does not read `.env` and never reports either
value. Playwright uses the analogous `PLAYWRIGHT_ADMIN_EMAIL` and
`PLAYWRIGHT_ADMIN_PASSWORD` variables. The generated Playwright reports and
traces are ignored.

## Required release evidence

- Current candidate images are running, rather than stale images from an earlier
  checkout.
- Static checks pass, with any blocked dependency explicitly resolved.
- Public browser smoke passes; authenticated smoke passes with approved
  disposable credentials.
- A real approved recording completes the STT and configured-LLM path.
- The mutable quota/role checks run only against disposable data, and results are
  recorded without credentials or raw customer content.

## Recovery execution — 2026-07-15 UTC

On `agent/release-polish-recovery` before committing the recovery changes:

- `python3 -m compileall apps/api workers packages scripts` passed.
- Fixture and transcript wrapper tests passed; the fixture now checks identical
  output across two writes.
- `apps/web`: 2 unit tests passed and production build passed.
- Both full Compose configurations parsed; rendered output was not displayed.
- The host Python environment lacks SQLAlchemy, Redis, and pytest, so full API,
  hardening, and worker pytest suites are blocked there.
- Existing Compose services were up and API/Postgres/Redis were healthy.
- Playwright did run, but the existing web container predates this branch's label
  fix. Its rendered login fields had no associated labels, so candidate browser
  evidence is blocked until candidate images are deployed.
