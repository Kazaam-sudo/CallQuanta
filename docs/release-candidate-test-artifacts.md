# Release-candidate test artifacts

Baseline: `714102a6b5a6f3477e723e59b0888a947b4077f5`

## Safe execution artifacts

### Local baseline attempt

Command intent:

```bash
git clone https://github.com/Kazaam-sudo/CallQuanta.git
git checkout main
git fetch origin main --prune
git pull --ff-only origin main
```

Observed result:

```text
fatal: unable to access 'https://github.com/Kazaam-sudo/CallQuanta.git/': Could not resolve host: github.com
```

No repository files, environment values, credentials or secrets were obtained through the failed local attempt.

### GitHub baseline evidence

- Latest `main` commit: `714102a6b5a6f3477e723e59b0888a947b4077f5`
- Commit subject: `Merge pull request #74 from Kazaam-sudo/fix/remove-split-brain-auth-middleware`
- QA branch merge base: exact baseline SHA above
- QA branch production-code changes: none

### Branch diff evidence

The QA branch contains documentation/test artifacts only:

- `docs/release-candidate-qa.md`
- `docs/release-candidate-bug-backlog.md`
- `docs/release-candidate-test-artifacts.md`

No application, worker, API, web, Compose, workflow or configuration file was modified.

## Evidence not available

The following artifacts could not be captured because the audit runtime had no access to the user's Codespaces environment:

- Docker service status and restart counts
- HTTP route traces through port 8080
- browser screenshots/HAR/console output
- authentication cookies or session responses
- role-specific API/UI results
- real faster-whisper logs and transcripts
- real LLM request/QA result evidence
- invalid-data processing logs
- demo quota boundary/concurrency evidence
- CSV/XLSX samples
- persistence/restart evidence
- two-hour combined service log

These missing artifacts are explicitly recorded as blocked rather than passed.
