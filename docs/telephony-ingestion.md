# Telephony ingestion MVP

CallQuanta v0.18.0 adds a provider-neutral ingestion layer for importing call recordings from telephony and CRM systems. The first fully implemented provider type is `generic_webhook`; Voximplant, Asterisk, Twilio, Zadarma, and custom presets are placeholders for future provider-specific adapters.

## Concept

1. Create a Telephony Integration in **Settings → Telephony Integrations**.
2. Copy the generated token immediately. CallQuanta stores only a secure hash and will not show the token again.
3. Configure your external system to send a JSON webhook containing an external call ID, a recording URL, and optional call metadata.
4. CallQuanta validates the token, creates or reuses the call by `(source_provider, external_call_id)`, queues a recording download, and optionally queues transcription and QA analysis.
5. Recent ingestion events are available in the Telephony Integrations settings page for debugging.

## Generic webhook endpoint

```text
POST /integrations/telephony/webhook/{integration_id}
```

Authenticate with one of these headers:

```text
Authorization: Bearer TOKEN
X-CallQuanta-Token: TOKEN
```

Required payload fields:

- `external_call_id`
- `recording_url`

Optional metadata fields:

- `filename`
- `agent_name`
- `team`
- `campaign`
- `direction` (`inbound`, `outbound`, `internal`, or `unknown`)
- `language` (`auto`, `uz`, `ru`, `en`, etc.)
- `customer_phone`
- `agent_phone`
- `started_at`
- `ended_at`
- `duration_seconds`
- `auto_transcribe`
- `auto_analyze`

## Curl example

```bash
curl -X POST http://localhost:8000/integrations/telephony/webhook/1 \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "external_call_id": "abc-123",
    "recording_url": "https://example.com/recordings/abc-123.wav",
    "filename": "abc-123.wav",
    "agent_name": "Shahzoda",
    "team": "Outbound Sales",
    "campaign": "Humans Promo",
    "direction": "outbound",
    "language": "uz",
    "customer_phone": "+998901234567",
    "agent_phone": "+998900000001",
    "started_at": "2026-06-05T10:00:00Z",
    "ended_at": "2026-06-05T10:03:20Z",
    "duration_seconds": 200,
    "auto_transcribe": true,
    "auto_analyze": false
  }'
```

Accepted response:

```json
{
  "status": "accepted",
  "call_id": 123,
  "external_call_id": "abc-123",
  "ingestion_status": "recording_download_pending"
}
```

Duplicate response:

```json
{
  "status": "duplicate",
  "call_id": 123,
  "external_call_id": "abc-123"
}
```

## Auto-processing

- If `auto_transcribe` is true, the recording worker stores the downloaded audio like an uploaded file and queues a transcription job.
- If `auto_analyze` is true, CallQuanta also enables transcription and marks the call for QA analysis after transcription succeeds.
- If the queue backend is unavailable, the call is marked with a safe error and an ingestion event is recorded.

## Recording downloads

The recording worker enforces these environment variables:

- `RECORDING_DOWNLOAD_MAX_BYTES` (default `104857600`, 100 MB)
- `RECORDING_DOWNLOAD_TIMEOUT_SECONDS` (default `120`)

The worker follows redirects, validates audio content type or file extension, sanitizes filenames, stores recordings in the uploads directory, and records success/failure events.

## Security notes

- Webhook tokens are required and are stored as hashes.
- Tokens are never logged or returned after the generation response.
- Payload logging is minimal by default. Set `INGESTION_PAYLOAD_LOGGING=true` only if you accept the privacy tradeoff; phone fields are still redacted.
- Recording downloads are size-limited and time-limited.
- Use HTTPS for production webhook calls and recording URLs.

## Future provider adapters

Provider-specific adapters for Voximplant, Asterisk, Twilio, Zadarma, and custom CRM flows can normalize vendor-specific events into the same generic ingestion payload and reuse the same recording worker, idempotency, logs, and auto-processing flow.
