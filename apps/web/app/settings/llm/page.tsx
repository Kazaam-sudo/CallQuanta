"use client";
import { FormEvent, useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

type Preset = { id: string; label: string; provider_type: string; default_base_url: string; default_model: string; api_key_required: boolean; note?: string };
type Provider = { id: number; name: string; provider_type: string; preset: string; base_url: string; model: string; timeout_seconds: number; is_active: boolean; api_key_configured: boolean };

export default function Page() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [form, setForm] = useState<any>({ id: undefined, name: "", preset: "ollama", provider_type: "openai_compatible", base_url: "", model: "", api_key: "", timeout_seconds: 180, is_active: false });
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch(`${API_BASE_URL}/settings/llm/providers`);
    const data = await res.json();
    setPresets(data.presets || []);
    setProviders(data.saved || []);
  };
  useEffect(() => { load(); }, []);

  const onPreset = (presetId: string) => {
    const p = presets.find((x) => x.id === presetId);
    setForm((f: any) => ({ ...f, preset: presetId, provider_type: p?.provider_type || "openai_compatible", base_url: p?.default_base_url ?? "", model: p?.default_model ?? "" }));
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const payload: any = { ...form };
    if (!payload.api_key) delete payload.api_key;
    const res = await fetch(`${API_BASE_URL}/settings/llm/providers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) return setMessage("Failed to save provider");
    setMessage("Provider saved");
    setForm({ ...form, api_key: "" });
    load();
  };

  const testProvider = async (candidate: any) => {
    const res = await fetch(`${API_BASE_URL}/settings/llm/providers/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider_type: candidate.provider_type, base_url: candidate.base_url, model: candidate.model, api_key: candidate.api_key || undefined, timeout_seconds: candidate.timeout_seconds || 60 }) });
    const data = await res.json();
    setMessage(data.ok ? `Test passed (${data.latency_ms}ms)` : `Test failed (${data.latency_ms}ms): ${data.error || "Unknown"}`);
  };

  return <main className="grid" style={{ gap: 16 }}>
    <section className="card">
      <h2>LLM Providers</h2>
      <p className="message message-warning">Hosted providers may process call transcripts outside your server. Use local Ollama for privacy-sensitive data.</p>
      <p><strong>Ollama Local:</strong> privacy-first, requires local model pulled.<br/><strong>Hosted providers:</strong> OpenAI/Groq/Gemini/OpenRouter/etc send transcript text to external APIs.</p>
      <form onSubmit={save} className="grid" style={{ gap: 8 }}>
        <label>Preset <select value={form.preset} onChange={(e) => onPreset(e.target.value)}>{presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
        <label>Name <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>Base URL <input value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} required /></label>
        <label>Model <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} required /></label>
        <label>API key <input type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} placeholder="Enter to set/update" /></label>
        <label>Timeout seconds <input type="number" value={form.timeout_seconds} onChange={(e) => setForm({ ...form, timeout_seconds: Number(e.target.value) })} /></label>
        <label><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active</label>
        <div className="actions"><button className="button" type="submit">Save provider</button><button className="button button-secondary" type="button" onClick={() => testProvider(form)}>Test provider</button></div>
      </form>
      {message && <p className="message">{message}</p>}
    </section>
    <section className="card">
      <h3>Saved providers</h3>
      <div className="grid" style={{ gap: 8 }}>{providers.map((p) => <article key={p.id} className="segment"><strong>{p.name}</strong> {p.is_active && <span className="badge">active</span>} {p.api_key_configured && <span className="badge">api key configured</span>}<div>{p.preset} • {p.model}</div><div>{p.base_url}</div><div className="actions"><button className="button button-secondary" onClick={() => setForm({ ...p, api_key: "" })}>Edit</button><button className="button button-secondary" onClick={() => fetch(`${API_BASE_URL}/settings/llm/providers/${p.id}/activate`, { method: "POST" }).then(load)}>Activate</button><button className="button button-secondary" onClick={() => testProvider(p)}>Test</button></div></article>)}</div>
    </section>
  </main>;
}
