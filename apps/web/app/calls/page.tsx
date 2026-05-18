"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

export default function CallsPage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const parseErrorDetail = (data: unknown): string | null => {
    if (!data || typeof data !== "object") {
      return null;
    }
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail) {
      return detail;
    }
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => {
          if (typeof item === "string") {
            return item;
          }
          if (item && typeof item === "object" && "msg" in item) {
            const message = (item as { msg?: unknown }).msg;
            if (typeof message === "string") {
              return message;
            }
          }
          return null;
        })
        .filter((message): message is string => Boolean(message));
      if (messages.length > 0) {
        return messages.join("; ");
      }
    }
    return null;
  };

  const loadCalls = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/calls`);
      let data: unknown = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        const detail = parseErrorDetail(data) ?? `HTTP ${response.status}`;
        throw new Error(detail);
      }

      if (!Array.isArray(data)) {
        throw new Error("API returned an unexpected payload.");
      }

      setCalls(data as Call[]);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Unknown error while loading calls.";
      setLoadError(`Failed to load calls: ${detail}`);
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
          detail = parseErrorDetail(data) ?? detail;
        } catch {
          // Ignore JSON parsing errors and fall back to generic message.
        }
        setUploadError(`Upload failed: ${detail}`);
        return;
      }

      const uploadedCall = (await response.json()) as unknown;
      setUploadSuccess(`Uploaded ${selectedFile.name} successfully.`);
      setSelectedFile(null);
      event.currentTarget.reset();
      if (
        uploadedCall &&
        typeof uploadedCall === "object" &&
        typeof (uploadedCall as { id?: unknown }).id === "number" &&
        typeof (uploadedCall as { filename?: unknown }).filename === "string" &&
        typeof (uploadedCall as { status?: unknown }).status === "string"
      ) {
        setCalls((currentCalls) => [
          uploadedCall as Call,
          ...currentCalls.filter((call) => call.id !== (uploadedCall as Call).id),
        ]);
      } else {
        await loadCalls();
      }
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
      <p>Total uploaded calls: {calls.length}</p>
      <button type="button" onClick={loadCalls} disabled={loading || uploading}>
        {loading ? "Refreshing..." : "Refresh calls"}
      </button>

      {loading ? (
        <p>Loading calls...</p>
      ) : loadError ? (
        <p>{loadError}</p>
      ) : calls.length === 0 ? (
        <p>No calls uploaded yet.</p>
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
