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
- **`No such file or directory: /app/uploads/...` in `stt-worker` (faster-whisper mode)**: ensure `stt-worker` mounts the `api_uploads` volume at `/app/uploads` (read-only) so worker paths match `call.stored_path`.


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


## v0.6.0 QA analysis flow (scorecard-driven)

- Added Redis-backed QA analysis pipeline: `POST /calls/{id}/analyze` enqueues a job and `qa-worker` persists QA review data.
- Added `GET /calls/{id}/qa` endpoint to fetch the latest QA review (score, summary, findings).
- Added web Analyze flow in call details with pending/failed states and QA review rendering.
- Added default scorecard file: `packages/scorecards/default_sales_qa.yaml`.
- QA analysis now evaluates calls against explicit criteria (greeting, discovery, relevance, objection handling, compliance, closing, and tone) and returns structured JSON.
- Local open-source LLM mode (`openai_compatible` with Ollama or similar) now receives both the transcript and scorecard criteria in the prompt, improving specificity and consistency.

## v0.6.2 QA robustness improvements

- Scorecard criteria are now normalized against `packages/scorecards/default_sales_qa.yaml` as the source of truth (criterion id/title/max points), even when local models return partial or malformed criterion rows.
- Total QA score is now computed from normalized criteria (`sum(score) / sum(max_points) * 100`) and stored as the review score, rather than blindly trusting the model-provided total.
- CallQuanta now attempts JSON recovery when a local model returns markdown-wrapped output, and it generates a fallback scorecard review when parsing fails.
- QA analysis now prefers resilient fallback reviews over `analysis_failed` for model-output issues; infrastructure failures (LLM unavailable, timeouts, DB issues, missing transcript) still fail analysis.
- The QA UI now shows stronger criterion evidence and warnings when a review was partially recovered from imperfect model output.

## v0.6.3 weak local model compatibility improvements

- CallQuanta now maps model-provided criterion `index` values (1-based) to scorecard criteria order for deterministic local-model compatibility.
- The app owns criterion `id`, `title`, and `max_points` from `packages/scorecards/default_sales_qa.yaml`; models only provide per-criterion scoring/comment/evidence/severity.
- `qa-worker` accepts both legacy `criteria[]` format and new `criteria_scores[]` format for backward compatibility.
- If a model returns summary/findings but no usable per-criterion scores, CallQuanta keeps analysis successful, fills fallback criterion rows, and records a warning: "Model did not return usable per-criterion scores."
- QA score continues to be computed from normalized criteria; model total score is not trusted for persisted scoring.

### QA modes

- `QA_MODE=placeholder` (default): deterministic CI-safe criteria-based review output using the default sales scorecard.
- `QA_MODE=openai_compatible`: sends transcript plus a numbered scorecard list to a chat-completions compatible LLM endpoint and expects strict JSON:
  - `summary`
  - `criteria_scores[]` (`index`, `score`, `comment`, `evidence`, `severity`)
  - `findings[]` (`severity`, `evidence`)
  - Legacy `criteria[]` responses are still accepted.

Example OpenAI-compatible configuration (Ollama):

1. Pull a local model in the Ollama container:
   `docker compose exec ollama ollama pull <model>`
2. Configure QA worker environment:

```env
QA_MODE=openai_compatible
LLM_PROVIDER=openai_compatible
LLM_BASE_URL=http://ollama:11434/v1
LLM_MODEL=<model>
LLM_API_KEY=
LLM_TIMEOUT_SECONDS=180
OLLAMA_KEEP_ALIVE=-1
```

Local Ollama CPU inference can be slow, especially with larger scorecard prompts. If QA analysis fails with timeout errors, increase `LLM_TIMEOUT_SECONDS` (default `180`).

Model guidance:
- Use `qwen2.5:0.5b` only for fast smoke tests on constrained machines/Codespaces.
- Use `qwen2.5:1.5b` as the minimum local QA test model.
- Use `qwen2.5:3b`, `qwen2.5:7b`, or `llama3.1:8b` (or stronger) for meaningfully useful QA output on stronger hardware.

Warm-up recommendation:
1. Pull your model: `docker compose exec ollama ollama pull <model>`
2. Run a quick generation before analysis so weights are loaded: `docker compose exec ollama ollama run <model> "ready"`
3. Optionally set `OLLAMA_KEEP_ALIVE=-1` to keep the model loaded during repeated test runs.

CI uses `QA_MODE=placeholder` for deterministic and fast smoke tests.
