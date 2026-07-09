# Demo mode

CallQuanta demo mode gives public evaluators a limited workspace for trying transcription and QA analysis before a production workspace is connected.

## Default quota

The default demo quota is **50 analyzed calls** per demo workspace.

Configure it with:

```env
DEMO_CALL_LIMIT=50
```

Set `DEMO_CALL_LIMIT=0` only for internal environments where demo quota enforcement should be disabled.

## Why 50 calls

Fifty calls is enough for a practical evaluation because it lets a buyer test several operators, teams, call outcomes and edge cases without turning a free public demo into open-ended processing. It is large enough to show dashboard trends, QA review flow, transcript quality and calibration feedback, while still keeping demo costs predictable.

## Cost assumption

For an average **3-5 minute call**, demo processing includes transcription plus QA analysis. Actual cost depends on the selected STT and LLM providers, call length, retry volume and model pricing, but the expected cost is usually below a few dollars per demo workspace.

## Recommendation

Use **50 calls** for the public free demo.

Use **100 calls** only for qualified prospects or after manual approval, especially when a real provider API key is connected.
