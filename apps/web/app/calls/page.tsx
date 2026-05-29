"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useI18n } from "../../components/I18nProvider";

type Call = {
  id: number;
  filename: string;
  status: string;
  stored_filename?: string | null;
  stored_path?: string | null;
  file_size_bytes?: number | null;
  content_type?: string | null;
  agent_name?: string | null;
  team?: string | null;
  campaign?: string | null;
  direction?: string | null;
  language?: string | null;
  created_at?: string | null;
};

type BulkUploadResponse = {
  uploaded?: Array<{ id: number; filename: string; status: string }>;
  failed?: Array<{ filename: string; error: string }>;
};

type BatchResponse = {
  results?: Array<{ call_id: number; status: string; reason?: string; error?: string }>;
};

type BulkMetadata = {
  agent_name: string;
  team: string;
  campaign: string;
  direction: string;
  language: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

const emptyMetadata: BulkMetadata = { agent_name: "", team: "", campaign: "", direction: "", language: "" };

export default function CallsPage() {
  const { t } = useI18n();
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [metadata, setMetadata] = useState<BulkMetadata>(emptyMetadata);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<BulkUploadResponse | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedCallIds, setSelectedCallIds] = useState<Set<number>>(new Set());
  const [batchLoading, setBatchLoading] = useState<"transcribe" | "analyze" | null>(null);
  const [batchMessage, setBatchMessage] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);

  const selectedCallCount = selectedCallIds.size;
  const allVisibleSelected = useMemo(() => calls.length > 0 && calls.every((call) => selectedCallIds.has(call.id)), [calls, selectedCallIds]);

  const parseErrorDetail = (data: unknown): string | null => {
    if (!data || typeof data !== "object") return null;
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail) return detail;
    if (Array.isArray(detail)) {
      const messages = detail.map((item) => typeof item === "string" ? item : item && typeof item === "object" && "msg" in item ? String((item as { msg?: unknown }).msg || "") : "").filter(Boolean);
      if (messages.length > 0) return messages.join("; ");
    }
    return null;
  };

  const loadCalls = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/calls`);
      let data: unknown = null;
      try { data = await response.json(); } catch { data = null; }
      if (!response.ok) throw new Error(parseErrorDetail(data) ?? `HTTP ${response.status}`);
      if (!Array.isArray(data)) throw new Error("API returned an unexpected payload.");
      setCalls(data as Call[]);
      setSelectedCallIds((current) => new Set([...current].filter((id) => (data as Call[]).some((call) => call.id === id))));
    } catch (error) {
      setLoadError(`Failed to load calls: ${error instanceof Error ? error.message : "Unknown error while loading calls."}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCalls(); }, []);

  const onUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedFiles.length === 0) return;
    setUploadResult(null);
    setUploadError(null);
    setUploading(true);

    try {
      const uploadData = new FormData();
      selectedFiles.forEach((file) => uploadData.append("files", file));
      Object.entries(metadata).forEach(([key, value]) => {
        if (value.trim()) uploadData.append(key, value.trim());
      });
      const response = await fetch(`${API_BASE_URL}/calls/upload/bulk`, { method: "POST", body: uploadData });
      const data = await response.json().catch(() => null) as BulkUploadResponse | null;
      if (!response.ok) {
        setUploadError(`${t("calls.uploadFailed")}: ${parseErrorDetail(data) ?? `HTTP ${response.status}`}`);
        return;
      }
      setUploadResult(data ?? { uploaded: [], failed: [] });
      if ((data?.uploaded?.length ?? 0) > 0) {
        setSelectedFiles([]);
        event.currentTarget.reset();
        await loadCalls();
      }
    } catch {
      setUploadError(`${t("calls.uploadFailed")}: Network error while uploading files.`);
    } finally {
      setUploading(false);
    }
  };

  const toggleCall = (callId: number) => {
    setSelectedCallIds((current) => {
      const next = new Set(current);
      if (next.has(callId)) next.delete(callId); else next.add(callId);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedCallIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) calls.forEach((call) => next.delete(call.id));
      else calls.forEach((call) => next.add(call.id));
      return next;
    });
  };

  const runBatchAction = async (action: "transcribe" | "analyze") => {
    if (selectedCallIds.size === 0) return;
    setBatchLoading(action);
    setBatchMessage(null);
    setBatchError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/calls/batch/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call_ids: [...selectedCallIds] }),
      });
      const data = await response.json().catch(() => null) as BatchResponse | null;
      if (!response.ok) throw new Error(parseErrorDetail(data) ?? `HTTP ${response.status}`);
      const queued = data?.results?.filter((item) => item.status.endsWith("_queued")).length ?? 0;
      const skipped = data?.results?.filter((item) => item.status === "skipped").length ?? 0;
      const missing = data?.results?.filter((item) => item.status === "not_found").length ?? 0;
      setBatchMessage(`${action === "transcribe" ? t("calls.transcribeSelected") : t("calls.analyzeSelected")}: ${queued} queued, ${skipped} skipped${missing ? `, ${missing} missing` : ""}.`);
      await loadCalls();
    } catch (error) {
      setBatchError(`${action === "transcribe" ? t("calls.transcribeSelected") : t("calls.analyzeSelected")} failed: ${error instanceof Error ? error.message : "Unknown error."}`);
    } finally {
      setBatchLoading(null);
    }
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>{t("calls.uploadFiles")}</h2>
        <form onSubmit={onUpload} className="grid" style={{ gap: 12 }}>
          <input className="input-file" type="file" name="files" multiple required accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac,.webm" onChange={(event) => { setSelectedFiles(Array.from(event.currentTarget.files ?? [])); setUploadResult(null); setUploadError(null); }} />
          <small style={{ color: "var(--text-muted)" }}>Accepted formats: WAV, MP3, M4A, OGG, FLAC, WEBM.</small>
          <small>{t("calls.selectedFiles")}: {selectedFiles.length}</small>

          <div className="grid">
            <strong>{t("call.metadata")}</strong>
            <small>{t("calls.bulkMetadataHelp")}</small>
            <div className="grid-2">
              <label>{t("call.agentName")}<input value={metadata.agent_name} onChange={(event) => setMetadata({ ...metadata, agent_name: event.target.value })} placeholder="Shahzoda" /></label>
              <label>{t("call.team")}<input value={metadata.team} onChange={(event) => setMetadata({ ...metadata, team: event.target.value })} placeholder="Outbound Sales" /></label>
              <label>{t("call.campaign")}<input value={metadata.campaign} onChange={(event) => setMetadata({ ...metadata, campaign: event.target.value })} placeholder="Humans Promo" /></label>
              <label>{t("call.direction")}<select value={metadata.direction} onChange={(event) => setMetadata({ ...metadata, direction: event.target.value })}><option value="">-</option><option value="inbound">inbound</option><option value="outbound">outbound</option><option value="unknown">unknown</option></select></label>
              <label>{t("call.language")}<input value={metadata.language} onChange={(event) => setMetadata({ ...metadata, language: event.target.value })} placeholder="ru-RU" /></label>
            </div>
          </div>

          <div><button className="button" type="submit" disabled={selectedFiles.length === 0 || uploading}>{uploading ? t("calls.uploading") : t("calls.uploadSelected")}</button></div>
        </form>
        {uploadError && <p className="message message-error">{uploadError}</p>}
        {uploadResult && <div className="message message-success"><strong>{t("calls.uploadResults")}</strong><div>{t("calls.uploaded")}: {uploadResult.uploaded?.length ?? 0}</div>{(uploadResult.failed?.length ?? 0) > 0 && <div>{t("calls.failed")}: {uploadResult.failed?.map((item) => `${item.filename} (${item.error})`).join(", ")}</div>}</div>}
      </section>

      <section className="card">
        <div className="actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>{t("calls.calls")} ({calls.length})</h2>
          <div className="actions">
            <span style={{ alignSelf: "center" }}>{t("calls.selectedCalls")}: {selectedCallCount}</span>
            <button className="button button-secondary" type="button" onClick={() => runBatchAction("transcribe")} disabled={selectedCallCount === 0 || !!batchLoading}>{batchLoading === "transcribe" ? t("calls.working") : t("calls.transcribeSelected")}</button>
            <button className="button button-secondary" type="button" onClick={() => runBatchAction("analyze")} disabled={selectedCallCount === 0 || !!batchLoading}>{batchLoading === "analyze" ? t("calls.working") : t("calls.analyzeSelected")}</button>
            <button className="button button-secondary" type="button" onClick={loadCalls} disabled={loading || uploading || !!batchLoading}>{loading ? t("calls.refreshing") : t("calls.refresh")}</button>
          </div>
        </div>
        {batchMessage && <p className="message message-success">{batchMessage}</p>}
        {batchError && <p className="message message-error">{batchError}</p>}
        {loadError && <p className="message message-error">{loadError}</p>}
        {loading ? <p>{t("calls.loading")}</p> : calls.length === 0 ? <p>No calls uploaded yet.</p> : (
          <div className="table-wrap"><table><thead><tr><th><input type="checkbox" aria-label="Select all visible calls" checked={allVisibleSelected} onChange={toggleAllVisible} /></th><th>ID</th><th>Filename</th><th>{t("calls.status")}</th><th>Agent</th><th>Team</th><th>Campaign</th><th>Direction</th><th>Language</th><th>File size</th><th>Created</th><th>Action</th></tr></thead><tbody>
            {calls.map((call) => <tr key={call.id}><td><input type="checkbox" aria-label={`Select call ${call.id}`} checked={selectedCallIds.has(call.id)} onChange={() => toggleCall(call.id)} /></td><td>#{call.id}</td><td>{call.filename}</td><td><span className={`badge badge-${call.status}`}>{call.status.replaceAll("_", " ")}</span></td><td>{call.agent_name || "-"}</td><td>{call.team || "-"}</td><td>{call.campaign || "-"}</td><td>{call.direction || "-"}</td><td>{call.language || "-"}</td><td>{call.file_size_bytes != null ? `${call.file_size_bytes.toLocaleString()} bytes` : "-"}</td><td>{call.created_at ? new Date(call.created_at).toLocaleString() : "-"}</td><td><Link href={`/calls/${call.id}`}>{t("calls.open")}</Link></td></tr>)}
          </tbody></table></div>
        )}
      </section>
    </div>
  );
}
