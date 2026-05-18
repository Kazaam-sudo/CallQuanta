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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const loadCalls = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/calls`);
      const data = await response.json();
      setCalls(data);
    } catch {
      setLoadError("Failed to load calls.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCalls();
  }, []);

  const onUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFile) {
      return;
    }

    setUploadSuccess(null);
    setUploadError(null);
    setUploading(true);

    try {
      const uploadData = new FormData();
      uploadData.append("file", selectedFile);

      const response = await fetch(`${API_BASE_URL}/calls/upload`, {
        method: "POST",
        body: uploadData,
      });

      if (!response.ok) {
        let detail = "Upload failed.";
        try {
          const data = await response.json();
          if (typeof data?.detail === "string" && data.detail) {
            detail = data.detail;
          }
        } catch {
          // Ignore JSON parsing errors and fall back to generic message.
        }
        setUploadError(`Upload failed: ${detail}`);
        return;
      }

      setUploadSuccess(`Uploaded ${selectedFile.name} successfully.`);
      setSelectedFile(null);
      event.currentTarget.reset();
      await loadCalls();
    } catch {
      setUploadError("Upload failed: Network error while uploading file.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <main style={{ padding: 24 }}>
      <h1>Calls</h1>
      <p>
        <Link href="/">Home</Link>
      </p>

      <form onSubmit={onUpload}>
        <input
          type="file"
          name="file"
          required
          accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac,.webm"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0] ?? null;
            setSelectedFile(file);
            setUploadSuccess(null);
            setUploadError(null);
          }}
        />
        <button type="submit" disabled={!selectedFile || uploading}>
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </form>

      {selectedFile && <p>Selected file: {selectedFile.name}</p>}
      {uploadSuccess && <p>{uploadSuccess}</p>}
      {uploadError && <p>{uploadError}</p>}
      {loadError && <p>{loadError}</p>}

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
