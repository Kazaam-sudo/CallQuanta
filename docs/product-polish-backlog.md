# Product polish backlog

Candidate: `agent/release-polish-recovery` based on `764ac29e`.

## PP-001 — Auth feedback was mixed-language

- **Severity:** High
- **Evidence:** Login and protected-route session messages were hard-coded in
  Russian even when English or Uzbek was selected.
- **Fix:** Use the existing i18n translator for session error, retry, redirect,
  and loading states; add the missing Uzbek auth strings.
- **Status:** Fixed in this candidate; frontend build and unit tests pass.

## PP-002 — Login fields lacked an accessible label relationship

- **Severity:** High
- **Evidence:** The stale live image could render visible Email/Password text,
  but Playwright’s label locator found no associated input.
- **Fix:** Add stable input IDs and matching `htmlFor` attributes to the existing
  labels.
- **Status:** Fixed in workspace source; candidate-image browser verification is
  pending deployment.

## PP-003 — Non-admin locale preference triggered a forbidden shared-settings write

- **Severity:** High
- **Evidence:** Shared workspace settings are an admin capability, while all
  authenticated roles can choose a local interface language. The initial settings
  loader and language selector could PATCH shared settings for non-admins.
- **Fix:** Keep locale in local storage/cookie for every user; only admins PATCH
  shared workspace settings. The gate applies both on initial settings load and
  later user selection.
- **Status:** Fixed and covered by `workspace-settings-policy.test.mjs`.

## PP-004 — Browser release evidence needs current candidate images

- **Severity:** High
- **Evidence:** The new compact Playwright suite ran against an older web image,
  so its label checks failed before it could assess this candidate.
- **Next step:** Deploy candidate images, run public desktop/mobile smoke, then
  add disposable credential variables for the authenticated persistence/logout
  check.
- **Status:** Open release-validation work; no speculative UI rewrite is needed.

## PP-005 — Buyer terminology needs observed feedback

- **Severity:** Medium
- **Evidence:** No current-candidate RU/EN mobile screenshots or buyer review
  session exists for QA queue, provider, and scorecard wording.
- **Next step:** Collect screenshots and buyer feedback, then change only labels
  tied to a reproducible comprehension issue.
- **Status:** Open.

## PP-006 — Current-candidate visual audit is awaiting a runnable stack

- **Severity:** High release-validation blocker
- **Evidence:** On 2026-07-17, frontend unit tests (16) and the production build
  passed, but this workspace has no Docker executable, so the candidate web UI
  could not be inspected at the local gateway on desktop or mobile.
- **Recommended minimal fix:** No speculative UI change. Build the candidate
  images, then review the documented public, login, dashboard, calls, QA queue,
  and settings routes in Russian, English, and Uzbek where supported.
- **Regression check:** Run Playwright against the current candidate with
  disposable credentials, installed Chromium, and retain only non-sensitive
  screenshots/traces.
- **Status:** Open; this does not invalidate the completed localized auth and
  accessibility fixes above.
