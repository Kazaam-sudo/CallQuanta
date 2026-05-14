# CallQuanta

CallQuanta is an open-source, self-hosted AI quality assurance platform for contact centers. It transcribes calls, analyzes conversations, scores agents against customizable QA scorecards, detects script/compliance issues, and sends actionable coaching insights to managers.

## License

AGPL-3.0.

## MVP Flow (v0.1)

Upload call → transcribe → analyze → score → show evidence → notify.

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

## Local Development (Draft)

1. Copy `.env.example` values as needed.
2. Run `docker compose up --build`.
3. API: `http://localhost:8000`.
4. Web: `http://localhost:3000`.

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
