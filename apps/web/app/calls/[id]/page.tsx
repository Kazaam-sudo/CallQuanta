"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Call = {
  id: number;
  filename: string;
  status: string;
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
        setError("Call not found");
        return;
      }

      const callData = await callResponse.json();
      setCall(callData);

      if (transcriptResponse.ok) {
        const transcriptData = await transcriptResponse.json();
        setSegments(transcriptData.segments || []);
      }
    } catch {
      setError("Failed to load call");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const transcribe = async () => {
    if (!call || call.status === "transcribed" || transcribing) {
      return;
    }

    try {
      setError(null);
      setTranscribing(true);
      const response = await fetch(`${API_BASE_URL}/calls/${params.id}/transcribe`, {
        method: "POST",
      });
      if (!response.ok) {
        let detail = "Failed to enqueue transcription.";
        try {
          const data = await response.json();
          if (typeof data?.detail === "string" && data.detail) {
            detail = data.detail;
          }
        } catch {
          // Ignore JSON parsing errors and use fallback message.
        }
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

  return (
    <main style={{ padding: 24 }}>
      <h1>Call Details</h1>
      <p>
        <Link href="/calls">Back to Calls</Link>
      </p>
      <button onClick={load} style={{ marginRight: 8 }}>
        Refresh
      </button>
      <button
        onClick={transcribe}
        disabled={!call || loading || transcribing || isTranscribed}
        style={isTranscribed ? { opacity: 0.6, cursor: "not-allowed" } : undefined}
      >
        {transcribing ? "Transcribing..." : "Transcribe"}
      </button>
      {error && <p>{error}</p>}
      {loading && <p>Loading...</p>}
      {call && (
        <div>
          <p>ID: {call.id}</p>
          <p>Filename: {call.filename}</p>
          <p>Status: {call.status}</p>
          <p>Created: {call.created_at || "-"}</p>

          <h3>Transcript Segments</h3>
          {segments.length === 0 ? (
            <p>No transcript segments yet.</p>
          ) : (
            <ul>
              {segments.map((segment) => (
                <li key={segment.id}>
                  [{segment.start_ms}ms - {segment.end_ms}ms] <strong>{segment.speaker}</strong>: {segment.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
