"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../components/I18nProvider";
import { SttLanguageSelect } from "../../components/SttLanguageSelect";
import { sttLanguageLabel } from "../../lib/i18n";

type Call = {
  id: number;
  filename: string;
  status: string;
  file_size_bytes?: number | null;
  content_type?: string | null;
  agent_name?: string | null;
  team?: string | null;
  campaign?: string | null;
  direction?: string | null;
  language?: string | null;
  created_at?: string | null;
  last_error_message?: string | null;
  last_processed_at?: string | null;
};

type JobSummary = {
  transcription_queue_length: number;
  qa_queue_length: number;
  processing: { transcribing: number; analyzing: number };
  failed: { transcription_failed: number; analysis_failed: number; failed?: number };
  pending: { transcription_pending: number; analysis_pending: number };
  warning?: string;
};

type UploadLimits = {
  max_upload_bytes_per_file: number;
  max_bulk_upload_bytes: number;
  allowed_extensions: string[];
};

type BulkUploadResponse = { uploaded?: Array<{ id: number; filename: string; status: string }>; failed?: Array<{ filename: string; error: string }> };
type BatchResult = { call_id: number; status: string; reason?: string; error?: string };
type BatchResponse = { results?: BatchResult[] };
type BulkMetadata = { agent_name: string; team: string; campaign: string; direction: string; language: string };

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";
const DIRECT_UPLOAD_BASE_URL = process.env.NEXT_PUBLIC_DIRECT_UPLOAD_BASE_URL;

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function getUploadUrl() {
  const uploadBaseUrl = DIRECT_UPLOAD_BASE_URL || API_BASE_URL;
  return `${trimTrailingSlash(uploadBaseUrl)}/calls/upload`;
}
const emptyMetadata: BulkMetadata = { agent_name: "", team: "", campaign: "", direction: "", language: "" };
const bulkMetadataStorageKey = "callquanta.bulkUploadMetadata";
const activeStatuses = new Set(["transcription_pending", "transcribing", "analysis_pending", "analyzing"]);
const failedStatuses = new Set(["transcription_failed", "analysis_failed", "failed"]);

function parseErrorDetail(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const detail = (data as { detail?: unknown; error?: unknown; message?: unknown }).detail ?? (data as { error?: unknown }).error ?? (data as { message?: unknown }).message;
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((item) => typeof item === "string" ? item : item && typeof item === "object" && "msg" in item ? String((item as { msg?: unknown }).msg || "") : "").filter(Boolean);
    if (messages.length > 0) return messages.join("; ");
  }
  return null;
}

async function responseErrorMessage(response: Response, fallback: string) {
  if (response.status === 413) return "File is too large for the current proxy/server limit.";
  const text = await response.text().catch(() => "");
  if (text) {
    try {
      const parsed = JSON.parse(text) as unknown;
      const detail = parseErrorDetail(parsed);
      if (detail) return detail;
    } catch {
      return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || fallback;
    }
  }
  return fallback;
}

const formatBytes = (value?: number | null) => {
  if (value == null) return "-";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[index]}`;
};

const statusKey = (status: string) => `status.${status}`;

export default function CallsPage() {
  const { t, sttLanguages } = useI18n();
  const [calls, setCalls] = useState<Call[]>([]);
  const [jobSummary, setJobSummary] = useState<JobSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [metadata, setMetadata] = useState<BulkMetadata>(emptyMetadata);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<BulkUploadResponse | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const [uploadLimits, setUploadLimits] = useState<UploadLimits | null>(null);
  const [selectedCallIds, setSelectedCallIds] = useState<Set<number>>(new Set());
  const [batchLoading, setBatchLoading] = useState<"transcribe" | "analyze" | "retry" | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [uploadEndpoint, setUploadEndpoint] = useState<string>(getUploadUrl());
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; filename: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedCallCount = selectedCallIds.size;
  const selectedCalls = useMemo(() => calls.filter((call) => selectedCallIds.has(call.id)), [calls, selectedCallIds]);
  const allVisibleSelected = useMemo(() => calls.length > 0 && calls.every((call) => selectedCallIds.has(call.id)), [calls, selectedCallIds]);
  const hasActiveProcessing = useMemo(() => calls.some((call) => activeStatuses.has(call.status)) || Boolean(jobSummary && (jobSummary.transcription_queue_length + jobSummary.qa_queue_length + jobSummary.processing.transcribing + jobSummary.processing.analyzing + jobSummary.pending.transcription_pending + jobSummary.pending.analysis_pending) > 0), [calls, jobSummary]);
  const failedCount = (jobSummary?.failed.transcription_failed ?? 0) + (jobSummary?.failed.analysis_failed ?? 0) + (jobSummary?.failed.failed ?? 0);
  const selectedTotalBytes = useMemo(() => selectedFiles.reduce((sum, file) => sum + file.size, 0), [selectedFiles]);
  const largestSelectedBytes = useMemo(() => selectedFiles.reduce((max, file) => Math.max(max, file.size), 0), [selectedFiles]);

  const loadData = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setLoadError(null);
    try {
      const [callsResponse, jobsResponse] = await Promise.all([fetch(`${API_BASE_URL}/calls`), fetch(`${API_BASE_URL}/jobs/summary`)]);
      const callsData = await callsResponse.json().catch(() => null);
      if (!callsResponse.ok) throw new Error(parseErrorDetail(callsData) ?? `HTTP ${callsResponse.status}`);
      if (!Array.isArray(callsData)) throw new Error("API returned an unexpected calls payload.");
      setCalls(callsData as Call[]);
      setSelectedCallIds((current) => new Set([...current].filter((id) => (callsData as Call[]).some((call) => call.id === id))));
      if (jobsResponse.ok) setJobSummary(await jobsResponse.json());
      return true;
    } catch (error) {
      setLoadError(`Failed to load calls: ${error instanceof Error ? error.message : "Unknown error while loading calls."}`);
      return false;
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    try {
      const savedMetadata = window.localStorage.getItem(bulkMetadataStorageKey);
      if (savedMetadata) setMetadata({ ...emptyMetadata, ...(JSON.parse(savedMetadata) as Partial<BulkMetadata>) });
    } catch {
      // Remembered metadata is a convenience only; ignore unavailable or malformed storage.
    }
  }, []);
  useEffect(() => {
    try {
      const savedMetadata = Object.fromEntries(Object.entries(metadata).filter(([, value]) => value.trim())) as BulkMetadata;
      window.localStorage.setItem(bulkMetadataStorageKey, JSON.stringify(savedMetadata));
    } catch {}
  }, [metadata]);
  useEffect(() => {
    const loadLimits = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/settings/upload-limits`);
        if (response.ok) setUploadLimits(await response.json());
      } catch {
        // Upload limits are advisory in the UI; backend validation still applies.
      }
    };
    loadLimits();
  }, []);
  useEffect(() => {
    if (!hasActiveProcessing) return;
    const interval = window.setInterval(() => loadData(false), 4000);
    return () => window.clearInterval(interval);
  }, [hasActiveProcessing, loadData]);

  const resetFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const clearSelectedFiles = () => {
    setSelectedFiles([]);
    setUploadResult(null);
    setUploadError(null);
    setUploadWarning(null);
    setUploadProgress(null);
    resetFileInput();
  };

  const removeSelectedFile = (indexToRemove: number) => {
    setSelectedFiles((current) => current.filter((_, index) => index !== indexToRemove));
    setUploadResult(null);
    setUploadError(null);
    resetFileInput();
  };

  const onUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedFiles.length === 0) return;
    setUploadResult(null); setUploadError(null); setUploadWarning(null); setUploadProgress(null);
    if (uploadLimits) {
      const fileLimitExceeded = uploadLimits.max_upload_bytes_per_file > 0 && largestSelectedBytes > uploadLimits.max_upload_bytes_per_file;
      if (fileLimitExceeded) {
        setUploadError(`${t("calls.uploadFailed")}: Upload too large. Max per file: ${formatBytes(uploadLimits.max_upload_bytes_per_file)}.`);
        return;
      }
    }
    const uploadUrl = getUploadUrl();
    setUploadEndpoint(uploadUrl);
    setUploading(true);
    const filesToUpload = [...selectedFiles];
    const result: BulkUploadResponse = { uploaded: [], failed: [] };

    for (const [index, file] of filesToUpload.entries()) {
      setUploadProgress({ current: index + 1, total: filesToUpload.length, filename: file.name });
      try {
        const uploadData = new FormData();
        uploadData.append("file", file);
        Object.entries(metadata).forEach(([key, value]) => { if (value.trim()) uploadData.append(key, value.trim()); });
        const response = await fetch(uploadUrl, { method: "POST", body: uploadData });
        const data = response.ok ? await response.json().catch(() => null) as { id?: number; filename?: string; status?: string } | null : null;
        if (!response.ok) {
          const detail = await responseErrorMessage(response, response.statusText || "Upload request failed");
          result.failed?.push({ filename: file.name, error: detail });
          continue;
        }
        result.uploaded?.push({ id: Number(data?.id), filename: data?.filename || file.name, status: data?.status || "uploaded" });
      } catch {
        result.failed?.push({ filename: file.name, error: "Network error while uploading this file through /api. Check web proxy logs." });
      }
    }

    setUploading(false);
    setUploadProgress(null);

    const uploadedCount = result.uploaded?.length ?? 0;
    const failedCount = result.failed?.length ?? 0;
    setUploadResult(result);
    setUploadError(uploadedCount === 0 && failedCount > 0 ? `${t("calls.uploadFailed")}: ${failedCount} ${failedCount === 1 ? "file" : "files"} failed.` : null);

    if (failedCount > 0) {
      const failedNames = new Set(result.failed?.map((item) => item.filename));
      setSelectedFiles(filesToUpload.filter((file) => failedNames.has(file.name)));
      resetFileInput();
    } else {
      setSelectedFiles([]);
      resetFileInput();
    }

    if (uploadedCount > 0) {
      try {
        const refreshed = await loadData();
        if (!refreshed) setUploadWarning("Upload succeeded, but calls list refresh failed. Click Refresh.");
      } catch {
        setUploadWarning("Upload succeeded, but calls list refresh failed. Click Refresh.");
      }
    }
  };

  const toggleCall = (callId: number) => setSelectedCallIds((current) => { const next = new Set(current); next.has(callId) ? next.delete(callId) : next.add(callId); return next; });
  const toggleAllVisible = () => setSelectedCallIds((current) => { const next = new Set(current); allVisibleSelected ? calls.forEach((call) => next.delete(call.id)) : calls.forEach((call) => next.add(call.id)); return next; });
  const clearSelection = () => setSelectedCallIds(new Set());

  const uploadedResultCount = uploadResult?.uploaded?.length ?? 0;
  const failedResultCount = uploadResult?.failed?.length ?? 0;
  const uploadResultClass = failedResultCount > 0 && uploadedResultCount === 0 ? "message-error" : failedResultCount > 0 ? "message-warning" : "message-success";

  const runBatchAction = async (action: "transcribe" | "analyze" | "retry") => {
    if (selectedCallIds.size === 0) return;
    setBatchLoading(action); setBatchError(null); setBatchResults([]);
    try {
      const endpoint = action === "retry" ? "retry-failed" : action;
      const response = await fetch(`${API_BASE_URL}/calls/batch/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ call_ids: [...selectedCallIds] }) });
      const data = await response.json().catch(() => null) as BatchResponse | null;
      if (!response.ok) throw new Error(parseErrorDetail(data) ?? `HTTP ${response.status}`);
      setBatchResults(data?.results ?? []);
      await loadData();
    } catch (error) {
      setBatchError(`${t("calls.batchActionFailed")}: ${error instanceof Error ? error.message : "Unknown error."}`);
    } finally { setBatchLoading(null); }
  };

  return (
    <div className="grid page-stack">
      <section className="card hero-card">
        <div><p className="eyebrow">CallQuanta v0.15.6</p><h1>{t("calls.calls")}</h1><p>{t("calls.processingHelp")}</p></div>
        <button className="button button-secondary" type="button" onClick={() => loadData()} disabled={loading || uploading || !!batchLoading}>{loading ? t("calls.refreshing") : t("calls.refresh")}</button>
      </section>

      <section className="card">
        <div className="section-header"><div><p className="eyebrow">{t("calls.jobSummary")}</p><h2>{t("calls.processing")}</h2></div>{jobSummary?.warning ? <span className="badge badge-warning">{jobSummary.warning}</span> : null}</div>
        <div className="kpi-grid compact">
          <div className="kpi-card"><small>{t("calls.transcriptionQueue")}</small><strong>{jobSummary?.transcription_queue_length ?? 0}</strong></div>
          <div className="kpi-card"><small>{t("calls.qaQueue")}</small><strong>{jobSummary?.qa_queue_length ?? 0}</strong></div>
          <div className="kpi-card"><small>{t("status.transcribing")}</small><strong>{jobSummary?.processing.transcribing ?? 0}</strong></div>
          <div className="kpi-card"><small>{t("status.analyzing")}</small><strong>{jobSummary?.processing.analyzing ?? 0}</strong></div>
          <div className="kpi-card danger"><small>{t("calls.failed")}</small><strong>{failedCount}</strong></div>
        </div>
      </section>

      <section className="card upload-card">
        <div className="section-header"><div><p className="eyebrow">{t("calls.upload")}</p><h2>{t("calls.uploadFiles")}</h2><small>{t("calls.bulkMetadataHelp")}</small></div></div>
        <form onSubmit={onUpload} className="grid" style={{ gap: 12 }}>
          <input ref={fileInputRef} className="input-file" type="file" name="files" multiple accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac,.webm" onChange={(event) => { setSelectedFiles(Array.from(event.currentTarget.files ?? [])); setUploadResult(null); setUploadError(null); setUploadWarning(null); }} />
          <div className="selected-files">
            <div className="selected-files-summary">
              <strong>{t("calls.selectedFiles")}: {selectedFiles.length} · {formatBytes(selectedTotalBytes)}</strong>
              {selectedFiles.length > 0 && <small>Selected: {selectedFiles.length} files · {formatBytes(selectedTotalBytes)}{uploadLimits ? ` · Max per file ${formatBytes(uploadLimits.max_upload_bytes_per_file)}` : ""}</small>}
              {selectedFiles.length > 0 && <button className="button button-secondary button-small" type="button" onClick={clearSelectedFiles} disabled={uploading}>Clear all</button>}
            </div>
            {selectedFiles.map((file, index) => (
              <span className="selected-file-pill" key={`${file.name}-${file.size}-${file.lastModified}-${index}`}>
                <span title={file.name}>{file.name} · {formatBytes(file.size)}</span>
                <button type="button" aria-label={`Remove ${file.name}`} title="Remove" onClick={() => removeSelectedFile(index)} disabled={uploading}>×</button>
              </span>
            ))}
          </div>
          <div className="grid-2">
            <label>{t("call.agentName")}<input value={metadata.agent_name} onChange={(event) => setMetadata({ ...metadata, agent_name: event.target.value })} placeholder="Example: Shahzoda" /></label>
            <label>{t("call.team")}<input value={metadata.team} onChange={(event) => setMetadata({ ...metadata, team: event.target.value })} placeholder="Example: Outbound Sales" /></label>
            <label>{t("call.campaign")}<input value={metadata.campaign} onChange={(event) => setMetadata({ ...metadata, campaign: event.target.value })} placeholder="Example: Humans Promo" /></label>
            <label>{t("call.direction")}<select value={metadata.direction} onChange={(event) => setMetadata({ ...metadata, direction: event.target.value })}><option value="">-</option><option value="inbound">inbound</option><option value="outbound">outbound</option><option value="unknown">unknown</option></select></label>
            <label>{t("call.audioLanguage")}<SttLanguageSelect value={metadata.language} languages={sttLanguages} t={t} onChange={(value) => setMetadata({ ...metadata, language: value })} /></label>
          </div>
          <small>Empty fields will not be saved.</small>
          {uploadProgress && <p className="upload-progress">Uploading {uploadProgress.current} of {uploadProgress.total}: {uploadProgress.filename}</p>}
          <div><button className="button" type="submit" disabled={selectedFiles.length === 0 || uploading}>{uploadProgress ? `Uploading ${uploadProgress.current}/${uploadProgress.total}...` : t("calls.uploadSelected")}</button></div>
          {process.env.NODE_ENV !== "production" && <small className="upload-endpoint">Upload endpoint: {uploadEndpoint}</small>}
        </form>
        {uploadError && <p className="message message-error">{uploadError}</p>}
        {uploadWarning && <p className="message message-warning">{uploadWarning}</p>}
        {uploadResult && <div className={`message ${uploadResultClass}`}><strong>{t("calls.uploadResults")}</strong><div>{uploadedResultCount > 0 || failedResultCount > 0 ? `Uploaded ${uploadedResultCount} ${uploadedResultCount === 1 ? "file" : "files"}. ${failedResultCount} ${failedResultCount === 1 ? "file" : "files"} failed.` : "No files were uploaded."}</div>{failedResultCount > 0 && <div>{t("calls.failed")}: {uploadResult.failed?.map((item) => `${item.filename} (${item.error})`).join(", ")}</div>}</div>}
      </section>

      {selectedCallCount > 0 && <section className="selection-bar"><strong>{t("calls.selectedCalls")}: {selectedCallCount}</strong><button className="button" type="button" onClick={() => runBatchAction("transcribe")} disabled={!!batchLoading}>{batchLoading === "transcribe" ? t("calls.working") : t("calls.transcribeSelected")}</button><button className="button" type="button" onClick={() => runBatchAction("analyze")} disabled={!!batchLoading}>{batchLoading === "analyze" ? t("calls.working") : t("calls.analyzeSelected")}</button><button className="button button-danger" type="button" onClick={() => runBatchAction("retry")} disabled={!!batchLoading || !selectedCalls.some((call) => failedStatuses.has(call.status))}>{batchLoading === "retry" ? t("calls.working") : t("calls.retryFailedSelected")}</button><button className="button button-secondary" type="button" onClick={clearSelection}>{t("calls.clearSelection")}</button></section>}

      {batchResults.length > 0 && <section className="card"><div className="section-header"><h2>{t("calls.batchResults")}</h2></div><div className="table-wrap"><table><thead><tr><th>ID</th><th>{t("calls.status")}</th><th>{t("calls.reason")}</th></tr></thead><tbody>{batchResults.map((item) => <tr key={`${item.call_id}-${item.status}`}><td>#{item.call_id}</td><td><span className={`badge ${item.status.includes("queued") ? "badge-transcription_pending" : item.status === "skipped" ? "badge-uploaded" : item.status === "failed" || item.status === "not_found" ? "badge-analysis_failed" : ""}`}>{item.status.includes("queued") ? t("calls.queued") : item.status === "skipped" ? t("calls.skipped") : item.status}</span></td><td>{item.reason || item.error || "-"}</td></tr>)}</tbody></table></div></section>}
      {batchError && <p className="message message-error">{batchError}</p>}

      <section className="card">
        <div className="section-header"><h2>{t("calls.calls")} ({calls.length})</h2></div>
        {loadError && <p className="message message-error">{loadError}</p>}
        {loading ? <p>{t("calls.loading")}</p> : calls.length === 0 ? <p className="empty-state">{t("calls.empty")}</p> : (
          <div className="table-wrap"><table className="data-table"><thead><tr><th><input type="checkbox" aria-label="Select all visible calls" checked={allVisibleSelected} onChange={toggleAllVisible} /></th><th>ID</th><th>{t("calls.filename")}</th><th>{t("calls.status")}</th><th>{t("calls.agent")}</th><th>{t("calls.team")}</th><th>{t("calls.campaign")}</th><th>{t("calls.direction")}</th><th>{t("call.audioLanguage")}</th><th>{t("calls.fileSize")}</th><th>{t("calls.lastError")}</th><th>{t("calls.lastProcessed")}</th><th>{t("calls.created")}</th><th>{t("calls.action")}</th></tr></thead><tbody>
            {calls.map((call) => <tr key={call.id} className={selectedCallIds.has(call.id) ? "row-selected" : ""}><td><input type="checkbox" aria-label={`Select call ${call.id}`} checked={selectedCallIds.has(call.id)} onChange={() => toggleCall(call.id)} /></td><td>#{call.id}</td><td className="filename-cell" title={call.filename}>{call.filename}</td><td><span className={`badge badge-${call.status}`}>{t(statusKey(call.status))}</span></td><td>{call.agent_name || "-"}</td><td>{call.team || "-"}</td><td>{call.campaign || "-"}</td><td>{call.direction || "-"}</td><td>{sttLanguageLabel(call.language, sttLanguages, t)}</td><td>{formatBytes(call.file_size_bytes)}</td><td className="error-cell">{call.last_error_message || "-"}</td><td>{call.last_processed_at ? new Date(call.last_processed_at).toLocaleString() : "-"}</td><td>{call.created_at ? new Date(call.created_at).toLocaleString() : "-"}</td><td><Link className="button button-secondary table-action" href={`/calls/${call.id}`}>{t("calls.open")}</Link></td></tr>)}
          </tbody></table></div>
        )}
      </section>
    </div>
  );
}
