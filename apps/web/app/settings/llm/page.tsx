"use client";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

type Preset = { id: string; label: string; provider_type: string; default_base_url: string; default_model: string; api_key_required: boolean; note?: string };
type Provider = { id: number; name: string; provider_type: string; preset: string; base_url: string; model: string; timeout_seconds: number; is_active: boolean; api_key_configured: boolean };

const BASE_FORM = { id: undefined, name: "", preset: "ollama", provider_type: "openai_compatible", base_url: "", model: "", api_key: "", timeout_seconds: 180, is_active: false };

export default function Page() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [form, setForm] = useState<any>(BASE_FORM);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  const selectedPreset = useMemo(() => presets.find((x) => x.id === form.preset), [presets, form.preset]);
  const editingProvider = useMemo(() => providers.find((p) => p.id === form.id), [providers, form.id]);

  const applyPresetDefaults = (presetId: string, overwriteName = true) => {
    const p = presets.find((x) => x.id === presetId);
    if (!p) return;
    setForm((f: any) => ({ ...f, preset: presetId, provider_type: p.provider_type || "openai_compatible", base_url: p.default_base_url ?? "", model: p.default_model ?? "", name: overwriteName ? p.label : f.name }));
  };

  const load = async () => {
    const res = await fetch(`${API_BASE_URL}/settings/llm/providers`);
    const data = await res.json();
    const nextPresets = data.presets || [];
    setPresets(nextPresets);
    setProviders(data.saved || []);
    setForm((f: any) => {
      if (f.base_url && f.model) return f;
      const preset = nextPresets.find((p: Preset) => p.id === f.preset) || nextPresets.find((p: Preset) => p.id === "openai") || nextPresets[0];
      if (!preset) return f;
      return { ...f, preset: preset.id, provider_type: preset.provider_type, base_url: preset.default_base_url ?? "", model: preset.default_model ?? "", name: f.name || preset.label };
    });
  };

  useEffect(() => { load(); }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const payload: any = { ...form };
    if (!payload.api_key) delete payload.api_key;
    const res = await fetch(`${API_BASE_URL}/settings/llm/providers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) return setMessage({ kind: "error", text: "Failed to save provider." });
    setMessage({ kind: "success", text: form.id ? "Provider updated." : "Provider saved." });
    setForm((f: any) => ({ ...f, api_key: "" }));
    load();
  };

  const testProvider = async (candidate: any) => {
    setIsTesting(true);
    setMessage(null);
    try {
      const isEditingSavedWithoutKey = !!candidate.id && !candidate.api_key;
      const endpoint = isEditingSavedWithoutKey ? `${API_BASE_URL}/settings/llm/providers/${candidate.id}/test` : `${API_BASE_URL}/settings/llm/providers/test`;
      const opts: any = { method: "POST", headers: { "Content-Type": "application/json" } };
      if (!isEditingSavedWithoutKey) {
        opts.body = JSON.stringify({ provider_type: candidate.provider_type, base_url: candidate.base_url, model: candidate.model, api_key: candidate.api_key || undefined, timeout_seconds: candidate.timeout_seconds || 60 });
      }
      const res = await fetch(endpoint, opts);
      const data = await res.json();
      if (data.ok) setMessage({ kind: "success", text: `Test passed in ${data.latency_ms}ms using model ${data.model}.` });
      else {
        const detail = data.provider_error ? JSON.stringify(data.provider_error).slice(0, 300) : "Unknown error";
        setMessage({ kind: "error", text: `Test failed${data.status_code ? ` (HTTP ${data.status_code})` : ""} in ${data.latency_ms}ms. ${detail}` });
      }
    } finally { setIsTesting(false); }
  };

  return <main className="grid" style={{ gap: 16 }}>
    <div className="actions"><Link href="/settings/llm">LLM Providers</Link><Link href="/settings/scorecard">Scorecard</Link><Link href="/settings/workspace">Workspace Language</Link><Link href="/settings/stt">STT</Link><Link href="/settings/integrations">Telephony</Link></div>
    <section className="card">
      <h2>LLM Provider Settings</h2>
      {editingProvider && <p className="message" style={{ background: "#eff6ff", color: "#1d4ed8" }}>Editing provider: {editingProvider.name}</p>}
      <p className="message" style={{ background: "#fff8e6", color: "#7c4a03" }}>Hosted providers may process call transcripts outside your server. Use local Ollama for privacy-sensitive data.</p>
      <form ref={formRef} onSubmit={save} className="grid" style={{ gap: 12 }}>
        <div className="grid" style={{ gap: 10 }}>
          <label>Preset</label><select value={form.preset} onChange={(e) => applyPresetDefaults(e.target.value, true)}>{presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
          <label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <label>Base URL</label><input value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} required />
          <label>Model</label><input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} required />
          <small>Use exact API model IDs like gpt-5.4-nano, gpt-5.4-mini, or gpt-5.5. Do not use display names like GPT-5 nano.</small>
          <label>API key</label><input type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} placeholder="Enter to set/update" />
          <small>Saved API keys are never shown. Leave empty to keep existing key.</small>
          <label>Timeout seconds</label><input type="number" value={form.timeout_seconds} onChange={(e) => setForm({ ...form, timeout_seconds: Number(e.target.value) })} min={10} />
        </div>
        <label><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Set as active provider</label>
        <div className="actions"><button className="button" type="submit">{form.id ? "Update provider" : "Save provider"}</button><button className="button button-secondary" type="button" onClick={() => testProvider(form)} disabled={isTesting}>{isTesting ? "Testing..." : "Test provider"}</button></div>
      </form>
      {message && <p className={`message ${message.kind === "success" ? "message-success" : "message-error"}`}>{message.text}</p>}
    </section>
    <section className="card"><h3>Saved providers</h3><div className="grid" style={{ gap: 10 }}>{providers.map((p) => <article key={p.id} className="segment"><div className="actions" style={{ justifyContent: "space-between" }}><strong>{p.name}</strong><div className="actions">{p.is_active && <span className="badge badge-transcribed">Active</span>}{p.api_key_configured && <span className="badge badge-uploaded">API key configured</span>}</div></div><p style={{ marginBottom: 6 }}>{p.preset} • {p.model}</p><p style={{ marginTop: 0, color: "#4b5563" }}>{p.base_url}</p><div className="actions"><button className="button button-secondary" onClick={() => {setForm({ ...p, api_key: "" }); setTimeout(()=>formRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),0);}}>Edit</button><button className="button button-secondary" onClick={() => fetch(`${API_BASE_URL}/settings/llm/providers/${p.id}/activate`, { method: "POST" }).then(load)}>Activate</button><button className="button button-secondary" onClick={() => testProvider(p)} disabled={isTesting}>{isTesting ? "Testing..." : "Test"}</button></div></article>)}</div></section>
  </main>;
}
