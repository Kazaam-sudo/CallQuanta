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
    if (!data || typeof data !== "object") return null;
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail) return detail;
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object" && "msg" in item) {
            const message = (item as { msg?: unknown }).msg;
            if (typeof message === "string") return message;
          }
          return null;
        })
        .filter((message): message is string => Boolean(message));
      if (messages.length > 0) return messages.join("; ");
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
      if (!response.ok) throw new Error(parseErrorDetail(data) ?? `HTTP ${response.status}`);
      if (!Array.isArray(data)) throw new Error("API returned an unexpected payload.");
      setCalls(data as Call[]);
    } catch (error) {
      setLoadError(
        `Failed to load calls: ${error instanceof Error ? error.message : "Unknown error while loading calls."}`,
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCalls();
  }, []);

  const onUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFile) return;
    setUploadSuccess(null);
    setUploadError(null);
    setUploading(true);

    try {
      const uploadData = new FormData();
      uploadData.append("file", selectedFile);
      const response = await fetch(`${API_BASE_URL}/calls/upload`, { method: "POST", body: uploadData });

      if (!response.ok) {
        let detail = "Upload failed.";
        try {
          const data = await response.json();
          detail = parseErrorDetail(data) ?? detail;
        } catch {}
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
    <div className="grid" style={{ gap: 16 }}>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Upload call audio</h2>
        <form onSubmit={onUpload} className="grid" style={{ gap: 10 }}>
          <input
            className="input-file"
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
          <small style={{ color: "var(--text-muted)" }}>
            Accepted formats: WAV, MP3, M4A, OGG, FLAC, WEBM.
          </small>
          {selectedFile && <small>Selected: {selectedFile.name}</small>}
          <div>
            <button className="button" type="submit" disabled={!selectedFile || uploading}>
              {uploading ? "Uploading..." : "Upload"}
            </button>
          </div>
        </form>
        {uploadSuccess && <p className="message message-success">{uploadSuccess}</p>}
        {uploadError && <p className="message message-error">{uploadError}</p>}
      </section>

      <section className="card">
        <div className="actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Calls ({calls.length})</h2>
          <button className="button button-secondary" type="button" onClick={loadCalls} disabled={loading || uploading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        {loadError && <p className="message message-error">{loadError}</p>}
        {loading ? (
          <p>Loading calls...</p>
        ) : calls.length === 0 ? (
          <p>No calls uploaded yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th><th>Filename</th><th>Status</th><th>File size</th><th>Content type</th><th>Created</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => (
                  <tr key={call.id}>
                    <td>#{call.id}</td>
                    <td>{call.filename}</td>
                    <td><span className={`badge badge-${call.status}`}>{call.status.replaceAll("_", " ")}</span></td>
                    <td>{call.file_size_bytes != null ? `${call.file_size_bytes.toLocaleString()} bytes` : "-"}</td>
                    <td>{call.content_type || "-"}</td>
                    <td>{call.created_at ? new Date(call.created_at).toLocaleString() : "-"}</td>
                    <td><Link href={`/calls/${call.id}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
