# Full Product UX Audit

| Page | Current problem | Why it confuses a buyer | Required improvement |
| --- | --- | --- | --- |
| Header / navigation | Brand subtitle, navigation aria labels, and role labels expose English regardless of selected language. | Russian pilot users see mixed-language chrome before they reach the product. | Move visible labels to i18n and translate role/status labels. |
| Login | Sign-in heading, helper text, field labels, loading and error states are hardcoded English. | A Russian buyer may assume only part of the product is localized or production-ready. | Translate all login copy and explain that sensitive call data is protected. |
| Change password | Submit loading and backend fallback errors are hardcoded English. | Password flow can switch language mid-task. | Move loading/fallback copy to i18n. |
| Dashboard / root | Root page still says “Conversation QA starts here” and “QA scoring coming soon”. | It describes an old MVP while AI QA, topics, transcript validation and feedback already exist. | Rebuild as current product overview with workflow, outputs, metrics and primary action. |
| Dashboard analytics | Pilot feedback, table headers, filter options and loading states are hardcoded English. | Managers cannot quickly understand what metrics mean in Russian. | Translate all headings, table headers, loading states and pilot feedback metric labels. |
| Calls list | Core labels are translated, but several error messages and some select options still use English. | Error/blocked states may be unclear during upload or batch processing. | Translate user-facing errors, all-option labels and empty/loading guidance. |
| Call Details | Previous overview exists, but some request failures and history/status text still expose English/internal wording. | Managers need plain business meaning first and technical detail second. | Keep the reading order visible and translate remaining error/action text. |
| QA Review Queue | Filters, table headers, view options, feedback statuses and raw review statuses are shown in English/internal code style. | Managers do not know why a call is in the queue or what completes review. | Add guidance, translate filters/statuses, and show human review as the next action. |
| Pilot checklist | Entire page is hardcoded English. | Pilot participants using Russian get an English training page. | Move checklist and practical review guidance into i18n. |
| Settings landing | Call Topics card is hardcoded Russian and cannot switch to English. | English users see mixed-language settings. | Use i18n keys for every card. |
| LLM settings | Most labels, warnings, buttons and test results are hardcoded English. | Technical settings are exposed without buyer-friendly explanation. | Translate labels and explain LLM mode as QA generation configuration. |
| STT settings | Several labels, empty states, edit messages and button states are hardcoded English. | Users may not understand that STT affects transcription quality only. | Translate labels and helper text; explain hosted/local STT impact. |
| QA Templates / Scorecard | Page is mostly hardcoded English and uses technical scorecard terms without guidance. | Managers may not understand that templates define QA criteria. | Translate all form labels/errors and add concise guidance. |
| Call Topics | Page is hardcoded Russian only. | English users cannot use topic configuration; Russian copy is admin-focused but lacks first-step guidance. | Move all copy to i18n and explain topics/required actions business value. |
| Integrations | Many integration labels, statuses, empty states, and token messages are hardcoded English. | Telephony setup looks technical and not localized. | Translate all visible labels and explain webhook/token business meaning. |
| System / Readiness | Improved previously, but admin-only fallback and raw queue/worker names can still appear without context. | Buyers need readiness meaning first, details second. | Keep readiness cards and translate remaining errors/details. |
| Users & Access | Scope and role values are raw codes such as `all`, `team`, `viewer`. | Admins need business-readable access labels. | Add localized role/scope labels while preserving codes only as secondary detail where useful. |
| Retention | Labels, save/cleanup buttons, preview items and errors are hardcoded English. | Data cleanup is sensitive; mixed language increases risk of misunderstanding. | Translate all retention controls and destructive-action warnings. |
| Audit Log | Entire audit page is hardcoded English. | Admins cannot understand system/user activity in Russian mode. | Translate headings, filters, table headers and empty state. |
| Empty / loading / blocked states | Some pages show no empty state, raw loading text, or backend technical text as primary message. | First-time users do not know what happened or what to do next. | Add short “what happened / why it matters / next action” copy where states appear. |

## Completed in `agent/full-product-ux-audit-i18n`

- Header/navigation, login, change password, dashboard/root, QA review queue, pilot checklist, settings landing, LLM, STT and call topics were moved onto shared i18n strings.
- Call Details keeps the requested buyer-friendly reading order and uses translated call/status labels where visible.
- QA Templates / Scorecard now explains that templates define QA criteria, localizes labels, validation errors, actions and diagnostics.
- Integrations now explains webhook URL and token value, localizes setup controls, statuses, empty states and token messages.
- Audit Log now localizes headings, filters, table headers, system fallback and empty state.
- Retention now localizes save/preview/cleanup controls, preview labels, warnings and cleanup result copy.
- Users & Access now shows localized role and visibility-scope labels while preserving raw codes as secondary title text.
- Full user-facing English scan was run against the touched web pages; remaining English is limited to intentional technical identifiers, sample webhook payload data, API method names, model/provider IDs or backend-provided messages.
