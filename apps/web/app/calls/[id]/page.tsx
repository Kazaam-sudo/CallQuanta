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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export default function CallDetailsPage({ params }: { params: { id: string } }) {
  const [call, setCall] = useState<Call | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    try {
      setError(null);
      const response = await fetch(`${API_BASE_URL}/calls/${params.id}/transcribe`, {
        method: "POST",
      });
      if (!response.ok) {
        setError("Failed to enqueue transcription");
        return;
      }
      await load();
    } catch {
      setError("Failed to enqueue transcription");
    }
  };

  return (
    <main style={{ padding: 24 }}>
      <h1>Call Details</h1>
      <p>
        <Link href="/calls">Back to Calls</Link>
      </p>
      <button onClick={load} style={{ marginRight: 8 }}>
        Refresh
      </button>
      <button onClick={transcribe} disabled={!call || loading}>
        Transcribe
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
