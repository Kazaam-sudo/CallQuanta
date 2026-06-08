"use client";

import { SettingsNav } from "../../../components/SettingsNav";
import { AdminOnly } from "../../../components/AdminOnly";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../../components/I18nProvider";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

type Preset = { id: string; label: string; provider_type: string; default_base_url: string; default_model: string; api_key_required: boolean; note?: string };
type Provider = { id: number; name: string; provider_type: string; preset: string; base_url: string; model: string; timeout_seconds: number; is_active: boolean; api_key_configured: boolean };
type SttSettings = { mode: string; model: string; provider: Provider | null };

const BASE_FORM = { id: undefined as number | undefined, name: "", preset: "local_faster_whisper", provider_type: "faster_whisper_local", base_url: "", model: "tiny", api_key: "", timeout_seconds: 180, is_active: false };
const needsBaseUrl = new Set(["openai_compatible_audio", "groq_whisper", "deepgram", "assemblyai", "azure_speech", "custom"]);

export default function Page() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<SttSettings | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [form, setForm] = useState<any>(BASE_FORM);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  const selectedPreset = useMemo(() => presets.find((item) => item.id === form.preset), [presets, form.preset]);
  const editingProvider = useMemo(() => providers.find((item) => item.id === form.id), [providers, form.id]);
  const showBaseUrl = needsBaseUrl.has(form.provider_type);

  const load = async () => {
    const [providersRes, settingsRes] = await Promise.all([
      fetch(`${API_BASE_URL}/settings/stt/providers`),
      fetch(`${API_BASE_URL}/settings/stt`),
    ]);
    if (settingsRes.ok) setSettings(await settingsRes.json());
    const data = await providersRes.json();
    const nextPresets = data.presets || [];
    setPresets(nextPresets);
    setProviders(data.saved || []);
    setForm((current: any) => {
      if (current.name || current.model) return current;
      const preset = nextPresets.find((item: Preset) => item.id === "local_faster_whisper") || nextPresets[0];
      if (!preset) return current;
      return { ...current, preset: preset.id, provider_type: preset.provider_type, base_url: preset.default_base_url || "", model: preset.default_model || "", name: preset.label };
    });
  };

  useEffect(() => { load().catch(() => setMessage({ kind: "error", text: "Failed to load STT provider settings." })); }, []);

  const applyPresetDefaults = (presetId: string) => {
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) return;
    setForm((current: any) => ({ ...current, preset: preset.id, provider_type: preset.provider_type, base_url: preset.default_base_url || "", model: preset.default_model || "", name: preset.label }));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const payload: any = { ...form };
    if (!payload.api_key) delete payload.api_key;
    const res = await fetch(`${API_BASE_URL}/settings/stt/providers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return setMessage({ kind: "error", text: data?.detail || "Failed to save STT provider." });
    }
    setMessage({ kind: "success", text: form.id ? "STT provider updated." : "STT provider saved." });
    setForm((current: any) => ({ ...current, api_key: "" }));
    await load();
  };

  const testProvider = async (candidate: any) => {
    setIsTesting(true);
    setMessage(null);
    try {
      const savedWithoutNewKey = !!candidate.id && !candidate.api_key;
      const endpoint = savedWithoutNewKey ? `${API_BASE_URL}/settings/stt/providers/${candidate.id}/test` : `${API_BASE_URL}/settings/stt/providers/test`;
      const opts: any = { method: "POST", headers: { "Content-Type": "application/json" } };
      if (!savedWithoutNewKey) opts.body = JSON.stringify(candidate);
      const res = await fetch(endpoint, opts);
      const data = await res.json();
      if (data.ok) setMessage({ kind: "success", text: `Test passed for ${data.model || candidate.model || "provider"}. ${data.note || ""}` });
      else setMessage({ kind: "error", text: data.provider_error || "STT provider test failed." });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <AdminOnly><main className="grid" style={{ gap: 16 }}>
      <SettingsNav />
      <section className="card">
        <h2>{t("settings.sttProviderSettings")}</h2>
        {editingProvider && <p className="message" style={{ background: "#eff6ff", color: "#1d4ed8" }}>Editing STT provider: {editingProvider.name}</p>}
        <p className="message" style={{ background: "#fff8e6", color: "#7c4a03" }}>{t("settings.hostedSttWarning")}</p>
        <div className="meta-grid" style={{ marginBottom: 12 }}>
          <div className="meta-item"><small>{t("settings.activeSttProvider")}</small>{settings?.provider?.name || settings?.mode || "-"}</div>
          <div className="meta-item"><small>{t("settings.currentSttModel")}</small>{settings?.model || "-"}</div>
        </div>
        <form ref={formRef} onSubmit={save} className="grid" style={{ gap: 12 }}>
          <div className="grid" style={{ gap: 10 }}>
            <label>Preset</label><select value={form.preset} onChange={(event) => applyPresetDefaults(event.target.value)}>{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select>
            {selectedPreset?.note && <small>{selectedPreset.note}</small>}
            <label>Name</label><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            <label>{t("settings.sttProvider")}</label><input value={form.provider_type} onChange={(event) => setForm({ ...form, provider_type: event.target.value })} required />
            {showBaseUrl && <><label>Base URL</label><input value={form.base_url} onChange={(event) => setForm({ ...form, base_url: event.target.value })} placeholder="https://api.example.com/v1" /></>}
            <label>{t("settings.sttModel")}</label><input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} placeholder="tiny, base, whisper-1, or provider model" />
            <small>Model IDs change over time. Enter the exact model for your provider.</small>
            <label>API key</label><input type="password" value={form.api_key} onChange={(event) => setForm({ ...form, api_key: event.target.value })} placeholder="Enter to set/update" />
            <small>Saved API keys are never shown. Leave empty to keep an existing key.</small>
            <label>Timeout seconds</label><input type="number" value={form.timeout_seconds} onChange={(event) => setForm({ ...form, timeout_seconds: Number(event.target.value) })} min={10} />
          </div>
          <label><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /> Set as active provider</label>
          <div className="actions"><button className="button" type="submit">{form.id ? "Update provider" : t("settings.saveProvider")}</button><button className="button button-secondary" type="button" onClick={() => testProvider(form)} disabled={isTesting}>{isTesting ? "Testing..." : t("settings.testProvider")}</button></div>
        </form>
        {message && <p className={`message ${message.kind === "success" ? "message-success" : "message-error"}`}>{message.text}</p>}
      </section>
      <section className="card"><h3>Saved STT providers</h3><div className="grid" style={{ gap: 10 }}>{providers.length === 0 ? <p>No STT providers saved yet. Local faster-whisper remains available through environment fallback.</p> : providers.map((provider) => <article key={provider.id} className="segment"><div className="actions" style={{ justifyContent: "space-between" }}><strong>{provider.name}</strong><div className="actions">{provider.is_active && <span className="badge badge-transcribed">Active</span>}{provider.api_key_configured && <span className="badge badge-uploaded">{t("settings.apiKeyConfigured")}</span>}</div></div><p style={{ marginBottom: 6 }}>{provider.provider_type} • {provider.model || "-"}</p><p style={{ marginTop: 0, color: "#4b5563" }}>{provider.base_url || "local"}</p><div className="actions"><button className="button button-secondary" onClick={() => { setForm({ ...provider, api_key: "" }); setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); }}>Edit</button><button className="button button-secondary" onClick={() => fetch(`${API_BASE_URL}/settings/stt/providers/${provider.id}/activate`, { method: "POST" }).then(load)}>{t("settings.activate")}</button><button className="button button-secondary" onClick={() => testProvider(provider)} disabled={isTesting}>{isTesting ? "Testing..." : "Test"}</button></div></article>)}</div></section>
    </main></AdminOnly>
  );
}
