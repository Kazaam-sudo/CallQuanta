"use client";

import { FormEvent, useEffect, useState } from "react";
import { API_BASE_URL, fetchWithCredentials } from "../../../lib/api";
import { SettingsNav } from "../../../components/SettingsNav";
import { AdminOnly } from "../../../components/AdminOnly";
import { useI18n } from "../../../components/I18nProvider";
import { HelpTooltip } from "../../../components/ui";

const emptySettings = { audio_days: "", transcripts_days: "", qa_reviews_days: "", ingestion_events_days: "" };

function toForm(settings: any) {
  return Object.fromEntries(Object.keys(emptySettings).map((key) => [key, settings?.[key] ?? ""]));
}

function toPayload(form: any) {
  return Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value === "" ? null : Number(value)]));
}

export default function RetentionPage() {
  const { t } = useI18n();
  const [form, setForm] = useState<any>(emptySettings);
  const [preview, setPreview] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);

  async function load() {
    setError("");
    const response = await fetchWithCredentials(`${API_BASE_URL}/settings/retention`);
    if (!response.ok) {
      setError(t("retention.adminOnly"));
      return;
    }
    const data = await response.json();
    setForm(toForm(data.settings));
    setPreview(data.preview);
  }

  useEffect(() => { load(); }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const response = await fetchWithCredentials(`${API_BASE_URL}/settings/retention`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toPayload(form)) });
    const data = await response.json();
    if (!response.ok) return setError(data.detail || t("retention.saveFailed"));
    setPreview(data.preview);
    setMessage(t("retention.saved"));
  }

  async function runCleanup() {
    setMessage("");
    setError("");
    const response = await fetchWithCredentials(`${API_BASE_URL}/settings/retention/run-cleanup?confirm=${confirm}`, { method: "POST" });
    const data = await response.json().catch(() => null);
    if (!response.ok) return setError(data?.detail || t("retention.cleanupFailed"));
    setMessage(t("retention.cleanupComplete")
      .replace("{audio}", String(data.deleted?.audio?.count || 0))
      .replace("{transcripts}", String(data.deleted?.transcripts?.count || 0))
      .replace("{reviews}", String(data.deleted?.qa_reviews?.count || 0))
      .replace("{events}", String(data.deleted?.ingestion_events?.count || 0)));
    setConfirm(false);
    load();
  }

  const fields = [
    ["audio_days", t("retention.audioFiles")],
    ["transcripts_days", t("retention.transcripts")],
    ["qa_reviews_days", t("retention.qaReviews")],
    ["ingestion_events_days", t("retention.ingestionEvents")],
  ];

  return (
    <AdminOnly><main className="grid" style={{ gap: 16 }}>
      <SettingsNav />
      <section className="card">
        <h2>{t("settings.retention")} <HelpTooltip text={t("help.retention")} /></h2>
        <p style={{ color: "var(--text-muted)" }}>{t("settings.retentionHelp")}</p>
        <form className="grid grid-2" onSubmit={save}>
          {fields.map(([key, label]) => <label key={key}>{label}<input type="number" min={1} placeholder={t("retention.forever")} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>)}
          <div className="actions"><button className="button" type="submit">{t("retention.savePreview")}</button></div>
        </form>
        {message && <p className="message message-success">{message}</p>}
        {error && <p className="message message-error">{error}</p>}
      </section>
      <section className="card">
        <h3>{t("settings.retentionPreview")}</h3>
        <div className="grid grid-2">
          <div className="segment"><strong>{t("retention.audio")}</strong><p>{preview?.audio?.count || 0} {t("retention.files")} / {Math.round((preview?.audio?.bytes || 0) / 1024 / 1024)} MB</p></div>
          <div className="segment"><strong>{t("retention.transcripts")}</strong><p>{preview?.transcripts?.count || 0} {t("retention.segments")}</p></div>
          <div className="segment"><strong>{t("retention.qaReviews")}</strong><p>{preview?.qa_reviews?.count || 0} {t("retention.reviews")}</p></div>
          <div className="segment"><strong>{t("retention.ingestionEvents")}</strong><p>{preview?.ingestion_events?.count || 0} {t("retention.events")}</p></div>
        </div>
        <label style={{ display: "block", marginTop: 16 }}><input type="checkbox" checked={confirm} onChange={(event) => setConfirm(event.target.checked)} /> {t("retention.confirm")}</label>
        <button className="button button-secondary" onClick={runCleanup} disabled={!confirm} style={{ marginTop: 12 }}>{t("retention.runCleanup")}</button>
      </section>
    </main></AdminOnly>
  );
}
