# CallQuanta product walkthrough

This walkthrough explains the common CallQuanta workflow for a new user.

## Login

Open CallQuanta in your browser and sign in with your email and password. If your account uses a temporary password, the app may ask you to change it before continuing.

## Upload calls

Go to **Calls**. Choose one audio file or select several files for bulk upload. Add optional shared metadata before uploading if the files belong to the same team, campaign, or language.

## Add metadata

Open a call and use the **Overview** tab to edit metadata:

- agent/operator name
- team
- campaign
- direction
- audio language

Metadata helps with dashboard filters, scoped access, and exports.

## Transcribe calls

From the call details page or the Calls list, choose **Transcribe**. CallQuanta sends the recording to the active STT provider. When transcription finishes, the **Transcript** tab shows segments, speaker labels, timing, and detected language when available.

## Run QA analysis

After transcription, choose **Analyze** or **Analyze again**. CallQuanta uses the active LLM provider and scorecard to create a QA review.

## Read AI review

Open the **QA** tab. Start with the summary and score. Then read findings. Expand the criteria breakdown only when you need evidence, comments, or per-criterion details.

## Add human review

Managers and supervisors can open the **Human Review** tab to approve, dispute, or adjust the AI review. Add a human score, manager comment, coaching notes, and calibration flag when needed.

## Add coaching action

Open the **Coaching** tab. Add a coaching action when the call needs follow-up. Treat actions like tasks: give each action a clear title, due date, and description. Mark it done, dismiss it, or reopen it as work changes.

## Use dashboard

Open **Dashboard** to see manager-friendly QA metrics:

- total and analyzed calls
- latest reviews
- lowest scores
- calibration metrics
- agent, team, and campaign performance
- criteria needing attention

Use filters to focus on a date range, team, agent, campaign, direction, or language.

## Export results

Use exports from the Calls list for filtered/selected calls and QA reviews. On a call details page, use **History / Exports** to export one selected review or the full review history.

## Manage users

Admins can open **Settings → Users & Access** to create users, assign roles, set teams and agent names, choose visibility scope, reset passwords, and require first-login password changes.

## Configure providers

Admins can configure providers under **Settings**:

- **STT Providers** control transcription.
- **LLM Provider Settings** control QA analysis.
- **Scorecard Settings** control QA criteria.
- **Workspace Language** controls interface and report language behavior.

Saved API keys are not displayed after save.

## Telephony import

Admins can open **Settings → Telephony Integrations** to copy the generic webhook URL and token. Configure the external telephony/CRM system to send recording metadata to that webhook. Recent ingestion events show webhook activity, download status, and errors.
