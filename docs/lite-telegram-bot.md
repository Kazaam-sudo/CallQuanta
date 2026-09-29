# CallQuanta Lite Telegram bot

The Lite bot is a private long-polling adapter for the existing CallQuanta
pipeline. It does not expose a public webhook or port.

## Current limits

- 3 analyses per Telegram user in the free demo (`LITE_FREE_ANALYSES=3`).
- Audio up to 18 MB and 20 minutes. The lower file limit leaves headroom below
  Telegram's bot download limit.
- The bot's temporary download is deleted after it is sent to the API.
- API-side Lite jobs, transcripts, reports, and pipeline audio expire after 30
  days. The enabled bot periodically calls the protected cleanup endpoint.
- `/delete` removes the user's Lite data from CallQuanta but does not delete
  Telegram's own chat history and does not restore the free quota.
- The minimal quota ledger is kept separately so `/delete` cannot be used to
  reset the free limit and spend provider tokens repeatedly.

## Enable locally

Copy the values into the real local `.env` without committing them:

```text
TELEGRAM_BOT_ENABLED=true
TELEGRAM_BOT_TOKEN=<token from BotFather>
LITE_SERVICE_TOKEN=<long random internal token>
LITE_FREE_ANALYSES=3
LITE_MAX_UPLOAD_BYTES=18874368
LITE_MAX_DURATION_SECONDS=1200
LITE_RETENTION_DAYS=30
```

The bot is started separately so ordinary local development remains unchanged:

```text
docker compose --profile lite-bot up --build lite-bot
```

Before enabling Telegram, verify that the API, Redis, STT worker, and QA worker
are healthy. The first real test should use one controlled audio file and one
Telegram account. No real API key or production webhook is required for the
bot wiring test; the existing placeholder STT/QA modes can verify the queue and
delivery path.

## Test order

1. Static checks and API auth check: missing/wrong service token must return
   `401`; the internal route must not accept the normal browser session.
2. Local queue smoke: send one synthetic audio file through the API and confirm
   `uploaded -> transcription -> analysis -> report`.
3. Telegram sandbox: `/start`, one voice message, duplicate update retry, and
   `/delete`.
4. Quota test: submit four small files and confirm that the fourth is rejected
   with the upgrade message while no additional worker job is queued.
5. Real provider test: only after the path works, enable one bounded external
   provider call with the configured daily limit.

The bot uses `getUpdates` long polling rather than a webhook. If Telegram says a
webhook is already configured, clear it explicitly in the bot administration
flow before starting this test; the adapter does not remove external webhooks
automatically.
