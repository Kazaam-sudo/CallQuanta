"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminOnly } from "../../../components/AdminOnly";
import { SettingsNav } from "../../../components/SettingsNav";
import { useI18n } from "../../../components/I18nProvider";
import { API_BASE_URL, fetchWithCredentials } from "../../../lib/api";
import { HelpTooltip } from "../../../components/ui";

type UserRow = {
  id: number;
  email: string;
  display_name?: string | null;
  role: string;
  team?: string | null;
  agent_name?: string | null;
  visibility_scope: string;
  is_active: boolean;
  must_change_password?: boolean;
};

type UserForm = {
  id: number;
  email: string;
  display_name: string;
  role: string;
  team: string;
  agent_name: string;
  visibility_scope: string;
  password: string;
  is_active: boolean;
  must_change_password: boolean;
};

const emptyForm: UserForm = {
  id: 0,
  email: "",
  display_name: "",
  role: "viewer",
  team: "",
  agent_name: "",
  visibility_scope: "team",
  password: "",
  is_active: true,
  must_change_password: false,
};

const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const passwordPattern = /^(?=.*[A-Za-zА-Яа-я])(?=.*\d).{8,}$/;

export default function UsersAccessPage() {
  const { t } = useI18n();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<string[]>(["admin", "manager", "supervisor", "agent", "viewer"]);
  const [scopes, setScopes] = useState<string[]>(["all", "team", "own"]);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [temporaryPassword, setTemporaryPassword] = useState<{ title: string; password: string } | null>(null);

  const emailValid = emailPattern.test(form.email.trim());
  const passwordValid = !form.password || passwordPattern.test(form.password);
  const canSave = emailValid && passwordValid && !!form.role && !!form.visibility_scope;

  async function load() {
    const res = await fetchWithCredentials(`${API_BASE_URL}/settings/users`, { cache: "no-store" });
    if (!res.ok) {
      setError(t("users.loadFailed"));
      return;
    }
    const data = await res.json();
    setUsers(data.items || []);
    setRoles(data.roles || roles);
    setScopes(data.visibility_scopes || scopes);
  }

  useEffect(() => { load(); }, []);

  function clearForm() {
    setForm(emptyForm);
    setError("");
    setMessage("");
    setTemporaryPassword(null);
  }

  function edit(user: UserRow) {
    setTemporaryPassword(null);
    setMessage("");
    setError("");
    setForm({
      id: user.id,
      email: user.email,
      display_name: user.display_name || "",
      role: user.role,
      team: user.team || "",
      agent_name: user.agent_name || "",
      visibility_scope: user.visibility_scope,
      password: "",
      is_active: user.is_active,
      must_change_password: !!user.must_change_password,
    });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");
    setTemporaryPassword(null);
    if (!canSave) {
      setError(!emailValid ? t("users.invalidEmail") : t("users.weakPassword"));
      return;
    }
    const payload: Record<string, unknown> = { ...form };
    delete payload.id;
    if (!payload.password) delete payload.password;
    const res = await fetchWithCredentials(`${API_BASE_URL}/settings/users${form.id ? `/${form.id}` : ""}`, {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.detail || t("users.saveFailed"));
      return;
    }
    if (data.temporary_password) {
      setTemporaryPassword({ title: t("users.createdTemporary"), password: data.temporary_password });
    }
    setMessage(t("users.saved"));
    setForm(emptyForm);
    load();
  }

  async function resetPassword(user: UserRow) {
    setMessage("");
    setError("");
    setTemporaryPassword(null);
    const res = await fetchWithCredentials(`${API_BASE_URL}/settings/users/${user.id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.detail || t("users.resetFailed"));
      return;
    }
    setTemporaryPassword({ title: t("users.resetTemporary"), password: data.temporary_password });
    load();
  }

  async function setActive(user: UserRow, active: boolean) {
    if (!active && !window.confirm(t("users.confirmDeactivate").replace("{email}", user.email))) return;
    setMessage("");
    setError("");
    const res = await fetchWithCredentials(`${API_BASE_URL}/settings/users/${user.id}/${active ? "activate" : "deactivate"}`, { method: "PATCH" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.detail || t("users.updateFailed"));
    else setMessage(t("users.updated"));
    load();
  }

  async function copyPassword() {
    if (!temporaryPassword) return;
    try {
      await navigator.clipboard?.writeText(temporaryPassword.password);
      setMessage(t("users.copied"));
    } catch {
      setMessage(temporaryPassword.password);
    }
  }

  const sortedUsers = useMemo(() => users, [users]);
  const labelFor = (prefix: "role" | "scope", value: string) => {
    const key = `${prefix}.${value}`;
    const label = t(key);
    return label === key ? value : label;
  };

  return <AdminOnly><main className="grid" style={{ gap: 18 }}>
    <section className="card"><SettingsNav /><h2>{t("users.title")}</h2><p style={{ color: "var(--text-muted)" }}>{t("users.help")}</p></section>
    {error ? <section className="card message-error"><strong>{error}</strong></section> : null}
    {message ? <section className="card message-success"><strong>{message}</strong></section> : null}
    {temporaryPassword ? <section className="card message-success">
      <div className="temporary-password-panel">
        <div><strong>{temporaryPassword.title}</strong> <code>{temporaryPassword.password}</code><p>{t("users.mustChangeNotice")}</p></div>
        <button className="button button-secondary" type="button" onClick={copyPassword}>{t("users.copyPassword")}</button>
      </div>
    </section> : null}
    <section className="card">
      <h3>{form.id ? t("users.edit") : t("users.create")}</h3>
      <form className="user-form-grid" onSubmit={save}>
        <label>{t("users.email")}<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
          <small className={form.email && !emailValid ? "field-error" : ""}>{form.email && !emailValid ? t("users.invalidEmail") : t("users.emailHint")}</small></label>
        <label>{t("users.displayName")}<input value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} /></label>
        {!form.id ? <label>{t("users.temporaryPassword")}<input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder={t("users.passwordHint")} />
          <small className={form.password && !passwordValid ? "field-error" : ""}>{form.password && !passwordValid ? t("users.weakPassword") : t("users.passwordHint")}</small></label> : null}
        <label>{t("users.role")}<select value={form.role} onChange={e => { const role = e.target.value; setForm({ ...form, role, visibility_scope: role === "admin" ? "all" : form.visibility_scope }); }}>{roles.map(r => <option key={r} value={r}>{labelFor("role", r)}</option>)}</select></label>
        <label>{t("users.team")}<input value={form.team} onChange={e => setForm({ ...form, team: e.target.value })} /></label>
        <label>{t("users.agentName")}<input value={form.agent_name} onChange={e => setForm({ ...form, agent_name: e.target.value })} /></label>
        <label>{t("users.visibilityScope")} <HelpTooltip text={t("help.visibilityScope")} /><select value={form.visibility_scope} onChange={e => setForm({ ...form, visibility_scope: e.target.value })}>{scopes.map(s => <option key={s} value={s}>{labelFor("scope", s)}</option>)}</select></label>
        <label className="checkbox-card"><span>{t("users.active")}</span><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /></label>
        <label className="checkbox-card"><span>{t("users.requirePasswordChange")}</span><input type="checkbox" checked={form.must_change_password} onChange={e => setForm({ ...form, must_change_password: e.target.checked })} /></label>
        <div className="form-actions"><button className="button" type="submit" disabled={!canSave}>{t("users.save")}</button><button className="button button-secondary" type="button" onClick={clearForm}>{t("users.clear")}</button></div>
      </form>
    </section>
    <section className="card"><h3>{t("users.users")}</h3>{sortedUsers.length === 0 ? <p className="message">{t("users.empty")}</p> : <div className="table-wrap"><table className="users-table"><thead><tr><th>{t("users.email")}</th><th>{t("users.name")}</th><th>{t("users.role")}</th><th>{t("users.scope")}</th><th>{t("users.team")}</th><th>{t("users.agentName")}</th><th>{t("users.mustChangePassword")}</th><th>{t("users.status")}</th><th>{t("users.actions")}</th></tr></thead><tbody>
      {sortedUsers.map(u => <tr key={u.id}><td>{u.email}</td><td>{u.display_name || "—"}</td><td><span className="badge badge-uploaded" title={u.role}>{labelFor("role", u.role)}</span></td><td><span className="badge badge-transcribed" title={u.visibility_scope}>{labelFor("scope", u.visibility_scope)}</span></td><td>{u.team || "—"}</td><td>{u.agent_name || "—"}</td><td>{u.must_change_password ? <span className="badge badge-analysis_pending">{t("users.mustChangePassword")}</span> : "—"}</td><td><span className={`badge ${u.is_active ? "badge-transcribed" : "badge-failed"}`}>{u.is_active ? t("users.activeStatus") : t("users.inactiveStatus")}</span></td><td className="actions"><button className="button button-secondary button-small" onClick={() => edit(u)}>{t("users.editAction")}</button><button className="button button-secondary button-small" onClick={() => resetPassword(u)}>{t("users.resetPassword")}</button><button className="button button-secondary button-small" onClick={() => setActive(u, !u.is_active)}>{u.is_active ? t("users.deactivate") : t("users.activate")}</button></td></tr>)}
    </tbody></table></div>}</section>
  </main></AdminOnly>;
}
