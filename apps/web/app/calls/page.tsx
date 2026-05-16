"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Call = {
  id: number;
  filename: string;
  status: string;
  created_at?: string | null;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

export default function CallsPage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCalls = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/calls`);
      const data = await response.json();
      setCalls(data);
    } catch (e) {
      setError("Failed to load calls");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCalls();
  }, []);

  const onUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");
    if (!(file instanceof File)) return;

    const uploadData = new FormData();
    uploadData.append("file", file);

    const response = await fetch(`${API_BASE_URL}/calls/upload`, {
      method: "POST",
      body: uploadData,
    });

    if (!response.ok) {
      setError("Upload failed");
      return;
    }

    event.currentTarget.reset();
    await loadCalls();
  };

  return (
    <main style={{ padding: 24 }}>
      <h1>Calls</h1>
      <p>
        <Link href="/">Home</Link>
      </p>

      <form onSubmit={onUpload}>
        <input type="file" name="file" required />
        <button type="submit">Upload</button>
      </form>

      {error && <p>{error}</p>}
      {loading ? (
        <p>Loading...</p>
      ) : (
        <ul>
          {calls.map((call) => (
            <li key={call.id}>
              <Link href={`/calls/${call.id}`}>
                #{call.id} - {call.filename} ({call.status})
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
