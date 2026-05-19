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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

const msToSeconds = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

export default function CallDetailsPage({ params }: { params: { id: string } }) {
  const [call, setCall] = useState<Call | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [callResponse, transcriptResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/calls/${params.id}`),
        fetch(`${API_BASE_URL}/calls/${params.id}/transcript`),
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
    if (call?.status !== "transcription_pending") return;
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

  const isTranscribed = call?.status === "transcribed";
  const pendingState = useMemo(
    () => call?.status === "transcription_pending" || transcribing,
    [call?.status, transcribing],
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
        </div>

        {pendingState && <p className="message">Transcription is in progress. Auto-refreshing every 2 seconds.</p>}
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
