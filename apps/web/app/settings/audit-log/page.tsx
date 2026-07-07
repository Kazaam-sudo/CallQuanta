"use client";

import { useEffect, useState } from "react";
import { AdminOnly } from "../../../components/AdminOnly";
import { SettingsNav } from "../../../components/SettingsNav";
import { API_BASE_URL, fetchWithCredentials } from "../../../lib/api";
import { useI18n } from "../../../components/I18nProvider";

type AuditEvent = { id: number; actor_email?: string | null; action: string; entity_type: string; entity_id?: string | null; message?: string | null; created_at?: string | null };

export default function AuditLogPage() {
  const { t } = useI18n();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [filters, setFilters] = useState({ action: "", actor_email: "", entity_type: "" });
  async function load() {
    const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    const res = await fetchWithCredentials(`${API_BASE_URL}/settings/audit-log?${params.toString()}`, { cache: "no-store" });
    if (res.ok) setEvents((await res.json()).items || []);
  }
  useEffect(() => { load(); }, []);
  return <AdminOnly><main className="grid" style={{ gap: 18 }}>
    <section className="card"><SettingsNav /><h2>{t("audit.title")}</h2><p style={{ color: "var(--text-muted)" }}>{t("audit.help")}</p></section>
    <section className="card"><p style={{ color: "var(--text-muted)", marginTop: 0 }}>{t("audit.filtersHelp")}</p><div className="actions"><input placeholder={t("audit.action")} value={filters.action} onChange={e => setFilters({ ...filters, action: e.target.value })} /><input placeholder={t("audit.actorEmail")} value={filters.actor_email} onChange={e => setFilters({ ...filters, actor_email: e.target.value })} /><input placeholder={t("audit.entity")} value={filters.entity_type} onChange={e => setFilters({ ...filters, entity_type: e.target.value })} /><button className="button" onClick={load}>{t("common.filter")}</button></div></section>
    <section className="card">{events.length === 0 ? <p className="message">{t("audit.empty")}</p> : <div className="table-wrap"><table><thead><tr><th>{t("audit.time")}</th><th>{t("audit.actorEmail")}</th><th>{t("audit.action")}</th><th>{t("audit.entity")}</th><th>{t("audit.message")}</th></tr></thead><tbody>{events.map(e => <tr key={e.id}><td>{e.created_at ? new Date(e.created_at).toLocaleString() : "—"}</td><td>{e.actor_email || t("common.system")}</td><td>{e.action}</td><td>{e.entity_type}{e.entity_id ? ` #${e.entity_id}` : ""}</td><td>{e.message || "—"}</td></tr>)}</tbody></table></div>}</section>
  </main></AdminOnly>;
}
