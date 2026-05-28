"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Call = {
  id: number;
  filename: string;
  status: string;
  stored_filename?: string | null;
  stored_path?: string | null;
  file_size_bytes?: number | null;
  content_type?: string | null;
  created_at?: string | null;
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
      setCall(await callResponse.json());
      if (transcriptResponse.ok) {
        const transcriptData = await transcriptResponse.json();
        setSegments(transcriptData.segments || []);
      }
      if (qaResponse.ok) { const qaData = await qaResponse.json(); setReview(qaData.review || null); setViewingReviewId(qaData.review?.id ?? null); }
      if (historyResponse.ok) { const hist = await historyResponse.json(); setHistory(hist.reviews || []); }
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
    if (call?.status !== "transcription_pending" && call?.status !== "analysis_pending") return;
    const interval = setInterval(() => {
      load();
    }, 2000);
    return () => clearInterval(interval);
  }, [call?.status, load]);

  const transcribe = async () => {
    if (!call || call.status === "transcribed" || transcribing) return;
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

  const isTranscribed = call?.status === "transcribed";
  const pendingState = useMemo(() => call?.status === "transcription_pending" || transcribing, [call?.status, transcribing]);
  const analysisPendingState = useMemo(() => call?.status === "analysis_pending" || analyzing, [call?.status, analyzing]);
  const canAnalyzeAgain = call?.status === "analyzed" || call?.status === "analysis_failed";

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

      <section className="card" id="qa-review-section">
        <div className="actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Call #{call?.id ?? params.id}</h2>
          {call?.status && <span className={`badge badge-${call.status}`}>{call.status.replaceAll("_", " ")}</span>}
        </div>

        <div className="actions" style={{ marginTop: 14 }}>
          <button className="button button-secondary" onClick={load}>Refresh</button>
          <button className="button" onClick={transcribe} disabled={!call || loading || transcribing || isTranscribed}>
            {transcribing ? "Transcribing..." : "Transcribe"}
          </button>
          <button className="button" onClick={analyze} disabled={!call || loading || analyzing || segments.length === 0 || call.status === "analysis_pending"}>
            {analysisPendingState ? "Analyzing..." : canAnalyzeAgain ? "Analyze again" : "Analyze"}
          </button>
        </div>

        {pendingState && <p className="message">Transcription is in progress. Auto-refreshing every 2 seconds.</p>}
        {analysisPendingState && <p className="message">QA analysis is in progress. Auto-refreshing every 2 seconds.</p>}
        {call?.status === "analysis_failed" && (
          <p className="message message-error">
            QA analysis failed. The worker could not produce a valid review. Check worker logs and provider settings, then retry analysis.
            {latestFailureHint ? ` Latest hint: ${latestFailureHint}` : ""}
          </p>
        )}
        {error && <p className="message message-error">{error}</p>}
        {loading && <p>Loading...</p>}

        {call && (
          <div className="meta-grid" style={{ marginTop: 10 }}>
            <div className="meta-item"><small>Filename</small>{call.filename}</div>
            <div className="meta-item"><small>Created</small>{call.created_at ? new Date(call.created_at).toLocaleString() : "-"}</div>
            <div className="meta-item"><small>File size</small>{call.file_size_bytes != null ? `${call.file_size_bytes.toLocaleString()} bytes` : "-"}</div>
            <div className="meta-item"><small>Content type</small>{call.content_type || "-"}</div>
          </div>
        )}
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>QA Review</h3>
        {!review ? <p>QA review is not available yet. Run analysis after transcription completes.</p> : (
          <div className="grid" style={{ gap: 10 }}>
            <div><strong>Score:</strong> <span className="badge">{review.score}</span></div>
            {review.legacy_review && <p className="message message-warning">Legacy review — metadata was not captured before v0.10.0.</p>}
            <div><strong>Analysis mode:</strong> {review.analysis_mode || providerMeta["analysis mode"] || "unknown"}</div>
            <div><strong>Provider:</strong> {review.provider_name || providerMeta["provider"] || "unknown"}</div>
            <div><strong>Preset:</strong> {review.provider_preset || providerMeta["preset"] || "unknown"}</div>
            <div><strong>Model:</strong> {review.model || providerMeta["model"] || "unknown"}</div>
            <div><strong>Scorecard:</strong> {review.scorecard_name || providerMeta["scorecard"] || "unknown"}</div>
            <div><strong>Report language:</strong> {review.report_language || providerMeta["report language"] || "unknown"}</div>
            {recoveredReview && (
              <p className="message message-warning">
                This review was partially recovered from an imperfect LLM response.
              </p>
            )}
            <div><strong>Summary:</strong> {review.summary}</div>
            <div>
              <strong>Criteria breakdown:</strong>
              <div className="grid" style={{ gap: 8, marginTop: 8 }}>
                {review.criteria
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
        <h3 style={{ marginTop: 0 }}>Analysis history</h3>
        <div className="actions" style={{ marginBottom: 10 }}>
          <a className={`button button-secondary${history.length === 0 ? " disabled" : ""}`} aria-disabled={history.length === 0} href={history.length === 0 ? undefined : exportUrl("history","xlsx")}>Export history XLSX</a>
          <a className={`button button-secondary${history.length === 0 ? " disabled" : ""}`} aria-disabled={history.length === 0} href={history.length === 0 ? undefined : exportUrl("history","csv")}>Export history CSV</a>
          {viewingReviewId && <><a className="button button-secondary" href={exportUrl("single","xlsx")}>Export review XLSX</a><a className="button button-secondary" href={exportUrl("single","csv")}>Export review CSV</a></>}
        </div>
        {history.length === 0 && <p className="message">No reviews to export.</p>}
        <div className="grid" style={{ gap: 8 }}>
          {history.map((item, idx) => <article key={item.id} className="segment" style={viewingReviewId === item.id ? { borderColor: "#2563eb", boxShadow: "0 0 0 1px #2563eb" } : undefined}><div style={{display:"flex",justifyContent:"space-between"}}><div><strong>{new Date(item.created_at || "").toLocaleString()}</strong> · {item.status} · score {item.score ?? "-"} · {(item.model || (item.legacy_review ? "legacy" : "unknown"))} · {(item.scorecard_name || (item.legacy_review ? "legacy" : "unknown"))} · {(item.report_language || (item.legacy_review ? "legacy" : "unknown"))}</div><button className="button button-secondary" disabled={viewLoadingReviewId === item.id || viewingReviewId === item.id} onClick={() => viewReview(item.id)}>{viewLoadingReviewId === item.id ? "Loading..." : viewingReviewId === item.id ? "Viewing" : "View"}</button></div>{idx===0 && viewingReviewId===item.id ? <small>Viewing latest review</small> : viewingReviewId===item.id ? <small>{`Viewing review #${item.id} from ${new Date(item.created_at || "").toLocaleString()}`}</small> : null}{item.legacy_review ? <small>Legacy review — metadata was not captured before v0.10.0.</small> : null}</article>)}
        </div>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>Transcript segments</h3>
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
