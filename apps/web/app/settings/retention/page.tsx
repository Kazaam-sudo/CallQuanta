"use client";

import { FormEvent, useEffect, useState } from "react";
import { API_BASE_URL, fetchWithCredentials } from "../../../lib/api";
import { SettingsNav } from "../../../components/SettingsNav";
import { AdminOnly } from "../../../components/AdminOnly";

const emptySettings = { audio_days: "", transcripts_days: "", qa_reviews_days: "", ingestion_events_days: "" };

function toForm(settings: any) {
  return Object.fromEntries(Object.keys(emptySettings).map((key) => [key, settings?.[key] ?? ""]));
}

function toPayload(form: any) {
  return Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value === "" ? null : Number(value)]));
}

export default function RetentionPage() {
  const [form, setForm] = useState<any>(emptySettings);
  const [preview, setPreview] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);

  async function load() {
    setError("");
    const response = await fetchWithCredentials(`${API_BASE_URL}/settings/retention`);
    if (!response.ok) {
      setError("Retention settings are available to admins only.");
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
    if (!response.ok) return setError(data.detail || "Failed to save retention settings");
    setPreview(data.preview);
    setMessage("Retention settings saved. Review the dry-run preview before cleanup.");
  }

  async function runCleanup() {
    setMessage("");
    setError("");
    const response = await fetchWithCredentials(`${API_BASE_URL}/settings/retention/run-cleanup?confirm=${confirm}`, { method: "POST" });
    const data = await response.json().catch(() => null);
    if (!response.ok) return setError(data?.detail || "Cleanup failed");
    setMessage(`Cleanup complete. Audio files: ${data.deleted?.audio?.count || 0}, transcripts: ${data.deleted?.transcripts?.count || 0}, QA reviews: ${data.deleted?.qa_reviews?.count || 0}, ingestion events: ${data.deleted?.ingestion_events?.count || 0}.`);
    setConfirm(false);
    load();
  }

  const fields = [
    ["audio_days", "Audio files"],
    ["transcripts_days", "Transcripts"],
    ["qa_reviews_days", "QA reviews"],
    ["ingestion_events_days", "Ingestion events"],
  ];

  return (
    <AdminOnly><main className="grid" style={{ gap: 16 }}>
      <SettingsNav />
      <section className="card">
        <h2>Retention</h2>
        <p style={{ color: "var(--text-muted)" }}>Leave a field empty to keep data forever. Cleanup is manual in v0.19.0 and requires confirmation.</p>
        <form className="grid grid-2" onSubmit={save}>
          {fields.map(([key, label]) => <label key={key}>{label}<input type="number" min={1} placeholder="Forever" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>)}
          <div className="actions"><button className="button" type="submit">Save and preview</button></div>
        </form>
        {message && <p className="message message-success">{message}</p>}
        {error && <p className="message message-error">{error}</p>}
      </section>
      <section className="card">
        <h3>Dry-run preview</h3>
        <div className="grid grid-2">
          <div className="segment"><strong>Audio</strong><p>{preview?.audio?.count || 0} files / {Math.round((preview?.audio?.bytes || 0) / 1024 / 1024)} MB</p></div>
          <div className="segment"><strong>Transcripts</strong><p>{preview?.transcripts?.count || 0} segments</p></div>
          <div className="segment"><strong>QA reviews</strong><p>{preview?.qa_reviews?.count || 0} reviews</p></div>
          <div className="segment"><strong>Ingestion events</strong><p>{preview?.ingestion_events?.count || 0} events</p></div>
        </div>
        <label style={{ display: "block", marginTop: 16 }}><input type="checkbox" checked={confirm} onChange={(event) => setConfirm(event.target.checked)} /> I understand cleanup deletes configured old data.</label>
        <button className="button button-secondary" onClick={runCleanup} disabled={!confirm} style={{ marginTop: 12 }}>Run cleanup now</button>
      </section>
    </main></AdminOnly>
  );
}
