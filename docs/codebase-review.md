# CallQuanta codebase review

This review was created during the v0.22.0 product polish pass. It is intentionally practical: document what is risky, what is duplicated, and what should wait until after the current product UX stabilizes.

## Current structure

- `apps/web`: Next.js app router UI, auth proxy routes, upload proxy routes, shared components, and simple i18n helpers.
- `apps/api`: FastAPI API, database models/helpers, migrations, and API tests.
- `workers/stt-worker`: transcription worker and STT language normalization.
- `workers/qa-worker`: QA analysis worker and prompt/scorecard integration.
- `workers/recording-worker`: recording download worker for telephony ingestion.
- `packages/prompts`: QA analysis prompt assets.
- `packages/scorecards`: default scorecard YAML files.
- `docs`: product, architecture, provider, deployment, telephony, and scorecard documentation.

## Major modules

- Authentication, sessions, password policy, first-login password change, role checks, scoped access, and audit logging live primarily in `apps/api/app/main.py`.
- Call upload, metadata, filtering, batch actions, transcript access, QA review endpoints, human review, coaching actions, exports, telephony ingestion, system status, and retention endpoints also live primarily in `apps/api/app/main.py`.
- Frontend call list logic is concentrated in `apps/web/app/calls/page.tsx`.
- Frontend call details workflow is concentrated in `apps/web/app/calls/[id]/page.tsx`.
- Dashboard analytics UI is concentrated in `apps/web/app/dashboard/page.tsx`.
- Settings pages are split by route, but provider/settings forms repeat card, table, and fetch patterns.
- Shared product UI primitives now live in `apps/web/components/ui.tsx` and shared styles in `apps/web/app/globals.css`.

## Duplicated components and logic

- Several pages still hand-code cards, section headers, form fields, badges, empty states, and tables. New work should prefer shared primitives from `apps/web/components/ui.tsx`.
- Fetch/loading/error handling is repeated in most frontend pages. A small typed API hook could reduce repeated state management later.
- Table rendering patterns are duplicated between Calls, Dashboard, QA review queue, Users & Access, audit log, and settings pages.
- Status badge rendering exists in both CSS class conventions and inline status text. New code should use `StatusBadge` where possible.
- Settings navigation is mostly centralized, but individual settings pages still vary in page-header and card layout.

## Overly large files

- `apps/api/app/main.py` is the highest-risk file. It contains API routing, business rules, auth/access helpers, exports, settings, retention, telephony, and dashboard logic in one module.
- `apps/web/app/calls/page.tsx` is the largest frontend page and mixes upload UX, filters, sorting, pagination, batch actions, exports, and table rendering.
- `apps/web/app/calls/[id]/page.tsx` is still large after the v0.22.0 simplification because it owns metadata, transcript, QA, human review, coaching, history, and exports.
- `apps/web/app/dashboard/page.tsx` mixes filters, metrics rendering, tables, and helper formatting.

## Risky areas

- Scoped access rules are security-sensitive. Refactor only with tests that cover admin, manager, supervisor, agent, and viewer roles.
- Upload and recording download paths are sensitive because filenames, storage paths, and retention cleanup must stay safe.
- QA review history and export endpoints must preserve historical review IDs and selected-review behavior.
- Human review and coaching action updates depend on role permissions and should not be changed without endpoint tests.
- Retention cleanup can delete sensitive and important data. Keep preview/run behavior explicit.
- Telephony webhook token handling must avoid logging or exposing secrets.
- Provider API keys should continue to be write-only in the UI.

## Inconsistent naming

- UI text mixes "QA Review", "AI review", "analysis", and "review history". Product copy should use: AI review for machine output, Human review for manager validation, QA review for the overall review record.
- Some backend status names are technical queue states (`analysis_pending`, `recording_download_pending`). UI should translate them to human-friendly labels.
- `language`, `stt_language_used`, `detected_language`, and report language are distinct concepts. Tooltips now clarify them, but future code should keep naming explicit.
- Telephony uses `source`, `source_provider`, `external_call_id`, and ingestion statuses. Future provider-specific adapters should document a normalized event schema.

## Old legacy code to remove later

- Legacy review metadata recovery is still needed for old records, but can be removed after a migration or after old reviews are no longer supported.
- Older CSS conventions such as broad `.card`, `.segment`, `.badge-*`, and page-specific inline styles should gradually move behind UI primitives.
- Previous placeholder/status wording may remain in pages that were not fully refactored during v0.22.0. Remove only when replacing with localized copy.
- Some settings pages still contain page-local layout patterns that duplicate the new primitives.

## High priority cleanup

1. Split `apps/api/app/main.py` into routers by domain: auth, calls, transcripts, QA reviews, settings, users/access, dashboard, exports, telephony, retention, and system status.
2. Extract Calls list subcomponents: upload panel, filter panel, selection bar, export menu, pagination, and calls table.
3. Extract Call Details tab components: overview/metadata, transcript, QA review, human review, coaching, and history/export.
4. Add endpoint tests for human review, coaching status updates, exports, and scoped access combinations before deeper refactors.
5. Make status and scope labels consistently localized and remove user-visible raw enum values where practical.

## Medium priority cleanup

1. Introduce a small frontend API helper/hook for authenticated fetches, loading state, and error formatting.
2. Convert settings pages to use the shared page header, card, field, empty state, table, badge, and tooltip primitives.
3. Create shared table components for sortable, horizontally safe tables.
4. Move dashboard metric/table sections into smaller presentational components.
5. Add a central status-label map for API and UI to avoid duplicated status formatting.
6. Review migrations for defaults and nullable fields, especially around newer QA calibration and access-control columns.

## Later cleanup

1. Add provider-specific telephony adapters once the generic webhook contract is stable.
2. Add richer scorecard templates and scorecard validation tooling.
3. Improve transcript speaker diarization and speaker labels.
4. Add stronger analytics trends after dashboard definitions settle.
5. Add typed API client generation only after API route organization stabilizes.

## Do not touch yet

- Do not rewrite auth/session/scoped-access behavior without a dedicated security test pass.
- Do not rewrite upload storage or retention deletion behavior without backup/restore validation.
- Do not remove legacy QA review recovery until there is an explicit compatibility decision.
- Do not introduce a large design-system dependency for this product stage.
- Do not change worker queue semantics until current STT, QA, recording download, and retry flows have integration tests.
