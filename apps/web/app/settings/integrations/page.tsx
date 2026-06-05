"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../../../components/I18nProvider";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

type Integration = {
  id: number;
  name: string;
  provider_type: string;
  is_active: boolean;
  token_configured: boolean;
  token?: string | null;
  auto_transcribe: boolean;
  auto_analyze: boolean;
  default_agent_name?: string | null;
  default_team?: string | null;
  default_campaign?: string | null;
  default_direction?: string | null;
  default_language?: string | null;
  webhook_path: string;
};
type Preset = { id: string; label: string; implemented?: boolean };
type Event = { id: number; integration_id?: number | null; source_provider: string; external_call_id?: string | null; event_type: string; status: string; message?: string | null; call_id?: number | null; created_at?: string | null };

const emptyForm = {
  name: "Generic webhook",
  provider_type: "generic_webhook",
  is_active: true,
  auto_transcribe: true,
  auto_analyze: false,
  default_agent_name: "",
  default_team: "",
  default_campaign: "",
  default_direction: "",
  default_language: "",
};

export default function TelephonyIntegrationsPage() {
  const { t } = useI18n();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latestTokens, setLatestTokens] = useState<Record<number, string>>({});

  const appOrigin = useMemo(() => (typeof window === "undefined" ? "" : window.location.origin), []);
  const webhookBase = process.env.NEXT_PUBLIC_API_BASE_URL || appOrigin;

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/settings/telephony/integrations`);
      if (!response.ok) throw new Error("Failed to load telephony integrations.");
      const data = await response.json();
      setIntegrations(data.saved || []);
      setPresets(data.presets || []);
      setEvents(data.events || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load telephony integrations.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError(null); setMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/settings/telephony/integrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, generate_token: true }),
      });
      if (!response.ok) throw new Error(await response.text());
      const saved: Integration = await response.json();
      if (saved.token) setLatestTokens((tokens) => ({ ...tokens, [saved.id]: saved.token || "" }));
      setMessage("Integration saved. Copy the token now; it will not be shown again.");
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save integration.");
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async (id: number) => {
    setError(null); setMessage(null);
    const response = await fetch(`${API_BASE_URL}/settings/telephony/integrations/${id}/regenerate-token`, { method: "POST" });
    if (!response.ok) { setError("Failed to regenerate token."); return; }
    const saved: Integration = await response.json();
    if (saved.token) setLatestTokens((tokens) => ({ ...tokens, [id]: saved.token || "" }));
    setMessage("Token regenerated. Copy it now; it will not be shown again.");
    await load();
  };

  const toggle = async (id: number) => {
    await fetch(`${API_BASE_URL}/settings/telephony/integrations/${id}/toggle`, { method: "POST" });
    await load();
  };

  const testPayload = `{
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
}`;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <section className="card">
        <p><Link href="/settings/workspace">← {t("nav.settings")}</Link></p>
        <h2>{t("telephony.title")}</h2>
        <p className="message">{t("telephony.help")}</p>
        {message && <p className="message">{message}</p>}
        {error && <p className="message message-error">{error}</p>}
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>Create integration</h3>
        <form onSubmit={save} className="grid" style={{ gap: 10 }}>
          <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>{t("telephony.provider")}
            <select value={form.provider_type} onChange={(e) => setForm({ ...form, provider_type: e.target.value })}>
              {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}{preset.implemented === false ? " (preset)" : ""}</option>)}
            </select>
          </label>
          <div className="telephony-boolean-fields" aria-label="Integration processing options">
            <label className="telephony-toggle-row">
              <span>Active</span>
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            </label>
            <label className="telephony-toggle-row">
              <span>{t("telephony.autoTranscribe")}</span>
              <input type="checkbox" checked={form.auto_transcribe} onChange={(e) => setForm({ ...form, auto_transcribe: e.target.checked })} />
            </label>
            <label className="telephony-toggle-row">
              <span>{t("telephony.autoAnalyze")}</span>
              <input type="checkbox" checked={form.auto_analyze} onChange={(e) => setForm({ ...form, auto_analyze: e.target.checked, auto_transcribe: e.target.checked ? true : form.auto_transcribe })} />
            </label>
          </div>
          <div className="grid grid-2">
            <label>Default agent<input value={form.default_agent_name} onChange={(e) => setForm({ ...form, default_agent_name: e.target.value })} /></label>
            <label>Default team<input value={form.default_team} onChange={(e) => setForm({ ...form, default_team: e.target.value })} /></label>
            <label>Default campaign<input value={form.default_campaign} onChange={(e) => setForm({ ...form, default_campaign: e.target.value })} /></label>
            <label>Default direction<input value={form.default_direction} placeholder="inbound/outbound" onChange={(e) => setForm({ ...form, default_direction: e.target.value })} /></label>
            <label>Default language<input value={form.default_language} placeholder="auto, uz, ru, en" onChange={(e) => setForm({ ...form, default_language: e.target.value })} /></label>
          </div>
          <button className="button" disabled={saving}>{saving ? "Saving..." : "Create integration and token"}</button>
        </form>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>Saved integrations</h3>
        <div className="grid" style={{ gap: 12 }}>
          {integrations.map((item) => {
            const fullWebhook = `${webhookBase.replace(/\/+$/, "")}${item.webhook_path}`;
            return <article key={item.id} className="segment telephony-integration-card">
              <div className="telephony-card-header">
                <strong>{item.name}</strong>
                <span className={`badge ${item.is_active ? "badge-success" : "badge-warning"}`}>{item.is_active ? "active" : "inactive"}</span>
              </div>
              <div className="telephony-saved-grid">
                <div className="meta-item"><small>{t("telephony.provider")}</small>{item.provider_type}</div>
                <div className="meta-item telephony-wide-field"><small>{t("telephony.webhookUrl")}</small><code>{fullWebhook}</code></div>
                <div className="meta-item"><small>{t("telephony.integrationToken")}</small>{latestTokens[item.id] ? <code>{latestTokens[item.id]}</code> : item.token_configured ? "configured" : "missing"}</div>
                <div className="meta-item"><small>{t("telephony.autoTranscribe")}</small>{item.auto_transcribe ? "yes" : "no"}</div>
                <div className="meta-item"><small>{t("telephony.autoAnalyze")}</small>{item.auto_analyze ? "yes" : "no"}</div>
              </div>
              <div className="actions telephony-card-actions">
                <button className="button button-secondary" onClick={() => navigator.clipboard?.writeText(fullWebhook)}>Copy URL</button>
                <button className="button button-secondary" onClick={() => regenerate(item.id)}>{t("telephony.regenerateToken")}</button>
                <button className="button button-secondary" onClick={() => toggle(item.id)}>{item.is_active ? "Deactivate" : "Activate"}</button>
              </div>
              <details className="telephony-payload-details"><summary>Test payload example</summary><pre className="telephony-code-block">{testPayload}</pre></details>
            </article>;
          })}
          {integrations.length === 0 && <p>No telephony integrations yet.</p>}
        </div>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>{t("telephony.recentEvents")}</h3>
        <div className="grid" style={{ gap: 8 }}>
          {events.map((event) => <article key={event.id} className="segment">
            <div><strong>{event.created_at ? new Date(event.created_at).toLocaleString() : "-"}</strong> · {event.source_provider} · {event.event_type} · <span className={`badge badge-${event.status}`}>{event.status}</span></div>
            <div>{t("telephony.externalCallId")}: {event.external_call_id || "-"} {event.call_id ? <>· <Link href={`/calls/${event.call_id}`}>Call #{event.call_id}</Link></> : null}</div>
            {event.message && <small>{event.message}</small>}
          </article>)}
          {events.length === 0 && <p>No ingestion events yet.</p>}
        </div>
      </section>
    </div>
  );
}
