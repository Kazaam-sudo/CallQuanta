"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DemoModeNotice, DemoQuota, demoQuotaLabel } from "../../components/DemoModeNotice";
import { useI18n } from "../../components/I18nProvider";
import { SttLanguageSelect } from "../../components/SttLanguageSelect";
import { normalizeSttLanguageCode, sttLanguageLabel } from "../../lib/i18n";

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
type CallsPayload = {
  items: Call[];
  total: number;
  limit: number;
  offset: number;
};
type LanguageFilterOption =
  | string
  | { code: string; label?: string; label_ru?: string };
type FilterOptions = {
  agents: string[];
  teams: string[];
  campaigns: string[];
  directions: string[];
  languages: LanguageFilterOption[];
  statuses: string[];
};
type JobSummary = {
  transcription_queue_length: number;
  qa_queue_length: number;
  processing: { transcribing: number; analyzing: number };
  failed: {
    transcription_failed: number;
    analysis_failed: number;
    failed?: number;
  };
  pending: { transcription_pending: number; analysis_pending: number };
  warning?: string;
};
type UploadLimits = {
  max_upload_bytes_per_file: number;
  max_bulk_upload_bytes: number;
  allowed_extensions: string[];
};
type BulkUploadResponse = {
  uploaded?: Array<{ id: number; filename: string; status: string }>;
  failed?: Array<{ filename: string; error: string }>;
};
type BatchResult = {
  call_id: number;
  status: string;
  reason?: string;
  error?: string;
  file_error?: string;
};
type BatchResponse = { results?: BatchResult[] };
type MetadataFields = {
  agent_name: string;
  team: string;
  campaign: string;
  direction: string;
  language: string;
};
type Filters = MetadataFields & {
  q: string;
  status: string;
  created_from: string;
  created_to: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";
const DIRECT_UPLOAD_BASE_URL = process.env.NEXT_PUBLIC_DIRECT_UPLOAD_BASE_URL;
const emptyMetadata: MetadataFields = {
  agent_name: "",
  team: "",
  campaign: "",
  direction: "",
  language: "",
};
const emptyFilters: Filters = {
  q: "",
  status: "",
  agent_name: "",
  team: "",
  campaign: "",
  direction: "",
  language: "",
  created_from: "",
  created_to: "",
};
const bulkMetadataStorageKey = "callquanta.bulkUploadMetadata";
const activeStatuses = new Set([
  "transcription_pending",
  "transcribing",
  "analysis_pending",
  "analyzing",
]);
const failedStatuses = new Set([
  "transcription_failed",
  "analysis_failed",
  "failed",
]);
const sortableColumns = [
  "id",
  "filename",
  "status",
  "agent_name",
  "team",
  "campaign",
  "direction",
  "language",
  "file_size_bytes",
  "created_at",
  "last_processed_at",
] as const;
type SortBy = (typeof sortableColumns)[number];

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}
function getUploadUrl() {
  return `${trimTrailingSlash(DIRECT_UPLOAD_BASE_URL || API_BASE_URL)}/calls/upload`;
}
function parseErrorDetail(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const detail =
    (data as { detail?: unknown; error?: unknown; message?: unknown }).detail ??
    (data as { error?: unknown }).error ??
    (data as { message?: unknown }).message;
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail))
    return (
      detail
        .map((item) =>
          typeof item === "string"
            ? item
            : item && typeof item === "object" && "msg" in item
              ? String((item as { msg?: unknown }).msg || "")
              : "",
        )
        .filter(Boolean)
        .join("; ") || null
    );
  return null;
}
async function responseErrorMessage(response: Response, fallback: string) {
  if (response.status === 413)
    return "File is too large for the current proxy/server limit.";
  const text = await response.text().catch(() => "");
  if (text) {
    try {
      const detail = parseErrorDetail(JSON.parse(text));
      if (detail) return detail;
    } catch {
      return (
        text
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim() || fallback
      );
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
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[index]}`;
};
const statusKey = (status: string) => `status.${status}`;
const callErrorLabel = (message: string | null | undefined, t: (key: string) => string) =>
  message === "demo_limit_reached" ? t("demo.limitReached") : message || "-";

export default function CallsPage() {
  const { t, sttLanguages, settings } = useI18n();
  const [calls, setCalls] = useState<Call[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [sortBy, setSortBy] = useState<SortBy>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    agents: [],
    teams: [],
    campaigns: [],
    directions: [],
    languages: [],
    statuses: [],
  });
  const [jobSummary, setJobSummary] = useState<JobSummary | null>(null);
  const [demoQuota, setDemoQuota] = useState<DemoQuota | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [metadata, setMetadata] = useState<MetadataFields>(emptyMetadata);
  const [bulkEdit, setBulkEdit] = useState<MetadataFields>(emptyMetadata);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<BulkUploadResponse | null>(
    null,
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const [uploadLimits, setUploadLimits] = useState<UploadLimits | null>(null);
  const [selectedCallIds, setSelectedCallIds] = useState<Set<number>>(
    new Set(),
  );
  const [batchLoading, setBatchLoading] = useState<
    "transcribe" | "analyze" | "retry" | "metadata" | "delete" | null
  >(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [uploadEndpoint, setUploadEndpoint] = useState<string>(getUploadUrl());
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
    filename: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedCallCount = selectedCallIds.size;
  const selectedCalls = useMemo(
    () => calls.filter((call) => selectedCallIds.has(call.id)),
    [calls, selectedCallIds],
  );
  const allVisibleSelected = useMemo(
    () =>
      calls.length > 0 && calls.every((call) => selectedCallIds.has(call.id)),
    [calls, selectedCallIds],
  );
  const hasActiveProcessing = useMemo(
    () =>
      calls.some((call) => activeStatuses.has(call.status)) ||
      Boolean(
        jobSummary &&
        jobSummary.transcription_queue_length +
          jobSummary.qa_queue_length +
          jobSummary.processing.transcribing +
          jobSummary.processing.analyzing +
          jobSummary.pending.transcription_pending +
          jobSummary.pending.analysis_pending >
          0,
      ),
    [calls, jobSummary],
  );
  const failedCount =
    (jobSummary?.failed.transcription_failed ?? 0) +
    (jobSummary?.failed.analysis_failed ?? 0) +
    (jobSummary?.failed.failed ?? 0);
  const selectedTotalBytes = useMemo(
    () => selectedFiles.reduce((sum, file) => sum + file.size, 0),
    [selectedFiles],
  );
  const largestSelectedBytes = useMemo(
    () => selectedFiles.reduce((max, file) => Math.max(max, file.size), 0),
    [selectedFiles],
  );
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + limit, total);

  const buildQuery = useCallback(
    (format?: string) => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value.trim()) params.set(key, value.trim());
      });
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      params.set("sort_by", sortBy);
      params.set("sort_dir", sortDir);
      if (format) params.set("format", format);
      return params;
    },
    [filters, limit, offset, sortBy, sortDir],
  );

  const loadData = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) setLoading(true);
      setLoadError(null);
      try {
        const [callsResponse, jobsResponse, optionsResponse, demoResponse] =
          await Promise.all([
            fetch(`${API_BASE_URL}/calls?${buildQuery()}`),
            fetch(`${API_BASE_URL}/jobs/summary`),
            fetch(`${API_BASE_URL}/calls/filter-options`),
            fetch(`${API_BASE_URL}/demo/status`),
          ]);
        const callsData = await callsResponse.json().catch(() => null);
        if (!callsResponse.ok)
          throw new Error(
            parseErrorDetail(callsData) ?? `HTTP ${callsResponse.status}`,
          );
        const payload: CallsPayload = Array.isArray(callsData)
          ? { items: callsData, total: callsData.length, limit, offset }
          : callsData;
        setCalls(payload.items ?? []);
        setTotal(payload.total ?? 0);
        setSelectedCallIds(
          (current) =>
            new Set(
              [...current].filter((id) =>
                (payload.items ?? []).some((call) => call.id === id),
              ),
            ),
        );
        if (jobsResponse.ok) setJobSummary(await jobsResponse.json());
        if (optionsResponse.ok) setFilterOptions(await optionsResponse.json());
        if (demoResponse.ok) setDemoQuota(await demoResponse.json());
        return true;
      } catch (error) {
        setLoadError(
          `Failed to load calls: ${error instanceof Error ? error.message : "Unknown error while loading calls."}`,
        );
        return false;
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [buildQuery, limit, offset],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(bulkMetadataStorageKey);
      if (saved)
        setMetadata({
          ...emptyMetadata,
          ...(JSON.parse(saved) as Partial<MetadataFields>),
        });
    } catch {}
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        bulkMetadataStorageKey,
        JSON.stringify(
          Object.fromEntries(
            Object.entries(metadata).filter(([, v]) => v.trim()),
          ),
        ),
      );
    } catch {}
  }, [metadata]);
  useEffect(() => {
    const loadLimits = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/settings/upload-limits`);
        if (response.ok) setUploadLimits(await response.json());
      } catch {}
    };
    loadLimits();
  }, []);
  useEffect(() => {
    if (!hasActiveProcessing) return;
    const interval = window.setInterval(() => loadData(false), 4000);
    return () => window.clearInterval(interval);
  }, [hasActiveProcessing, loadData]);

  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setOffset(0);
  };
  const resetFilters = () => {
    setFilters(emptyFilters);
    setOffset(0);
  };
  const sortHeader = (column: SortBy, label: string) => (
    <button
      className="table-sort"
      type="button"
      title={
        sortDir === "asc" ? t("calls.sortDescending") : t("calls.sortAscending")
      }
      onClick={() => {
        setOffset(0);
        if (sortBy === column) setSortDir(sortDir === "asc" ? "desc" : "asc");
        else {
          setSortBy(column);
          setSortDir("asc");
        }
      }}
    >
      {label}
      {sortBy === column ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
    </button>
  );
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
    setSelectedFiles((current) =>
      current.filter((_, index) => index !== indexToRemove),
    );
    setUploadResult(null);
    setUploadError(null);
    resetFileInput();
  };

  const onUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedFiles.length === 0) return;
    setUploadResult(null);
    setUploadError(null);
    setUploadWarning(null);
    setUploadProgress(null);
    if (
      uploadLimits &&
      uploadLimits.max_upload_bytes_per_file > 0 &&
      largestSelectedBytes > uploadLimits.max_upload_bytes_per_file
    ) {
      setUploadError(
        `${t("calls.uploadFailed")}: Upload too large. Max per file: ${formatBytes(uploadLimits.max_upload_bytes_per_file)}.`,
      );
      return;
    }
    const uploadUrl = getUploadUrl();
    setUploadEndpoint(uploadUrl);
    setUploading(true);
    const filesToUpload = [...selectedFiles];
    const result: BulkUploadResponse = { uploaded: [], failed: [] };
    for (const [index, file] of filesToUpload.entries()) {
      setUploadProgress({
        current: index + 1,
        total: filesToUpload.length,
        filename: file.name,
      });
      try {
        const uploadData = new FormData();
        uploadData.append("file", file);
        Object.entries(metadata).forEach(([key, value]) => {
          if (value.trim()) uploadData.append(key, value.trim());
        });
        const response = await fetch(uploadUrl, {
          method: "POST",
          body: uploadData,
        });
        const data = response.ok
          ? ((await response.json().catch(() => null)) as {
              id?: number;
              filename?: string;
              status?: string;
            } | null)
          : null;
        if (!response.ok) {
          result.failed?.push({
            filename: file.name,
            error: await responseErrorMessage(
              response,
              response.statusText || "Upload request failed",
            ),
          });
          continue;
        }
        result.uploaded?.push({
          id: Number(data?.id),
          filename: data?.filename || file.name,
          status: data?.status || "uploaded",
        });
      } catch {
        result.failed?.push({
          filename: file.name,
          error:
            "Network error while uploading this file through /api. Check web proxy logs.",
        });
      }
    }
    setUploading(false);
    setUploadProgress(null);
    const uploadedCount = result.uploaded?.length ?? 0;
    const failedUploadCount = result.failed?.length ?? 0;
    setUploadResult(result);
    setUploadError(
      uploadedCount === 0 && failedUploadCount > 0
        ? `${t("calls.uploadFailed")}: ${failedUploadCount} ${failedUploadCount === 1 ? "file" : "files"} failed.`
        : null,
    );
    if (failedUploadCount > 0) {
      const failedNames = new Set(result.failed?.map((item) => item.filename));
      setSelectedFiles(
        filesToUpload.filter((file) => failedNames.has(file.name)),
      );
      resetFileInput();
    } else {
      setSelectedFiles([]);
      resetFileInput();
    }
    if (uploadedCount > 0) {
      const refreshed = await loadData();
      if (!refreshed)
        setUploadWarning(
          "Upload succeeded, but calls list refresh failed. Click Refresh.",
        );
    }
  };

  const toggleCall = (callId: number) =>
    setSelectedCallIds((current) => {
      const next = new Set(current);
      next.has(callId) ? next.delete(callId) : next.add(callId);
      return next;
    });
  const toggleAllVisible = () =>
    setSelectedCallIds((current) => {
      const next = new Set(current);
      allVisibleSelected
        ? calls.forEach((call) => next.delete(call.id))
        : calls.forEach((call) => next.add(call.id));
      return next;
    });
  const clearSelection = () => setSelectedCallIds(new Set());
  const uploadedResultCount = uploadResult?.uploaded?.length ?? 0;
  const failedResultCount = uploadResult?.failed?.length ?? 0;
  const uploadResultClass =
    failedResultCount > 0 && uploadedResultCount === 0
      ? "message-error"
      : failedResultCount > 0
        ? "message-warning"
        : "message-success";

  const runBatchAction = async (action: "transcribe" | "analyze" | "retry") => {
    if (selectedCallIds.size === 0) return;
    setBatchLoading(action);
    setBatchError(null);
    setBatchResults([]);
    try {
      const endpoint = action === "retry" ? "retry-failed" : action;
      const response = await fetch(`${API_BASE_URL}/calls/batch/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call_ids: [...selectedCallIds] }),
      });
      const data = (await response
        .json()
        .catch(() => null)) as BatchResponse | null;
      if (!response.ok)
        throw new Error(parseErrorDetail(data) ?? `HTTP ${response.status}`);
      setBatchResults(data?.results ?? []);
      await loadData();
    } catch (error) {
      setBatchError(
        `${t("calls.batchActionFailed")}: ${error instanceof Error ? error.message : "Unknown error."}`,
      );
    } finally {
      setBatchLoading(null);
    }
  };
  const saveBulkMetadata = async () => {
    const updates = Object.fromEntries(
      Object.entries(bulkEdit).filter(([, value]) => value.trim()),
    );
    if (selectedCallIds.size === 0 || Object.keys(updates).length === 0) return;
    setBatchLoading("metadata");
    setBatchError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/calls/batch/metadata`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call_ids: [...selectedCallIds], ...updates }),
      });
      const data = (await response
        .json()
        .catch(() => null)) as BatchResponse | null;
      if (!response.ok)
        throw new Error(parseErrorDetail(data) ?? `HTTP ${response.status}`);
      setBatchResults(data?.results ?? []);
      setBulkEdit(emptyMetadata);
      setShowBulkEdit(false);
      await loadData();
    } catch (error) {
      setBatchError(
        `${t("calls.batchActionFailed")}: ${error instanceof Error ? error.message : "Unknown error."}`,
      );
    } finally {
      setBatchLoading(null);
    }
  };
  const deleteSelected = async () => {
    if (
      selectedCallIds.size === 0 ||
      !window.confirm(
        t("calls.deleteConfirmation").replace(
          "{count}",
          String(selectedCallIds.size),
        ),
      )
    )
      return;
    setBatchLoading("delete");
    setBatchError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/calls/batch`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          call_ids: [...selectedCallIds],
          delete_files: true,
        }),
      });
      const data = (await response
        .json()
        .catch(() => null)) as BatchResponse | null;
      if (!response.ok)
        throw new Error(parseErrorDetail(data) ?? `HTTP ${response.status}`);
      setBatchResults(data?.results ?? []);
      clearSelection();
      await loadData();
    } catch (error) {
      setBatchError(
        `${t("calls.batchActionFailed")}: ${error instanceof Error ? error.message : "Unknown error."}`,
      );
    } finally {
      setBatchLoading(null);
    }
  };
  const exportUrl = (kind: "calls" | "reviews", format: "csv" | "xlsx") =>
    `${API_BASE_URL}/${kind === "calls" ? "calls" : "qa-reviews"}/export?${buildQuery(format)}`;
  const selectedExportUrl = (
    kind: "calls" | "reviews",
    format: "csv" | "xlsx",
  ) => {
    const params = new URLSearchParams();
    params.set("format", format);
    params.set("call_ids", [...selectedCallIds].join(","));
    return `${API_BASE_URL}/${kind === "calls" ? "calls" : "qa-reviews"}/export?${params}`;
  };

  return (
    <div className="grid page-stack">
      <section className="card hero-card">
        <div>
          <h1>{t("calls.calls")}</h1>
          <p>{t("calls.processingHelp")}</p>
        </div>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => loadData()}
          disabled={loading || uploading || !!batchLoading}
        >
          {loading ? t("calls.refreshing") : t("calls.refresh")}
        </button>
      </section>
      <DemoModeNotice quota={demoQuota} />
      <section className="card">
        <div className="section-header">
          <div>
            <h2>{t("calls.processing")}</h2>
          </div>
          {jobSummary?.warning ? (
            <span className="badge badge-warning">{jobSummary.warning}</span>
          ) : null}
        </div>
        <div className="kpi-grid compact">
          <div className="kpi-card">
            <small>{t("calls.transcriptionQueue")}</small>
            <strong>{jobSummary?.transcription_queue_length ?? 0}</strong>
          </div>
          <div className="kpi-card">
            <small>{t("calls.qaQueue")}</small>
            <strong>{jobSummary?.qa_queue_length ?? 0}</strong>
          </div>
          <div className="kpi-card">
            <small>{t("calls.processing")}</small>
            <strong>
              {(jobSummary?.processing.transcribing ?? 0) +
                (jobSummary?.processing.analyzing ?? 0)}
            </strong>
          </div>
          <div className="kpi-card danger">
            <small>{t("calls.failed")}</small>
            <strong>{failedCount}</strong>
          </div>
        </div>
      </section>

      <section className="card upload-card">
        <div className="section-header">
          <div>
            <h2>{t("calls.uploadFiles")}</h2>
            <small>{t("calls.bulkMetadataHelp")}</small>
          </div>
        </div>
        <form onSubmit={onUpload} className="grid" style={{ gap: 12 }}>
          <input
            ref={fileInputRef}
            className="input-file"
            type="file"
            name="files"
            multiple
            accept="audio/*,.wav,.mp3,.m4a,.ogg,.opus,.flac,.webm"
            onChange={(event) => {
              setSelectedFiles(Array.from(event.currentTarget.files ?? []));
              setUploadResult(null);
              setUploadError(null);
              setUploadWarning(null);
            }}
          />
          <small>
            {settings.interface_language === "ru"
              ? "Поддерживаются: WAV, MP3, M4A, OGG/Opus, FLAC, WebM."
              : "Supported: WAV, MP3, M4A, OGG/Opus, FLAC, WebM."}
          </small>
          <div className="selected-files">
            <div className="selected-files-summary">
              <strong>
                {t("calls.selectedFiles")}: {selectedFiles.length} ·{" "}
                {formatBytes(selectedTotalBytes)}
              </strong>
              {selectedFiles.length > 0 && (
                <small>
                  Selected: {selectedFiles.length} files ·{" "}
                  {formatBytes(selectedTotalBytes)}
                  {uploadLimits
                    ? ` · Max per file ${formatBytes(uploadLimits.max_upload_bytes_per_file)}`
                    : ""}
                </small>
              )}
              {selectedFiles.length > 0 && (
                <button
                  className="button button-secondary button-small"
                  type="button"
                  onClick={clearSelectedFiles}
                  disabled={uploading}
                >
                  Clear all
                </button>
              )}
            </div>
            {selectedFiles.map((file, index) => (
              <span
                className="selected-file-pill"
                key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
              >
                <span title={file.name}>
                  {file.name} · {formatBytes(file.size)}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  title="Remove"
                  onClick={() => removeSelectedFile(index)}
                  disabled={uploading}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <MetadataGrid
            values={metadata}
            setValues={setMetadata}
            sttLanguages={sttLanguages}
            t={t}
          />
          <small>Empty fields will not be saved.</small>
          {uploadProgress && (
            <p className="upload-progress">
              Uploading {uploadProgress.current} of {uploadProgress.total}:{" "}
              {uploadProgress.filename}
            </p>
          )}
          <div>
            <button
              className="button"
              type="submit"
              disabled={selectedFiles.length === 0 || uploading}
            >
              {uploadProgress
                ? `Uploading ${uploadProgress.current}/${uploadProgress.total}...`
                : t("calls.uploadSelected")}
            </button>
          </div>
          {process.env.NODE_ENV !== "production" && (
            <small className="upload-endpoint">
              Upload endpoint: {uploadEndpoint}
            </small>
          )}
        </form>
        {uploadError && <p className="message message-error">{uploadError}</p>}
        {uploadWarning && (
          <p className="message message-warning">{uploadWarning}</p>
        )}
        {uploadResult && (
          <div className={`message ${uploadResultClass}`}>
            <strong>{t("calls.uploadResults")}</strong>
            <div>
              {uploadedResultCount > 0 || failedResultCount > 0
                ? `Uploaded ${uploadedResultCount} ${uploadedResultCount === 1 ? "file" : "files"}. ${failedResultCount} ${failedResultCount === 1 ? "file" : "files"} failed.`
                : "No files were uploaded."}
            </div>
            {failedResultCount > 0 && (
              <div>
                {t("calls.failed")}:{" "}
                {uploadResult.failed
                  ?.map((item) => `${item.filename} (${item.error})`)
                  .join(", ")}
              </div>
            )}
          </div>
        )}
      </section>
      <section className="card filters-card">
        <div className="section-header filters-header">
          <div>
            <h2>{t("calls.filters")}</h2>
          </div>
          <div className="filters-toolbar">
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={resetFilters}
            >
              {t("calls.resetFilters")}
            </button>
            <ExportMenu
              t={t}
              exportUrl={exportUrl}
              selectedExportUrl={
                selectedCallCount > 0 ? selectedExportUrl : undefined
              }
            />
          </div>
        </div>
        <div className="filters-grid">
          <label className="filter-search">
            {t("calls.search")}
            <input
              value={filters.q}
              onChange={(e) => updateFilter("q", e.target.value)}
              placeholder={t("calls.searchPlaceholder")}
            />
          </label>
          <FilterSelect
            label={t("calls.status")}
            value={filters.status}
            onChange={(v) => updateFilter("status", v)}
            options={filterOptions.statuses}
            allLabel={t("common.all")}
            labelFor={(v) => t(statusKey(v))}
          />
          <FilterSelect
            label={t("calls.agent")}
            value={filters.agent_name}
            onChange={(v) => updateFilter("agent_name", v)}
            options={filterOptions.agents}
            allLabel={t("common.all")}
          />
          <FilterSelect
            label={t("calls.team")}
            value={filters.team}
            onChange={(v) => updateFilter("team", v)}
            options={filterOptions.teams}
            allLabel={t("common.all")}
          />
          <FilterSelect
            label={t("calls.campaign")}
            value={filters.campaign}
            onChange={(v) => updateFilter("campaign", v)}
            options={filterOptions.campaigns}
            allLabel={t("common.all")}
          />
          <FilterSelect
            label={t("calls.direction")}
            value={filters.direction}
            onChange={(v) => updateFilter("direction", v)}
            options={[
              "inbound",
              "outbound",
              "internal",
              "unknown",
              ...filterOptions.directions.filter(
                (d) =>
                  !["inbound", "outbound", "internal", "unknown"].includes(d),
              ),
            ]}
            allLabel={t("common.all")}
          />
          <LanguageFilterSelect
            label={t("call.audioLanguage")}
            value={filters.language}
            onChange={(value) => updateFilter("language", value)}
            options={filterOptions.languages}
            sttLanguages={sttLanguages}
            t={t}
          />
          <label>
            {t("calls.dateFrom")}
            <input
              type="date"
              value={filters.created_from}
              onChange={(e) => updateFilter("created_from", e.target.value)}
            />
          </label>
          <label>
            {t("calls.dateTo")}
            <input
              type="date"
              value={filters.created_to}
              onChange={(e) => updateFilter("created_to", e.target.value)}
            />
          </label>
        </div>
      </section>

      {selectedCallCount > 0 && (
        <section className="selection-bar">
          <strong>
            {t("calls.selectedCalls")}: {selectedCallCount}
          </strong>
          {demoQuota?.enabled ? <span>{demoQuotaLabel(t, demoQuota)}</span> : null}
          <div className="selection-actions">
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={() => runBatchAction("transcribe")}
              disabled={!!batchLoading}
            >
              {batchLoading === "transcribe"
                ? t("calls.working")
                : t("calls.transcribeSelected")}
            </button>
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={() => runBatchAction("analyze")}
              disabled={!!batchLoading || Boolean(demoQuota?.enabled && demoQuota.exceeded)}
            >
              {batchLoading === "analyze"
                ? t("calls.working")
                : t("calls.analyzeSelected")}
            </button>
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={() => runBatchAction("retry")}
              disabled={
                !!batchLoading ||
                !selectedCalls.some((call) => failedStatuses.has(call.status))
              }
            >
              {batchLoading === "retry"
                ? t("calls.working")
                : t("calls.retryFailedSelected")}
            </button>
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={() => setShowBulkEdit((v) => !v)}
            >
              {t("calls.editMetadataSelected")}
            </button>
            <ExportMenu
              t={t}
              exportUrl={exportUrl}
              selectedExportUrl={selectedExportUrl}
              selectedOnly
            />
            <button
              className="button button-secondary button-small button-danger-subtle"
              type="button"
              onClick={deleteSelected}
              disabled={!!batchLoading}
            >
              {t("calls.deleteSelected")}
            </button>
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={clearSelection}
            >
              {t("calls.clearSelection")}
            </button>
          </div>
        </section>
      )}

      {showBulkEdit && selectedCallCount > 0 && (
        <section className="card">
          <div className="section-header">
            <h2>{t("calls.editMetadataSelected")}</h2>
            <button
              className="button"
              type="button"
              onClick={saveBulkMetadata}
              disabled={!!batchLoading}
            >
              {batchLoading === "metadata"
                ? t("calls.working")
                : t("call.saveMetadata")}
            </button>
          </div>
          <MetadataGrid
            values={bulkEdit}
            setValues={setBulkEdit}
            sttLanguages={sttLanguages}
            t={t}
          />
          <small>
            Empty fields are ignored and will not overwrite existing metadata.
          </small>
        </section>
      )}
      {batchResults.some((result) => result.status === "demo_limit_reached") ||
      (demoQuota?.enabled && demoQuota.exceeded) ? (
        <p className="message message-warning">{t("demo.limitReached")}</p>
      ) : null}
      <section className="card">
        <div className="table-topbar">
          <h2>
            {t("calls.calls")} ({total})
          </h2>
          <div className="pagination-controls">
            <label>
              {t("calls.pageSize")}
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setOffset(0);
                }}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
            <button
              className="button button-secondary button-small"
              type="button"
              disabled={offset === 0 || loading}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              ‹ {t("calls.previous")}
            </button>
            <span className="range-text">
              {t("calls.showing")
                .replace("{start}", String(rangeStart))
                .replace("{end}", String(rangeEnd))
                .replace("{total}", String(total))}
            </span>
            <button
              className="button button-secondary button-small"
              type="button"
              disabled={offset + limit >= total || loading}
              onClick={() => setOffset(offset + limit)}
            >
              {t("calls.next")} ›
            </button>
          </div>
        </div>
        {loadError && <p className="message message-error">{loadError}</p>}
        {loading ? (
          <p>{t("calls.loading")}</p>
        ) : calls.length === 0 ? (
          <p className="empty-state">
            {total === 0 ? t("calls.noCallsMatchFilters") : t("calls.empty")}
          </p>
        ) : (
          <div className="table-wrap calls-table-wrap">
            <table className="data-table calls-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all visible calls"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                    />
                  </th>
                  <th>{sortHeader("id", "ID")}</th>
                  <th>{sortHeader("filename", t("calls.filename"))}</th>
                  <th>{sortHeader("status", t("calls.status"))}</th>
                  <th>{sortHeader("agent_name", t("calls.agent"))}</th>
                  <th>{sortHeader("team", t("calls.team"))}</th>
                  <th>{sortHeader("campaign", t("calls.campaign"))}</th>
                  <th>{sortHeader("direction", t("calls.direction"))}</th>
                  <th>{sortHeader("language", t("call.audioLanguage"))}</th>
                  <th>{sortHeader("file_size_bytes", t("calls.fileSize"))}</th>
                  <th>{t("calls.lastError")}</th>
                  <th>
                    {sortHeader("last_processed_at", t("calls.lastProcessed"))}
                  </th>
                  <th>{sortHeader("created_at", t("calls.created"))}</th>
                  <th>{t("calls.action")}</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => (
                  <tr
                    key={call.id}
                    className={
                      selectedCallIds.has(call.id) ? "row-selected" : ""
                    }
                  >
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select call ${call.id}`}
                        checked={selectedCallIds.has(call.id)}
                        onChange={() => toggleCall(call.id)}
                      />
                    </td>
                    <td>#{call.id}</td>
                    <td className="filename-cell" title={call.filename}>
                      {call.filename}
                    </td>
                    <td>
                      <span className={`badge badge-${call.status}`}>
                        {t(statusKey(call.status))}
                      </span>
                    </td>
                    <td>{call.agent_name || "-"}</td>
                    <td className="wrap-cell">{call.team || "-"}</td>
                    <td className="wrap-cell">{call.campaign || "-"}</td>
                    <td>{call.direction || "-"}</td>
                    <td>{sttLanguageLabel(call.language, sttLanguages, t)}</td>
                    <td>{formatBytes(call.file_size_bytes)}</td>
                    <td className="error-cell">
                      {callErrorLabel(call.last_error_message, t)}
                    </td>
                    <td>
                      {call.last_processed_at
                        ? new Date(call.last_processed_at).toLocaleString()
                        : "-"}
                    </td>
                    <td>
                      {call.created_at
                        ? new Date(call.created_at).toLocaleString()
                        : "-"}
                    </td>
                    <td>
                      <Link
                        className="button button-secondary table-action"
                        href={`/calls/${call.id}`}
                      >
                        {t("calls.open")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ExportMenu({
  t,
  exportUrl,
  selectedExportUrl,
  selectedOnly = false,
}: {
  t: (key: string) => string;
  exportUrl: (kind: "calls" | "reviews", format: "csv" | "xlsx") => string;
  selectedExportUrl?: (
    kind: "calls" | "reviews",
    format: "csv" | "xlsx",
  ) => string;
  selectedOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const closeOnPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const closeMenu = () => setOpen(false);

  return (
    <div className="export-menu" ref={menuRef}>
      <button
        className="button button-secondary button-small export-menu-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {t("calls.export")}
      </button>
      {open && (
        <div className="export-menu-panel" role="menu">
          {!selectedOnly && (
            <>
              <a
                role="menuitem"
                href={exportUrl("calls", "csv")}
                onClick={closeMenu}
              >
                {t("calls.exportFilteredCallsCsv")}
              </a>
              <a
                role="menuitem"
                href={exportUrl("calls", "xlsx")}
                onClick={closeMenu}
              >
                {t("calls.exportFilteredCallsXlsx")}
              </a>
              <a
                role="menuitem"
                href={exportUrl("reviews", "csv")}
                onClick={closeMenu}
              >
                {t("calls.exportFilteredReviewsCsv")}
              </a>
              <a
                role="menuitem"
                href={exportUrl("reviews", "xlsx")}
                onClick={closeMenu}
              >
                {t("calls.exportFilteredReviewsXlsx")}
              </a>
            </>
          )}
          {selectedExportUrl && (
            <>
              <a
                role="menuitem"
                href={selectedExportUrl("calls", "csv")}
                onClick={closeMenu}
              >
                {t("calls.exportSelectedCallsCsv")}
              </a>
              <a
                role="menuitem"
                href={selectedExportUrl("calls", "xlsx")}
                onClick={closeMenu}
              >
                {t("calls.exportSelectedCallsXlsx")}
              </a>
              <a
                role="menuitem"
                href={selectedExportUrl("reviews", "csv")}
                onClick={closeMenu}
              >
                {t("calls.exportSelectedReviewsCsv")}
              </a>
              <a
                role="menuitem"
                href={selectedExportUrl("reviews", "xlsx")}
                onClick={closeMenu}
              >
                {t("calls.exportSelectedReviewsXlsx")}
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function languageOptionCode(option: LanguageFilterOption): string {
  return typeof option === "string"
    ? normalizeSttLanguageCode(option) || "auto"
    : option.code;
}
function LanguageFilterSelect({
  label,
  value,
  onChange,
  options,
  sttLanguages,
  t,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: LanguageFilterOption[];
  sttLanguages: ReturnType<typeof useI18n>["sttLanguages"];
  t: (key: string) => string;
}) {
  const catalogCodes = sttLanguages.map((language) => language.code);
  const optionCodes = options.map(languageOptionCode).filter(Boolean);
  const codes = Array.from(new Set(["auto", ...catalogCodes, ...optionCodes]));
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t("common.all")}</option>
        {codes.map((code) => (
          <option key={code} value={code}>
            {code === "auto"
              ? t("stt.auto")
              : sttLanguageLabel(code, sttLanguages, t)}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
  labelFor,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  allLabel: string;
  labelFor?: (value: string) => string;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {Array.from(new Set(options))
          .filter(Boolean)
          .map((option) => (
            <option key={option} value={option}>
              {labelFor ? labelFor(option) : option}
            </option>
          ))}
      </select>
    </label>
  );
}
function MetadataGrid({
  values,
  setValues,
  sttLanguages,
  t,
}: {
  values: MetadataFields;
  setValues: (values: MetadataFields) => void;
  sttLanguages: ReturnType<typeof useI18n>["sttLanguages"];
  t: (key: string) => string;
}) {
  return (
    <div className="grid-2">
      <label>
        {t("call.agentName")}
        <input
          value={values.agent_name}
          onChange={(event) =>
            setValues({ ...values, agent_name: event.target.value })
          }
          placeholder="Example: Shahzoda"
        />
      </label>
      <label>
        {t("call.team")}
        <input
          value={values.team}
          onChange={(event) =>
            setValues({ ...values, team: event.target.value })
          }
          placeholder="Example: Outbound Sales"
        />
      </label>
      <label>
        {t("call.campaign")}
        <input
          value={values.campaign}
          onChange={(event) =>
            setValues({ ...values, campaign: event.target.value })
          }
          placeholder="Example: Humans Promo"
        />
      </label>
      <label>
        {t("call.direction")}
        <select
          value={values.direction}
          onChange={(event) =>
            setValues({ ...values, direction: event.target.value })
          }
        >
          <option value="">-</option>
          <option value="inbound">inbound</option>
          <option value="outbound">outbound</option>
          <option value="internal">internal</option>
          <option value="unknown">unknown</option>
        </select>
      </label>
      <label>
        {t("call.audioLanguage")}
        <SttLanguageSelect
          value={values.language}
          languages={sttLanguages}
          t={t}
          onChange={(value) => setValues({ ...values, language: value })}
        />
      </label>
    </div>
  );
}
