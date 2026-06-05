"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

export default function SystemStatusPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const response = await fetch(`${API_BASE_URL}/system/status`);
    if (!response.ok) {
      setError("System status is available to admins only.");
      return;
    }
    setData(await response.json());
  }

  useEffect(() => { load(); }, []);

  return (
    <main className="grid" style={{ gap: 16 }}>
      <div className="actions"><Link href="/settings">Settings</Link><Link href="/settings/retention">Retention</Link></div>
      <section className="card">
        <div className="actions" style={{ justifyContent: "space-between" }}><h2>System Status</h2><button className="button button-secondary" onClick={load}>Refresh</button></div>
        {error && <p className="message message-error">{error}</p>}
        {!data && !error && <p>Loading system status...</p>}
      </section>
      {data && <>
        <section className="grid grid-2">
          <article className="card"><h3>API</h3><p>{data.api?.status} • v{data.api?.version} • {data.api?.app_env}</p><p>Auth required: {String(data.api?.require_auth)}</p></article>
          <article className="card"><h3>Postgres</h3><p>{data.postgres?.ok ? "Healthy" : "Unavailable"}</p>{data.postgres?.error && <small>{data.postgres.error}</small>}</article>
          <article className="card"><h3>Redis</h3><p>{data.redis?.ok ? "Healthy" : "Unavailable"}</p>{data.redis?.error && <small>{data.redis.error}</small>}</article>
          <article className="card"><h3>Storage</h3><p>{data.storage?.files_count ?? 0} files</p><p>{Math.round((data.storage?.total_bytes || 0) / 1024 / 1024)} MB</p></article>
        </section>
        <section className="card"><h3>Queues</h3><div className="grid grid-3">{Object.entries(data.queues || {}).map(([key, queue]: any) => <div key={key} className="segment"><strong>{key}</strong><p>{queue.length} jobs</p><small>{queue.name}</small></div>)}</div></section>
        <section className="card"><h3>Workers</h3><div className="grid grid-3">{Object.entries(data.workers || {}).map(([key, worker]: any) => <div key={key} className="segment"><strong>{key}</strong><p><span className={`badge ${worker.ok ? "badge-transcribed" : "badge-error"}`}>{worker.ok ? "Healthy" : "Warning"}</span></p><small>Last heartbeat: {worker.last_heartbeat || "never"}</small>{worker.warning && <p className="message message-error">{worker.warning}</p>}</div>)}</div></section>
        <section className="grid grid-2">
          <article className="card"><h3>Active LLM provider</h3><p>{data.providers?.llm?.name || "None configured"}</p><small>{data.providers?.llm?.model}</small></article>
          <article className="card"><h3>Active STT provider</h3><p>{data.providers?.stt?.name || "None configured"}</p><small>{data.providers?.stt?.model}</small></article>
        </section>
        <section className="card"><h3>Upload limits</h3><p>Per file: {data.upload_limits?.max_upload_mb} MB • Bulk: {data.upload_limits?.max_bulk_upload_mb} MB</p></section>
      </>}
    </main>
  );
}
