# CallQuanta demo readiness checklist

Use this checklist before sending a pilot or external demo link.

## Start the demo

1. Start the pilot stack with the documented pilot compose file or your hosted pilot environment.
2. Confirm the app opens at the expected HTTPS or tunnel URL.
3. Log in as an admin user. Do not share admin credentials with external reviewers unless they need setup access.
4. Keep the pilot/demo environment banner visible.

## Pre-demo checks

- Auth is enabled and unauthenticated users are redirected to login.
- The Settings page shows LLM provider, STT provider, scorecard, call topics, users and access, system status, data storage, and audit log.
- The System Status page shows the demo readiness card without exposing secrets.
- Audio opens only through the protected API endpoint, not as a public static file.
- Saved API keys are never displayed after saving provider settings.
- Error messages do not include API keys, tokens, or storage paths.

## Verify LLM mode

1. Open **Settings -> System Status**.
2. Check **Demo readiness -> QA mode**.
3. For a real pilot, confirm it says a real LLM is connected and shows the active model.
4. If it says demo or placeholder mode, do not present QA scores as real AI QA.

## Verify STT

1. Open **Settings -> STT Providers**.
2. Confirm the active provider and model are appropriate for the call language.
3. Upload or open a call and check the Transcript tab for provider, model, and language used.
4. For privacy-sensitive recordings, confirm whether STT runs locally or through an approved hosted provider.

## Verify transcript validity

1. Open a call.
2. Play the audio and compare it with the Transcript tab.
3. Check the transcript validity block.
4. If the transcript contains placeholder text, the wrong language, or major mismatch with audio, re-run transcription.
5. Do not evaluate QA when the transcript is invalid.

## Verify protected audio

1. Log in and open a call with audio.
2. Confirm playback works on the call details page.
3. Log out or open a private browser session.
4. Try the same audio API URL and confirm it requires authentication.

## Test manager flow

1. Upload a first call from the Calls page.
2. Open the call details page.
3. Follow the recommended next action:
   - transcribe if no transcript exists;
   - re-run transcription if transcript is invalid;
   - run QA if transcript is valid and QA is missing;
   - open QA when QA exists.
4. Review the compact status summary for audio, transcript, QA, and topic.
5. Check Topic, QA, Manual review, Pilot feedback, Coaching, and History/export tabs.
6. In Pilot feedback, mark transcript issues before evaluating QA quality.

## Known limitations

- Placeholder QA mode is useful for UI demos only and must not be presented as a real AI result.
- Transcript validation protects QA quality but cannot replace human audio spot checks.
- Topic confidence and required-action evidence depend on transcript quality.
- External pilot users still need accounts; public unauthenticated demo links are not supported.
