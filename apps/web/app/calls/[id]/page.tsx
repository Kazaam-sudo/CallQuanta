"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Call = {
  id: number;
  filename: string;
  status: string;
  created_at?: string | null;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export default function CallDetailsPage({ params }: { params: { id: string } }) {
  const [call, setCall] = useState<Call | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/calls/${params.id}`);
        if (!response.ok) {
          setError("Call not found");
          return;
        }
        const data = await response.json();
        setCall(data);
      } catch {
        setError("Failed to load call");
      }
    };
    load();
  }, [params.id]);

  return (
    <main style={{ padding: 24 }}>
      <h1>Call Details</h1>
      <p>
        <Link href="/calls">Back to Calls</Link>
      </p>
      {error && <p>{error}</p>}
      {call && (
        <div>
          <p>ID: {call.id}</p>
          <p>Filename: {call.filename}</p>
          <p>Status: {call.status}</p>
          <p>Created: {call.created_at || "-"}</p>
          <p>Transcription: pending</p>
          <p>Analysis: pending</p>
        </div>
      )}
    </main>
  );
}
