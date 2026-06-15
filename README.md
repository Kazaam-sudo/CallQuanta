# CallQuanta

CallQuanta is an early-beta contact center quality assurance platform. It helps teams turn call recordings into transcripts, AI-assisted QA reviews, human calibration notes, coaching actions, dashboard metrics, and exports.

## Product status

CallQuanta is currently an MVP / early beta. The core workflows are implemented and manually tested, but teams should validate access rules, retention settings, provider configuration, and deployment hardening before using it with production call recordings.

## Main workflow

```text
Upload / Telephony import → STT → Transcript → QA analysis → Human review → Coaching → Dashboard → Export
```

1. Upload one call or bulk upload many recordings.
2. Optionally import recordings through the generic telephony webhook.
3. Transcribe audio with the configured STT provider.
4. Review transcript segments and call metadata.
5. Run AI QA analysis with the configured LLM provider and scorecard.
6. Add human review, calibration flags, and manager notes.
7. Create coaching actions when a call needs follow-up.
8. Monitor results in the dashboard.
9. Export calls, QA reviews, and review history.

## Key features

- Manual call upload and bulk upload.
- Generic telephony webhook ingestion for recording imports.
- Configurable STT providers and STT language handling.
- Configurable LLM providers for QA analysis.
- Editable scorecards for QA criteria.
- QA review history with per-review exports.
- Human review and calibration workflow.
- Coaching actions connected to QA reviews.
- Manager dashboard with scores, latest reviews, lowest scores, calibration metrics, and performance breakdowns.
- CSV/XLSX exports for filtered calls and QA reviews.
- Users & Access with admin, manager, supervisor, agent, and viewer roles.
- Scoped access by all calls, team calls, or own calls.
- Audit log for important user and system changes.
- System status for API, database, Redis, queues, workers, and storage.
- Retention settings for cleanup of old audio, transcripts, reviews, and ingestion events.

## Architecture overview

CallQuanta is organized as a small multi-service application:

- **Web app**: Next.js UI in `apps/web`.
- **API**: FastAPI service in `apps/api`.
- **PostgreSQL**: primary relational database.
- **Redis**: lightweight queue/state dependency for background work.
- **STT worker**: transcribes uploaded or imported recordings.
- **QA worker**: runs LLM QA analysis against transcripts and scorecards.
- **Recording worker**: downloads recordings referenced by telephony ingestion events.
- **Uploads storage**: local mounted storage for uploaded and imported audio files.


## Free pilot testing without a domain

CallQuanta can run a short manager pilot through a local Caddy gateway and Cloudflare Quick Tunnel. This gives you one temporary `https://*.trycloudflare.com` URL without buying a domain or VPS. Managers open that one URL for the UI, and API traffic stays same-origin through the gateway.

This mode is good for short pilots and development testing only. The URL changes after tunnel restarts, your local machine or Codespace must stay running, and production deployments should use a VPS, domain, HTTPS, backups, monitoring, and hardening.

Quick start:

```bash
cp .env.pilot.example .env
docker compose -f docker-compose.yml -f docker-compose.pilot.yml up -d --build
cloudflared tunnel --url http://localhost:8080
```

See [Free pilot tunnel mode](docs/pilot-free-tunnel.md) and [Manager pilot instructions](docs/manager-pilot-instructions.md).

## Local development

### Start the stack

```bash
docker compose up --build
```

The web app is exposed by Docker Compose, and the API, database, Redis, and workers run as sibling services.

### Admin environment variables

Set initial admin credentials and security values in your environment or `.env` file before first startup. See `.env.example` for the current names and defaults. Important values include:

- initial admin email/password
- session secret
- database URL
- Redis URL
- upload directory/storage settings
- optional STT and LLM provider keys

### Login credentials

Use the configured initial admin account to log in. After creating additional users, temporary/generated passwords are shown once and users can be required to change them at first login.

### Common commands

```bash
# Validate Python syntax
python -m compileall apps/api workers packages

# Build the web app
cd apps/web && npm run build

# Validate Compose configuration
docker compose config

# Run the full local stack
docker compose up --build
```

## Production notes

- Authentication is required for product use.
- Configure a strong session secret; never use development defaults in production.
- Configure STT/LLM API keys through settings or environment-supported provider configuration.
- API keys are sensitive and should be rotated when exposed.
- Use durable upload storage for call recordings.
- Back up PostgreSQL and any required uploaded recordings.
- Put the app behind HTTPS and a reverse proxy/load balancer.
- Review retention settings before importing sensitive recordings.
- Confirm worker processes are running for transcription, QA analysis, and recording downloads.

## Security notes

- Call recordings, transcripts, QA reviews, and coaching notes are sensitive data.
- Saved provider API keys are never displayed after save.
- Webhook tokens should be regenerated immediately if exposed.
- Role/scoped access exists, but teams should test access boundaries before production use.
- Limit administrator access to trusted users.
- Use HTTPS for browser access and webhook traffic.

## Current limitations

- SMTP invitation and password reset emails are not implemented yet.
- Telephony ingestion currently provides a generic webhook; provider-specific telephony adapters are future work.
- STT quality depends on provider, model, language, recording quality, and diarization capability.
- QA quality depends on LLM provider/model behavior and scorecard quality.
- The product is still MVP / early beta and should be validated carefully before production use.

## Roadmap

- Provider-specific telephony adapters.
- SMTP invitations and password reset emails.
- Improved scorecard templates.
- Better transcript speaker diarization.
- Stronger analytics and trend reporting.
- Deployment hardening and production operations guides.

## Documentation

- [Product walkthrough](docs/product-walkthrough.md)
- [Codebase review](docs/codebase-review.md)
- [Architecture](docs/architecture.md)
- [Telephony ingestion](docs/telephony-ingestion.md)
- [Providers](docs/providers.md)
- [Scorecards](docs/scorecards.md)
- [Production deployment](docs/deploy-production.md)

## Pilot testing workflow (v0.23.0)

CallQuanta includes a lightweight pilot workflow for internal manager testing before wider rollout:

- Admins and scoped managers can assign QA reviews to supervisors/managers.
- Managers can use **My assigned reviews** in the QA Review Queue to validate AI output.
- Call Details includes a manager feedback loop for transcript quality, QA analysis quality, score agreement, scorecard fit, missed issues, false positives, and coaching usefulness.
- Quick feedback buttons let managers mark transcript, QA, score, and coaching usefulness without completing a long survey.
- The dashboard includes **Pilot Feedback** metrics such as feedback coverage, quality distributions, useful-for-coaching rate, top issue tags, STT problems, QA logic problems, and AI-human score delta.
- QA feedback can be exported as CSV or XLSX for pilot summaries.
- The `/pilot` checklist page guides admins and managers through the recommended pilot format.

See [docs/pilot-testing.md](docs/pilot-testing.md) for the recommended 3-manager, 5–10-calls-each pilot plan.
