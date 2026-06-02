"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../../../components/I18nProvider";
import { SttLanguageSelect } from "../../../components/SttLanguageSelect";
import { normalizeSttLanguageCode, sttLanguageLabel } from "../../../lib/i18n";

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
  direction?: "inbound" | "outbound" | "unknown" | null;
  language?: string | null;
  created_at?: string | null;
  last_error_message?: string | null;
  last_processed_at?: string | null;
  stt_provider_name?: string | null;
  stt_provider_type?: string | null;
  stt_model?: string | null;
  stt_language_used?: string | null;
  detected_language?: string | null;
};

type TranscriptSegment = {
  id: number;
  speaker: string;
  start_ms: number;
  end_ms: number;
  text: string;
};

type QAFinding = { id?: number; severity: string; evidence: string };
type QACriterion = {
  id: string;
  title: string;
  score: number | string;
  max_points: number | string;
  comment: string;
  evidence: string;
  severity: string;
};
type QAReview = { id: number; created_at?: string; status?: string; score: number; summary: string; analysis_mode?: string; provider_name?: string; provider_preset?: string; model?: string; scorecard_name?: string; report_language?: string; legacy_review?: boolean; criteria: QACriterion[]; findings: QAFinding[] };
type QAReviewCompact = { id:number; created_at?:string; status:string; score?:number; provider_name?:string; model?:string; scorecard_name?:string; report_language?:string; analysis_mode?:string; legacy_review?:boolean };

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

const msToSeconds = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

export default function CallDetailsPage({ params }: { params: { id: string } }) {
  const { t, sttLanguages } = useI18n();
  const [call, setCall] = useState<Call | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [review, setReview] = useState<QAReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<QAReviewCompact[]>([]);
  const [viewingReviewId, setViewingReviewId] = useState<number | null>(null);
  const [viewLoadingReviewId, setViewLoadingReviewId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [metadataSaving, setMetadataSaving] = useState(false);
  const [metadataSaveSuccess, setMetadataSaveSuccess] = useState(false);
  const [metadataMessage, setMetadataMessage] = useState<string | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState({ agent_name: "", team: "", campaign: "", direction: "unknown", language: "" });
  const [sttSettings, setSttSettings] = useState<{ mode: string; model: string; provider?: { name?: string; provider_type?: string; model?: string } | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [callResponse, transcriptResponse, qaResponse, historyResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/calls/${params.id}`),
        fetch(`${API_BASE_URL}/calls/${params.id}/transcript`),
        fetch(`${API_BASE_URL}/calls/${params.id}/qa`),
        fetch(`${API_BASE_URL}/calls/${params.id}/qa/reviews`),
      ]);
      if (!callResponse.ok) {
        setError("Call not found.");
        return;
      }
      const callData = await callResponse.json();
      setCall(callData);
      setMetadata({
        agent_name: callData.agent_name || "",
        team: callData.team || "",
        campaign: callData.campaign || "",
        direction: callData.direction || "unknown",
        language: callData.language || "",
      });
      if (transcriptResponse.ok) {
        const transcriptData = await transcriptResponse.json();
        setSegments(transcriptData.segments || []);
      }
      if (qaResponse.ok) { const qaData = await qaResponse.json(); setReview(qaData.review || null); setViewingReviewId(qaData.review?.id ?? null); }
      if (historyResponse.ok) { const hist = await historyResponse.json(); setHistory(hist.reviews || []); }
      fetch(`${API_BASE_URL}/settings/stt`).then((res) => res.ok ? res.json() : null).then((data) => { if (data) setSttSettings(data); }).catch(() => {});
    } catch {
      setError("Failed to load call.");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!["transcription_pending", "transcribing", "analysis_pending", "analyzing"].includes(call?.status || "")) return;
    const interval = setInterval(() => {
      load();
    }, 2000);
    return () => clearInterval(interval);
  }, [call?.status, load]);

  const transcribe = async () => {
    if (!call || transcribing) return;
    try {
      setError(null);
      setTranscribing(true);
      const response = await fetch(`${API_BASE_URL}/calls/${params.id}/transcribe`, { method: "POST" });
      if (!response.ok) {
        let detail = "Failed to enqueue transcription.";
        try {
          const data = await response.json();
          if (typeof data?.detail === "string" && data.detail) detail = data.detail;
        } catch {}
        setError(`Transcribe request failed: ${detail}`);
        return;
      }
      await load();
    } catch {
      setError("Transcribe request failed: Network error.");
    } finally {
      setTranscribing(false);
    }
  };

  const analyze = async () => {
    if (!call || analyzing || segments.length === 0 || call.status === "analysis_pending") return;
    try {
      setError(null);
      setAnalyzing(true);
      const response = await fetch(`${API_BASE_URL}/calls/${params.id}/analyze`, { method: "POST" });
      if (!response.ok) {
        let detail = "Failed to enqueue analysis.";
        try {
          const data = await response.json();
          if (typeof data?.detail === "string" && data.detail) detail = data.detail;
        } catch {}
        setError(`Analyze request failed: ${detail}`);
        return;
      }
      await load();
    } catch {
      setError("Analyze request failed: Network error.");
    } finally {
      setAnalyzing(false);
    }
  };

  const saveMetadata = async () => {
    if (!call || metadataSaving) return;
    try {
      setMetadataSaving(true);
      setMetadataSaveSuccess(false);
      setMetadataMessage(null);
      setMetadataError(null);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/calls/${params.id}/metadata`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metadata),
      });
      if (!response.ok) {
        let detail = "Unknown error";
        const raw = await response.text().catch(() => "");
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (typeof parsed?.detail === "string" && parsed.detail) detail = parsed.detail;
            else if (parsed?.detail != null) detail = JSON.stringify(parsed.detail);
            else detail = raw;
          } catch {
            detail = raw;
          }
        }
        throw new Error(`Failed to save metadata: ${detail}`);
      }
      const updated = await response.json();
      setCall(updated);
      setMetadata({
        agent_name: updated.agent_name || "",
        team: updated.team || "",
        campaign: updated.campaign || "",
        direction: updated.direction || "unknown",
        language: updated.language || "",
      });
      setMetadataSaveSuccess(true);
      setMetadataMessage("Metadata saved.");
      setTimeout(() => {
        setMetadataSaveSuccess(false);
        setMetadataMessage(null);
      }, 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save metadata: Unknown error";
      setMetadataError(message);
      setMetadataSaveSuccess(false);
    } finally {
      setMetadataSaving(false);
    }
  };

  const pendingState = useMemo(() => call?.status === "transcription_pending" || call?.status === "transcribing" || transcribing, [call?.status, transcribing]);
  const analysisPendingState = useMemo(() => call?.status === "analysis_pending" || call?.status === "analyzing" || analyzing, [call?.status, analyzing]);
  const canAnalyzeAgain = call?.status === "analyzed" || call?.status === "analysis_failed";
  const latestReviewId = history[0]?.id ?? review?.id ?? null;
  const viewingLatest = viewingReviewId != null && latestReviewId != null && viewingReviewId === latestReviewId;

  const providerMeta = useMemo(() => {
    const metaEvidence = review?.findings?.find((finding) => finding.evidence.startsWith("Analysis mode:"))?.evidence || "";
    const chunks = metaEvidence.split(";").map((x) => x.trim());
    const out: Record<string, string> = {};
    for (const chunk of chunks) {
      const [k, ...v] = chunk.split(":");
      if (!k || v.length === 0) continue;
      out[k.toLowerCase()] = v.join(":").trim();
    }
    return out;
  }, [review]);


  const viewReview = async (reviewId: number) => {
    if (viewingReviewId === reviewId) {
      setError("Selected review is already being viewed.");
      return;
    }
    try {
      setError(null);
      setViewLoadingReviewId(reviewId);
      const res = await fetch(`${API_BASE_URL}/calls/${params.id}/qa/reviews/${reviewId}`);
      if (!res.ok) {
        let detail = `Failed to load review #${reviewId}.`;
        try {
          const raw = await res.text();
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (parsed?.detail) detail = typeof parsed.detail === "string" ? parsed.detail : JSON.stringify(parsed.detail);
            } catch {
              detail = raw;
            }
          }
        } catch {}
        throw new Error(detail);
      }
      const data = await res.json();
      setReview(data.review || null);
      setViewingReviewId(reviewId);
      document.getElementById("qa-review-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load selected review.");
    } finally {
      setViewLoadingReviewId(null);
    }
  };

  const exportUrl = (kind: "history"|"single", format: "xlsx"|"csv") => kind === "history"
    ? `${API_BASE_URL}/calls/${params.id}/qa/reviews/export?format=${format}`
    : `${API_BASE_URL}/calls/${params.id}/qa/reviews/${viewingReviewId}/export?format=${format}`;

  const latestFailureHint = useMemo(() => {
    const warning = review?.findings?.find((f) => f.severity === "warning" && f.evidence.toLowerCase().includes("parse error"));
    return warning?.evidence;
  }, [review]);

  const recoveredReview = useMemo(
    () =>
      review?.findings?.some((finding) =>
        finding.evidence.toLowerCase().includes("partially recovered from an imperfect llm response"),
      ) ?? false,
    [review],
  );

  return (
    <div className="grid" style={{ gap: 16 }}>
      <p style={{ margin: 0 }}><Link href="/calls">← Back to Calls</Link></p>

      <section className="card">
        <div className="actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Call #{call?.id ?? params.id}</h2>
          {call?.status && <span className={`badge badge-${call.status}`}>{call.status.replaceAll("_", " ")}</span>}
        </div>

        <div className="actions" style={{ marginTop: 14 }}>
          <button className="button button-secondary" onClick={load}>{t("call.refresh")}</button>
          <button className="button" onClick={transcribe} disabled={!call || loading || transcribing}>
            {transcribing ? "Transcribing..." : t("call.transcribe")}
          </button>
          <button className="button" onClick={analyze} disabled={!call || loading || analyzing || segments.length === 0 || call.status === "analysis_pending"}>
            {analysisPendingState ? "Analyzing..." : canAnalyzeAgain ? t("call.analyzeAgain") : t("call.analyze")}
          </button>
        </div>

        {pendingState && <p className="message">Transcription is in progress. Auto-refreshing every 2 seconds.</p>}
        {analysisPendingState && <p className="message">QA analysis is in progress. Auto-refreshing every 2 seconds.</p>}
        {call?.last_error_message && (
          <p className="message message-error">
            <strong>{t("calls.lastError")}:</strong> {call.last_error_message}
            {latestFailureHint ? ` Latest hint: ${latestFailureHint}` : ""}
          </p>
        )}
        {error && <p className="message message-error">{error}</p>}
        {loading && <p>Loading...</p>}

        {call && (
          <div className="meta-grid" style={{ marginTop: 10 }}>
            <div className="meta-item"><small>Filename</small>{call.filename}</div>
            <div className="meta-item"><small>Created</small>{call.created_at ? new Date(call.created_at).toLocaleString() : "-"}</div>
            <div className="meta-item"><small>{t("calls.fileSize")}</small>{call.file_size_bytes != null ? `${call.file_size_bytes.toLocaleString()} bytes` : "-"}</div>
            <div className="meta-item"><small>Content type</small>{call.content_type || "-"}</div>
            <div className="meta-item"><small>{t("calls.lastProcessed")}</small>{call.last_processed_at ? new Date(call.last_processed_at).toLocaleString() : "-"}</div>
          </div>
        )}
      </section>
      <section className="card">
        <h3 style={{ marginTop: 0 }}>{t("call.metadata")}</h3>
        <div className="grid" style={{ gap: 10 }}>
          <label>{t("call.agentName")}<input value={metadata.agent_name} onChange={(e) => setMetadata((m) => ({ ...m, agent_name: e.target.value }))} /></label>
          <label>{t("call.team")}<input value={metadata.team} onChange={(e) => setMetadata((m) => ({ ...m, team: e.target.value }))} /></label>
          <label>{t("call.campaign")}<input value={metadata.campaign} onChange={(e) => setMetadata((m) => ({ ...m, campaign: e.target.value }))} /></label>
          <label>{t("call.direction")}
            <select value={metadata.direction} onChange={(e) => setMetadata((m) => ({ ...m, direction: e.target.value }))}>
              <option value="unknown">unknown</option>
              <option value="inbound">inbound</option>
              <option value="outbound">outbound</option>
            </select>
          </label>
          <label>{t("call.audioLanguage")}<SttLanguageSelect value={metadata.language} languages={sttLanguages} t={t} onChange={(value) => setMetadata((m) => ({ ...m, language: value }))} /></label>
          <div>
            <button className="button" onClick={saveMetadata} disabled={metadataSaving}>
              {metadataSaving ? "Saving..." : metadataSaveSuccess ? t("call.metadataSaved") : t("call.saveMetadata")}
            </button>
            {metadataMessage && <p className="message" style={{ marginTop: 8 }}>{metadataMessage}</p>}
            {metadataError && <p className="message message-error" style={{ marginTop: 8 }}>{metadataError}</p>}
          </div>
        </div>
      </section>

      <section className="card" id="qa-review-section">
        <h3 style={{ marginTop: 0 }}>{t("call.qaReview")}</h3>
        {!review ? <p>QA review is not available yet. Run analysis after transcription completes.</p> : (
          <div className="grid" style={{ gap: 10 }}>
            <p className="message" style={{ marginTop: 0 }}>
              <strong>{viewingLatest ? "Viewing latest review" : "Viewing previous review"} #{review.id}</strong> · {new Date(review.created_at || "").toLocaleString()}
              {review.legacy_review ? " · Legacy review — created before v0.10.0 history metadata was fully captured." : ""}
            </p>
            <div><strong>Score:</strong> <span className="badge">{review.score}</span></div>
            <div><strong>Analysis mode:</strong> {review.legacy_review ? (review.analysis_mode || providerMeta["analysis mode"] ? "Recovered metadata" : "Not captured") : (review.analysis_mode || "Not captured")}</div>
            <div><strong>Provider:</strong> {review.legacy_review ? (review.provider_name || providerMeta["provider"] ? "Recovered metadata" : "Not captured") : (review.provider_name || "Not captured")}</div>
            <div><strong>Preset:</strong> {review.legacy_review ? (review.provider_preset || providerMeta["preset"] ? "Recovered metadata" : "Not captured") : (review.provider_preset || "Not captured")}</div>
            <div><strong>Model:</strong> {review.legacy_review ? (review.model || providerMeta["model"] ? "Recovered metadata" : "Not captured") : (review.model || "Not captured")}</div>
            <div><strong>Scorecard:</strong> {review.legacy_review ? (review.scorecard_name || providerMeta["scorecard"] ? "Recovered metadata" : "Not captured") : (review.scorecard_name || "Not captured")}</div>
            <div><strong>Report language:</strong> {review.legacy_review ? (review.report_language || providerMeta["report language"] ? "Recovered metadata" : "Not captured") : (review.report_language || "Not captured")}</div>
            {recoveredReview && (
              <p className="message message-warning">
                This review was partially recovered from an imperfect LLM response.
              </p>
            )}
            <div><strong>Summary:</strong> {review.summary}</div>
            <div>
              <strong>Criteria breakdown:</strong>
              <div className="grid" style={{ gap: 8, marginTop: 8 }}>
                {review.criteria?.filter((criterion) => Number(criterion.max_points) > 0).length === 0 ? (
                  <p className="message">No criteria breakdown captured for this review.</p>
                ) : review.criteria
                  ?.filter((criterion) => Number(criterion.max_points) > 0)
                  .map((criterion, index) => {
                    const fallbackGenerated =
                      criterion.comment === "No valid model assessment was returned for this criterion." ||
                      criterion.evidence === "No clear evidence found in transcript.";
                    return (
                    <article
                      key={criterion.id}
                      className="segment"
                      style={{ marginBottom: 0, borderColor: fallbackGenerated ? "#f59e0b" : undefined }}
                    >
                      <div>
                        <span className="badge">#{index + 1}</span>{" "}
                        <span className={`badge badge-${criterion.severity}`}>{criterion.severity}</span>{" "}
                        <strong>{criterion.title}</strong>
                      </div>
                      <div><strong>Score:</strong> <strong>{criterion.score}</strong> / <strong>{criterion.max_points}</strong></div>
                      {fallbackGenerated && (
                        <div className="message" style={{ marginTop: 8, marginBottom: 8, background: "#fffbeb", color: "#92400e" }}>
                          Fallback-generated criterion details (model output was incomplete for this criterion).
                        </div>
                      )}
                      <div><strong>Comment:</strong> {criterion.comment}</div>
                      <div><strong>Evidence:</strong> {criterion.evidence}</div>
                    </article>
                  )})}
              </div>
            </div>
            <div>
              <strong>Findings:</strong>
              <ul>
                {review.findings.map((finding) => (
                  <li key={finding.id}>
                    <span className={`badge badge-${finding.severity}`}>{finding.severity}</span>{" "}
                    <strong>{finding.severity === "critical" || finding.severity === "warning" ? "Attention:" : ""}</strong>{" "}
                    {finding.evidence}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>{t("call.analysisHistory")}</h3>
        <div className="actions" style={{ marginBottom: 10 }}>
          <a className={`button button-secondary${history.length === 0 ? " disabled" : ""}`} aria-disabled={history.length === 0} href={history.length === 0 ? undefined : exportUrl("history","xlsx")}>{t("call.exportHistoryXlsx")}</a>
          <a className={`button button-secondary${history.length === 0 ? " disabled" : ""}`} aria-disabled={history.length === 0} href={history.length === 0 ? undefined : exportUrl("history","csv")}>{t("call.exportHistoryCsv")}</a>
          {viewingReviewId && <><a className="button button-secondary" href={exportUrl("single","xlsx")}>{t("call.exportReviewXlsx")}</a><a className="button button-secondary" href={exportUrl("single","csv")}>{t("call.exportReviewCsv")}</a></>}
        </div>
        {viewingReviewId && <small>Review export uses selected review #{viewingReviewId}.</small>}
        {history.length === 0 && <p className="message">No reviews to export.</p>}
        <div className="grid" style={{ gap: 8 }}>
          {history.map((item, idx) => {
            const isLatest = idx === 0;
            const isSelected = viewingReviewId === item.id;
            return <article key={item.id} className="segment" style={isSelected ? { borderColor: "#2563eb", boxShadow: "0 0 0 1px #2563eb" } : isLatest ? { borderColor: "#16a34a", boxShadow: "0 0 0 1px #16a34a" } : undefined}>
              <div style={{display:"flex",justifyContent:"space-between", gap: 12}}>
                <div>
                  <strong>{new Date(item.created_at || "").toLocaleString()}</strong> · {item.status} · score {item.score ?? "-"} · {(item.model || (item.legacy_review ? "legacy" : "unknown"))} · {(item.scorecard_name || (item.legacy_review ? "legacy" : "unknown"))} · {(item.report_language || (item.legacy_review ? "legacy" : "unknown"))}
                  <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {isLatest ? <span className="badge">Latest</span> : null}
                    {isSelected ? <span className="badge">Selected</span> : null}
                    {item.legacy_review ? <span className="badge badge-warning">Legacy</span> : null}
                  </div>
                </div>
                <button className="button button-secondary" disabled={viewLoadingReviewId === item.id || isSelected} onClick={() => viewReview(item.id)}>
                  {viewLoadingReviewId === item.id ? "Loading..." : isSelected ? (isLatest ? "Viewing latest" : "Viewing previous") : (isLatest ? "View latest" : "View previous")}
                </button>
              </div>
            </article>;
          })}
        </div>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>{t("call.transcriptSegments")}</h3>

        {call && (
          <div className="meta-grid" style={{ marginTop: 10 }}>
            <div className="meta-item"><small>{t("call.audioLanguage")}</small>{sttLanguageLabel(call.language, sttLanguages, t)}</div>
            <div className="meta-item"><small>{t("call.sttLanguageUsed")}</small>{call.stt_language_used || normalizeSttLanguageCode(call.language) || "auto"}</div>
            <div className="meta-item"><small>{t("settings.sttProvider")}</small>{call.stt_provider_name || sttSettings?.provider?.name || sttSettings?.mode || "-"}</div>
            <div className="meta-item"><small>{t("settings.currentSttModel")}</small>{call.stt_model || sttSettings?.model || "-"}</div>
            <div className="meta-item"><small>Detected language</small>{call.detected_language || "-"}</div>
          </div>
        )}
        {normalizeSttLanguageCode(call?.language) === "uz" && (call?.stt_provider_type || sttSettings?.provider?.provider_type || sttSettings?.mode) === "faster_whisper_local" && (call?.stt_model || sttSettings?.model || "").toLowerCase() === "tiny" && (
          <p className="message message-warning">{t("settings.uzbekTinyWarning")}</p>
        )}
        {segments.length === 0 ? (
          <p>No transcript segments yet.</p>
        ) : (
          <div className="grid">
            {segments.map((segment) => (
              <article key={segment.id} className="segment">
                <small>
                  {msToSeconds(segment.start_ms)} - {msToSeconds(segment.end_ms)} • {segment.speaker}
                </small>
                <p>{segment.text}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
