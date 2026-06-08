"use client";

import { useEffect, useState } from "react";
import { AdminOnly } from "../../../components/AdminOnly";
import { SettingsNav } from "../../../components/SettingsNav";
import { API_BASE_URL, fetchWithCredentials } from "../../../lib/api";

type AuditEvent = { id: number; actor_email?: string | null; action: string; entity_type: string; entity_id?: string | null; message?: string | null; created_at?: string | null };

export default function AuditLogPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [filters, setFilters] = useState({ action: "", actor_email: "", entity_type: "" });
  async function load() {
    const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    const res = await fetchWithCredentials(`${API_BASE_URL}/settings/audit-log?${params.toString()}`, { cache: "no-store" });
    if (res.ok) setEvents((await res.json()).items || []);
  }
  useEffect(() => { load(); }, []);
  return <AdminOnly><main className="grid" style={{ gap: 18 }}>
    <section className="card"><SettingsNav /><h2>Audit Log</h2><p style={{ color: "var(--text-muted)" }}>Latest important user actions and system changes.</p></section>
    <section className="card"><div className="actions"><input placeholder="Action" value={filters.action} onChange={e => setFilters({ ...filters, action: e.target.value })} /><input placeholder="User email" value={filters.actor_email} onChange={e => setFilters({ ...filters, actor_email: e.target.value })} /><input placeholder="Entity" value={filters.entity_type} onChange={e => setFilters({ ...filters, entity_type: e.target.value })} /><button className="button" onClick={load}>Filter</button></div></section>
    <section className="card"><div className="table-wrap"><table><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Message</th></tr></thead><tbody>{events.map(e => <tr key={e.id}><td>{e.created_at ? new Date(e.created_at).toLocaleString() : "—"}</td><td>{e.actor_email || "system"}</td><td>{e.action}</td><td>{e.entity_type}{e.entity_id ? ` #${e.entity_id}` : ""}</td><td>{e.message || "—"}</td></tr>)}</tbody></table></div></section>
  </main></AdminOnly>;
}
