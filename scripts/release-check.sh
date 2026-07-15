#!/usr/bin/env bash
# Repeatable, secret-safe release candidate validation. See docs/autonomous-release-qa.md.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
BASE_COMPOSE=(docker compose -f docker-compose.yml)
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.pilot.yml)
passed=0; failed=0; blocked=0

pass() { printf 'PASS %s\n' "$1"; ((passed+=1)); }
fail() { printf 'FAIL %s\n' "$1"; ((failed+=1)); }
block() { printf 'BLOCKED %s\n' "$1"; ((blocked+=1)); }
run() { local label="$1"; shift; if "$@"; then pass "$label"; else fail "$label"; fi; }

wait_for() {
  local label="$1" url="$2"; local code=""
  for _ in $(seq 1 30); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || true)"
    [[ "$code" == "200" ]] && { pass "$label"; return 0; }
    sleep 2
  done
  fail "$label (last HTTP ${code:-000})"
  return 1
}

echo '== Release candidate checks =='
run 'safe environment validation' python3 scripts/validate_api_environment.py
run 'QA worker mode validation' python3 scripts/validate_worker_mode.py qa
run 'STT worker mode validation' python3 scripts/validate_worker_mode.py stt
if python3 -c 'import sqlalchemy' >/dev/null 2>&1; then
  run 'Python API tests' python3 -m unittest discover -s apps/api/tests
else
  block 'Python API tests (SQLAlchemy is not installed in this Python environment)'
fi
if python3 -c 'import redis' >/dev/null 2>&1; then
  run 'release-hardening tests' python3 scripts/test_release_critical_hardening.py
else
  block 'release-hardening tests (redis is not installed in this Python environment)'
fi
run 'environment validator tests' python3 scripts/test_validate_api_environment.py
run 'worker-mode validator tests' python3 scripts/test_validate_worker_mode.py
run 'synthetic audio fixture tests' python3 scripts/test_synthetic_audio_fixture.py
run 'generate synthetic audio fixture' python3 scripts/synthetic_audio_fixture.py
run 'valid and invalid transcript validation' python3 scripts/test_transcript_validation.py
if python3 -c 'import pytest' >/dev/null 2>&1; then
  if python3 -m pytest workers/qa-worker/tests workers/stt-worker/tests -q; then
    pass 'worker Python tests'
  else
    fail 'worker Python tests'
  fi
else
  block 'worker Python tests (pytest is not installed)'
fi

run 'frontend unit tests' bash -lc 'cd apps/web && pnpm test'
run 'frontend production build' bash -lc 'cd apps/web && pnpm run build'
if "${BASE_COMPOSE[@]}" config --no-interpolate >/dev/null; then pass 'base Compose validation without interpolation'; else fail 'base Compose validation without interpolation'; fi
if "${COMPOSE[@]}" config --no-interpolate >/dev/null; then pass 'pilot Compose validation without interpolation'; else fail 'pilot Compose validation without interpolation'; fi

if [[ "${RELEASE_CHECK_BUILD_IMAGES:-false}" == "true" ]]; then
  run 'exact workspace image build' "${COMPOSE[@]}" build api web recording-worker stt-worker qa-worker
else
  block 'image rebuild disabled (set RELEASE_CHECK_BUILD_IMAGES=true)'
fi
if [[ "${RELEASE_CHECK_RUN_LIVE:-false}" != "true" ]]; then
  block 'live checks disabled (set RELEASE_CHECK_RUN_LIVE=true; this script never starts or restarts services)'
else
  if "${COMPOSE[@]}" ps --status running | grep -Eq 'api|web'; then
    pass 'required live services are running'
    wait_for 'API health' 'http://localhost:8080/api/health'
    wait_for 'web health' 'http://localhost:3000/'
    if python3 scripts/release_runtime_checks.py; then pass 'authenticated API release checks'; else
      code=$?; [[ "$code" == 10 ]] && block 'authenticated API release checks' || fail 'authenticated API release checks'
    fi
    if [[ -d apps/web/node_modules/@playwright/test ]]; then
      if bash -lc 'cd apps/web && pnpm test:e2e' >/dev/null 2>&1; then
        pass 'Playwright browser smoke'
      else
        block 'Playwright browser smoke (browser runtime, credentials, or stack unavailable)'
      fi
    else
      block 'Playwright browser smoke (install frontend dev dependencies and Chromium)'
    fi
  else
    block 'live checks (required services are not running)'
  fi

  if [[ "${RELEASE_CHECK_ALLOW_MUTATIONS:-false}" == "true" ]]; then
    quota_result="$("${COMPOSE[@]}" exec -T api python -c "import concurrent.futures, redis; from packages.demo_quota import reserve_demo_call, reserved_demo_calls; client=redis.Redis.from_url('redis://redis:6379/0'); ids=list(range(-920005,-920000)); active=reserved_demo_calls(client); results=[] if active else list(concurrent.futures.ThreadPoolExecutor(max_workers=5).map(lambda call_id: reserve_demo_call(client, call_id=call_id, limit=50, completed_count=49), ids)); accepted=sum(item[0] for item in results); retry=reserve_demo_call(client, call_id=ids[results.index((True, False))], limit=50, completed_count=49) if (True, False) in results else (False, False); print(active, accepted, len(results)-accepted, retry[0], retry[1])" 2>/dev/null || true)"
    "${COMPOSE[@]}" exec -T redis redis-cli SREM demo:qa:reservations -920005 -920004 -920003 -920002 -920001 >/dev/null 2>&1 || true
    if [[ "$quota_result" == "0 1 4 True True" ]]; then pass 'live demo quota concurrency and idempotency'; else block 'live demo quota concurrency (active reservations or Redis unavailable)'; fi
  else
    block 'live demo quota concurrency disabled (set RELEASE_CHECK_ALLOW_MUTATIONS=true only for disposable data)'
  fi
fi

printf '\nSUMMARY PASS=%d FAIL=%d BLOCKED=%d\n' "$passed" "$failed" "$blocked"
(( failed == 0 ))
