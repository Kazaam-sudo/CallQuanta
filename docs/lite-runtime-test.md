# CallQuanta Lite runtime test

This is the exact order for the first local runtime test. It separates the
pipeline smoke test from the Telegram test and keeps external LLM calls off.

On the prepared Mac, Docker CLI/Compose and Colima run from Homebrew. Colima
state and its Docker context are isolated under
`/private/tmp/callquanta-lite-runtime`, so prefix Compose commands with
`DOCKER_CONFIG=/private/tmp/callquanta-lite-runtime/docker-config` and use the
standalone `docker-compose` command.

## 0. What is required

- Docker Desktop/Engine with Compose support.
- A local `.env` copied from `.env.example`.
- A generated internal `LITE_SERVICE_TOKEN` shared by API and bot.
- A dedicated positive `LITE_RUNTIME_TEST_USER_ID` for the smoke test. Do not
  use a real user's Telegram ID.
- A Telegram BotFather token only for the later Telegram test.

Do not put any token into chat or commit `.env`.

## 1. Prepare local configuration

```text
cp .env.example .env
python3 -c 'import secrets; print(secrets.token_urlsafe(32))'
```

Put the generated value into `.env` as `LITE_SERVICE_TOKEN`. Keep the first
runtime pass in this mode:

```text
APP_ENV=development
REQUIRE_AUTH=true
STT_MODE=faster_whisper
FASTER_WHISPER_MODEL=base
QA_MODE=placeholder
LLM_EXTERNAL_ENABLED=false
TELEGRAM_BOT_ENABLED=false
LITE_FREE_ANALYSES=3
LITE_MAX_UPLOAD_BYTES=18874368
LITE_MAX_DURATION_SECONDS=1200
LITE_RETENTION_DAYS=30
```

Run the read-only preflight:

```text
python3 scripts/lite_runtime_preflight.py --env-file .env
```

It must report `LITE RUNTIME PREFLIGHT: PASS`. A warning about placeholder
output is expected for this wiring test.

## 2. Start the local pipeline

```text
DOCKER_CONFIG=/private/tmp/callquanta-lite-runtime/docker-config docker-compose up -d postgres redis
DOCKER_CONFIG=/private/tmp/callquanta-lite-runtime/docker-config docker-compose up -d --no-deps --build api stt-worker qa-worker
DOCKER_CONFIG=/private/tmp/callquanta-lite-runtime/docker-config docker-compose ps
```

Postgres, Redis, and API must report healthy and both workers must be running.
The API must respond on `http://127.0.0.1:8000/health/ready`. Ollama is not
started in this pass because the external LLM is disabled and QA uses the
placeholder mode.

## 3. Run the API/queue smoke test

Export the same service token from the local `.env` without printing it, then
run the standard-library smoke test with a dedicated test ID:

```text
set -a
source .env
set +a
LITE_RUNTIME_TEST_USER_ID=900000001 python3 scripts/lite_runtime_smoke.py --cleanup
```

Expected checkpoints:

```text
PASS missing service token -> 401
PASS authorized cleanup -> ...
PASS Lite job accepted -> job_id=...
STATUS job=...: analysis_pending
PASS report returned
PASS test data cleanup -> ... jobs removed
```

Create a short synthetic Russian speech sample locally, then pass it to the
smoke script. The built-in macOS voice and local faster-whisper model keep the
audio synthetic and avoid paid STT/LLM calls:

```text
say -v Milena -o /private/tmp/callquanta-lite-runtime/sample.aiff "Здравствуйте. Меня интересует тариф для небольшой компании. Подскажите, пожалуйста, сколько стоит подключение и когда можно начать работу? Я отправлю документы сегодня, а вы перезвоните мне завтра после обеда."
ffmpeg -y -i /private/tmp/callquanta-lite-runtime/sample.aiff -ac 1 -ar 16000 /private/tmp/callquanta-lite-runtime/sample.wav
```

Then run:

```text
LITE_RUNTIME_TEST_USER_ID=900000001 python3 scripts/lite_runtime_smoke.py --env-file .env --audio-file /private/tmp/callquanta-lite-runtime/sample.wav --cleanup --max-wait 600
```

The first faster-whisper run may download its model. The smoke test verifies
authentication, upload, Redis queueing, real local speech recognition,
automatic QA enqueue, report persistence, polling, and cleanup. QA remains in
placeholder mode, so the report is synthetic and does not validate LLM quality.

## 4. Run the Telegram test

Only after step 3 passes, add these values to `.env`:

```text
TELEGRAM_BOT_ENABLED=true
TELEGRAM_BOT_TOKEN=<BotFather token, entered locally>
```

Run preflight again, then start only the bot profile:

```text
python3 scripts/lite_runtime_preflight.py --env-file .env
DOCKER_CONFIG=/private/tmp/callquanta-lite-runtime/docker-config docker-compose --profile lite-bot up -d --build lite-bot
DOCKER_CONFIG=/private/tmp/callquanta-lite-runtime/docker-config docker-compose logs -f lite-bot
```

From one controlled Telegram account, check:

1. `/start` returns the limits and privacy wording.
2. One short voice message is accepted.
3. The final report arrives automatically.
4. Sending the same update again does not create a second job.
5. `/delete` removes server-side Lite data; Telegram chat history remains in
   Telegram and the quota ledger is intentionally preserved.

If Telegram reports a conflict for `getUpdates`, a webhook is configured for
the bot. Clear it explicitly in the Telegram administration flow before
retrying; the application does not remove webhooks automatically.

## 5. Real provider test

Do not enable a real external provider until the placeholder path passes. Then
use one bounded call with the configured daily limit, record latency and output
token usage, and compare the report with a human review. The exact cost per
analysis is not yet confirmed and must not be quoted to testers beforehand.
