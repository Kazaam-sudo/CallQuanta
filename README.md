# CallQuanta

CallQuanta is an open-source, self-hosted AI quality assurance platform for contact centers. It transcribes calls, analyzes conversations, scores agents against customizable QA scorecards, detects script/compliance issues, and sends actionable coaching insights to managers.

## License

AGPL-3.0.

## MVP Flow (v0.3.0)

Upload call → queue transcription job → STT worker transcribes (placeholder or faster-whisper) → analyze → score → show evidence → notify.

## Product Positioning

- Open-source and self-hosted first.
- Modular provider-based architecture.
- Supports local open-source LLMs through OpenAI-compatible endpoints.
- Supports multiple STT providers (v0.1 includes faster-whisper stub).
- TTS interface placeholder included for future coaching experiences.
- Static i18n files (`en`, `ru`) for interface localization.

## Repository Structure

- `apps/api` - FastAPI backend.
- `apps/web` - Next.js frontend.
- `workers/stt-worker` - STT queue consumer.
- `workers/qa-worker` - QA analysis queue consumer.
- `packages/provider-sdk` - Provider interfaces and stubs.
- `packages/scorecards` - Scorecard templates.
- `packages/prompts` - Prompt templates.
- `docs` - Architecture and operations docs.
- `examples` - Example assets for local testing.


## STT Modes (v0.4.0)

CallQuanta supports two STT worker modes controlled by `STT_MODE`:

- `placeholder` (default): writes deterministic placeholder transcript segments. Recommended for CI and lightweight local usage.
- `faster_whisper`: runs real local speech-to-text with faster-whisper against the uploaded audio file path stored on the call (`call.stored_path`).

Example `.env` settings:

```env
STT_MODE=placeholder
FASTER_WHISPER_MODEL=base
FASTER_WHISPER_DEVICE=cpu
FASTER_WHISPER_COMPUTE_TYPE=int8
```

To enable real STT locally, set:

```env
STT_MODE=faster_whisper
```

Note: the first transcription in `faster_whisper` mode may take longer because the model may need to be downloaded and initialized.

## Local Development (v0.1.1 baseline)

1. Copy env file:
   ```bash
   cp .env.example .env
   ```
2. Build and start the full local stack:
   ```bash
   docker compose up --build
   ```
3. Verify endpoints:
   - API health: `http://localhost:8000/health`
   - Web UI: `http://localhost:3000`

Services started by Compose:
- `postgres`
- `redis`
- `ollama`
- `api`
- `web`
- `stt-worker` (placeholder mode by default; optional faster-whisper mode)
- `qa-worker` (placeholder loop)

### Troubleshooting

- **`env file .env not found`**: run `cp .env.example .env` from repository root.
- **Web build fails on first run**: re-run `docker compose up --build` to refresh node modules/build cache.
- **Port already in use**: update `API_PORT` / `WEB_PORT` in `.env` and restart compose.
- **API unavailable at startup**: wait for `CallQuanta API started` in logs, then retry `/health`.
- **Ollama image pull is slow**: first boot may take longer because the container image is large.
- **`No module named '...'` in `stt-worker` (faster-whisper mode)**: rebuild the worker image so updated Python dependencies are installed: `docker compose build stt-worker && docker compose up -d stt-worker`.


## Manual testing in Codespaces

1. Create a GitHub Codespace for this repository.
2. Copy env file:
   ```bash
   cp .env.example .env
   ```
3. Build and start the full stack:
   ```bash
   docker compose up --build
   ```
4. Open the forwarded port `3000` in the browser.
5. In the web UI, upload a file and click **Transcribe** on the call details page.

## Architecture Overview

- API manages calls, metadata, provider configs, and orchestration endpoints.
- STT worker handles transcription jobs via provider abstraction.
- QA worker handles analysis and scoring using LLM provider abstraction.
- PostgreSQL stores call records, transcript segments, reviews, and findings.
- Redis acts as queue + cache backbone.
- Ollama is the default local LLM runtime, consumed through OpenAI-compatible API.

## Roadmap

- v0.1: Skeleton + provider abstractions + end-to-end stubs.
- v0.2: Real queue execution and DB-backed CRUD.
- v0.3: Scorecard editor + evidence viewer + notifications.
- v0.4: Integrations and richer analytics.


## v0.4.0 Notes

- `POST /calls/{id}/transcribe` marks the call as `transcription_pending` and enqueues a Redis transcription job.
- `workers/stt-worker` now supports `STT_MODE=placeholder` (default) and `STT_MODE=faster_whisper` for real local STT.
- In faster-whisper mode, the worker lazily loads the model once per process and reuses it for later jobs.
- On worker errors, the call status is updated to `failed`.
- `GET /calls/{id}/transcript` returns transcript segments ordered by start time.
