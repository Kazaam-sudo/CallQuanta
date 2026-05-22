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

type QAFinding = { id: number; severity: string; evidence: string };
type QACriterion = {
  id: string;
  title: string;
  score: number | string;
  max_points: number | string;
  comment: string;
  evidence: string;
  severity: string;
};
type QAReview = { id: number; score: number; summary: string; mode?: string; criteria: QACriterion[]; findings: QAFinding[] };

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

const msToSeconds = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

export default function CallDetailsPage({ params }: { params: { id: string } }) {
  const [call, setCall] = useState<Call | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [review, setReview] = useState<QAReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [callResponse, transcriptResponse, qaResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/calls/${params.id}`),
        fetch(`${API_BASE_URL}/calls/${params.id}/transcript`),
        fetch(`${API_BASE_URL}/calls/${params.id}/qa`),
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
      if (qaResponse.ok) {
        const qaData = await qaResponse.json();
        setReview(qaData.review || null);
      }
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
            QA analysis failed. The worker could not produce a valid review. Please check worker logs and try again.
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
            <div><strong>Analysis mode:</strong> {review.mode || "unknown"}</div>
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
