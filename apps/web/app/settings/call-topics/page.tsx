"use client";

import { useEffect, useState } from "react";
import { SettingsNav } from "../../../components/SettingsNav";
import { Button, Card, Field, SectionHeader } from "../../../components/ui";

type Topic = { id?: number; name: string; description?: string; examples?: string[]; keywords?: string[]; required_actions?: string[]; is_active?: boolean; priority?: number };
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";
const lines = (value?: string[]) => (value || []).join("\n");
const split = (value: string) => value.split("\n").map((x) => x.trim()).filter(Boolean);

export default function CallTopicsSettingsPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selected, setSelected] = useState<Topic>({ name: "", description: "", examples: [], keywords: [], required_actions: [], is_active: true, priority: 100 });
  const [message, setMessage] = useState("");
  const load = () => fetch(`${API_BASE_URL}/settings/call-topics`).then((r) => r.json()).then((d) => setTopics(d.items || [])).catch(() => setMessage("Не удалось загрузить тематики."));
  useEffect(() => { void load(); }, []);
  async function save() {
    const method = selected.id ? "PATCH" : "POST";
    const url = selected.id ? `${API_BASE_URL}/settings/call-topics/${selected.id}` : `${API_BASE_URL}/settings/call-topics`;
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(selected) });
    setMessage(res.ok ? "Тематика сохранена." : "Ошибка сохранения тематики.");
    if (res.ok) { setSelected({ name: "", description: "", examples: [], keywords: [], required_actions: [], is_active: true, priority: 100 }); load(); }
  }
  return <section className="grid">
    <Card><SettingsNav /><SectionHeader title="Тематики звонков" description="Администратор управляет таксономией входящих звонков, примерами, ключевыми словами и обязательными действиями оператора." /></Card>
    <div className="grid-2">
      <Card><SectionHeader title="Список тематик" description="Активные тематики используются для AI-классификации после транскрипции." />
        <div className="grid" style={{ gap: 8 }}>{topics.map((topic) => <article key={topic.id} className="segment" onClick={() => setSelected(topic)} style={{ cursor: "pointer" }}><strong>{topic.priority}. {topic.name}</strong><p>{topic.description}</p><small>{topic.is_active ? "Активна" : "Неактивна"}</small></article>)}</div>
      </Card>
      <Card><SectionHeader title={selected.id ? "Редактировать тематику" : "Создать тематику"} />
        <div className="grid">
          <Field label="Название"><input value={selected.name} onChange={(e) => setSelected((t) => ({ ...t, name: e.target.value }))} /></Field>
          <Field label="Описание"><textarea value={selected.description || ""} onChange={(e) => setSelected((t) => ({ ...t, description: e.target.value }))} /></Field>
          <Field label="Примеры (каждый с новой строки)"><textarea value={lines(selected.examples)} onChange={(e) => setSelected((t) => ({ ...t, examples: split(e.target.value) }))} /></Field>
          <Field label="Ключевые слова (каждое с новой строки)"><textarea value={lines(selected.keywords)} onChange={(e) => setSelected((t) => ({ ...t, keywords: split(e.target.value) }))} /></Field>
          <Field label="Обязательные действия (каждое с новой строки)"><textarea value={lines(selected.required_actions)} onChange={(e) => setSelected((t) => ({ ...t, required_actions: split(e.target.value) }))} /></Field>
          <Field label="Приоритет"><input type="number" value={selected.priority ?? 100} onChange={(e) => setSelected((t) => ({ ...t, priority: Number(e.target.value) }))} /></Field>
          <label><input type="checkbox" checked={selected.is_active !== false} onChange={(e) => setSelected((t) => ({ ...t, is_active: e.target.checked }))} /> Активна</label>
          <div className="actions"><Button onClick={save}>Сохранить</Button><Button variant="secondary" onClick={() => setSelected({ name: "", description: "", examples: [], keywords: [], required_actions: [], is_active: true, priority: 100 })}>Новая тематика</Button></div>
          {message ? <p className="message">{message}</p> : null}
        </div>
      </Card>
    </div>
  </section>;
}
