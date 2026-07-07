"use client";

import { useEffect, useState } from "react";
import { SettingsNav } from "../../../components/SettingsNav";
import { Button, Card, Field, SectionHeader } from "../../../components/ui";
import { useI18n } from "../../../components/I18nProvider";

type Topic = { id?: number; name: string; description?: string; examples?: string[]; keywords?: string[]; required_actions?: string[]; is_active?: boolean; priority?: number };
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";
const lines = (value?: string[]) => (value || []).join("\n");
const split = (value: string) => value.split("\n").map((x) => x.trim()).filter(Boolean);

export default function CallTopicsSettingsPage() {
  const { t } = useI18n();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selected, setSelected] = useState<Topic>({ name: "", description: "", examples: [], keywords: [], required_actions: [], is_active: true, priority: 100 });
  const [message, setMessage] = useState("");
  const load = () => fetch(`${API_BASE_URL}/settings/call-topics`).then((r) => r.json()).then((d) => setTopics(d.items || [])).catch(() => setMessage(t("callTopics.loadFailed")));
  useEffect(() => { void load(); }, []);
  async function save() {
    const method = selected.id ? "PATCH" : "POST";
    const url = selected.id ? `${API_BASE_URL}/settings/call-topics/${selected.id}` : `${API_BASE_URL}/settings/call-topics`;
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(selected) });
    setMessage(res.ok ? t("callTopics.saved") : t("callTopics.saveFailed"));
    if (res.ok) { setSelected({ name: "", description: "", examples: [], keywords: [], required_actions: [], is_active: true, priority: 100 }); load(); }
  }
  return <section className="grid">
    <Card><SettingsNav /><SectionHeader title={t("callTopics.title")} description={t("callTopics.help")} /></Card>
    <div className="grid-2">
      <Card><SectionHeader title={t("callTopics.list")} description={t("callTopics.listHelp")} />
        <div className="grid" style={{ gap: 8 }}>{topics.length === 0 ? <p className="empty-state">{t("callTopics.empty")}</p> : topics.map((topic) => <article key={topic.id} className="segment" onClick={() => setSelected(topic)} style={{ cursor: "pointer" }}><strong>{topic.priority}. {topic.name}</strong><p>{topic.description}</p><small>{topic.is_active ? t("callTopics.active") : t("callTopics.inactive")}</small></article>)}</div>
      </Card>
      <Card><SectionHeader title={selected.id ? t("callTopics.edit") : t("callTopics.create")} />
        <div className="grid">
          <Field label={t("callTopics.name")}><input value={selected.name} onChange={(e) => setSelected((t) => ({ ...t, name: e.target.value }))} /></Field>
          <Field label={t("common.description")}><textarea value={selected.description || ""} onChange={(e) => setSelected((t) => ({ ...t, description: e.target.value }))} /></Field>
          <Field label={t("callTopics.examples")}><textarea value={lines(selected.examples)} onChange={(e) => setSelected((t) => ({ ...t, examples: split(e.target.value) }))} /></Field>
          <Field label={t("callTopics.keywords")}><textarea value={lines(selected.keywords)} onChange={(e) => setSelected((t) => ({ ...t, keywords: split(e.target.value) }))} /></Field>
          <Field label={t("callTopics.requiredActions")}><textarea value={lines(selected.required_actions)} onChange={(e) => setSelected((t) => ({ ...t, required_actions: split(e.target.value) }))} /></Field>
          <Field label={t("callTopics.priority")}><input type="number" value={selected.priority ?? 100} onChange={(e) => setSelected((t) => ({ ...t, priority: Number(e.target.value) }))} /></Field>
          <label><input type="checkbox" checked={selected.is_active !== false} onChange={(e) => setSelected((t) => ({ ...t, is_active: e.target.checked }))} /> {t("callTopics.active")}</label>
          <div className="actions"><Button onClick={save}>{t("common.save")}</Button><Button variant="secondary" onClick={() => setSelected({ name: "", description: "", examples: [], keywords: [], required_actions: [], is_active: true, priority: 100 })}>{t("callTopics.newTopic")}</Button></div>
          {message ? <p className="message">{message}</p> : null}
        </div>
      </Card>
    </div>
  </section>;
}
