"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminOnly } from "../../../components/AdminOnly";
import { SettingsNav } from "../../../components/SettingsNav";
import { API_BASE_URL, fetchWithCredentials } from "../../../lib/api";

type UserRow = {
  id: number; email: string; display_name?: string | null; role: string; team?: string | null;
  agent_name?: string | null; visibility_scope: string; is_active: boolean;
};

const emptyForm = { id: 0, email: "", display_name: "", role: "viewer", team: "", agent_name: "", visibility_scope: "team", password: "", is_active: true };

export default function UsersAccessPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<string[]>(["admin", "manager", "supervisor", "agent", "viewer"]);
  const [scopes, setScopes] = useState<string[]>(["all", "team", "own"]);
  const [form, setForm] = useState<any>(emptyForm);
  const [message, setMessage] = useState<string>("");

  async function load() {
    const res = await fetchWithCredentials(`${API_BASE_URL}/settings/users`, { cache: "no-store" });
    if (!res.ok) return setMessage("Failed to load users.");
    const data = await res.json();
    setUsers(data.items || []); setRoles(data.roles || roles); setScopes(data.visibility_scopes || scopes);
  }
  useEffect(() => { load(); }, []);

  function edit(user: UserRow) {
    setForm({ id: user.id, email: user.email, display_name: user.display_name || "", role: user.role, team: user.team || "", agent_name: user.agent_name || "", visibility_scope: user.visibility_scope, password: "", is_active: user.is_active });
  }

  async function save(e: FormEvent) {
    e.preventDefault(); setMessage("");
    const payload: any = { ...form };
    if (!payload.password) delete payload.password;
    const res = await fetchWithCredentials(`${API_BASE_URL}/settings/users${form.id ? `/${form.id}` : ""}`, {
      method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage(data.detail || "Failed to save user.");
    setMessage(data.temporary_password ? `Saved. Temporary password: ${data.temporary_password}` : "Saved.");
    setForm(emptyForm); load();
  }

  async function resetPassword(user: UserRow) {
    const res = await fetchWithCredentials(`${API_BASE_URL}/settings/users/${user.id}/reset-password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const data = await res.json().catch(() => ({}));
    setMessage(res.ok ? `Temporary password for ${user.email}: ${data.temporary_password}` : (data.detail || "Password reset failed."));
  }

  async function setActive(user: UserRow, active: boolean) {
    const res = await fetchWithCredentials(`${API_BASE_URL}/settings/users/${user.id}/${active ? "activate" : "deactivate"}`, { method: "PATCH" });
    const data = await res.json().catch(() => ({}));
    setMessage(res.ok ? "Updated." : (data.detail || "Update failed."));
    load();
  }

  return <AdminOnly><main className="grid" style={{ gap: 18 }}>
    <section className="card"><SettingsNav /><h2>Users & Access</h2><p style={{ color: "var(--text-muted)" }}>Admin-only user, role, team and visibility management.</p></section>
    {message ? <section className="card"><strong>{message}</strong></section> : null}
    <section className="card">
      <h3>{form.id ? "Edit user" : "Create user"}</h3>
      <form className="grid grid-2" onSubmit={save}>
        <label>Email<input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></label>
        <label>Display name<input value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} /></label>
        {!form.id ? <label>Temporary password<input value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Auto-generate if empty" /></label> : null}
        <label>Role<select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>{roles.map(r => <option key={r}>{r}</option>)}</select></label>
        <label>Team<input value={form.team} onChange={e => setForm({ ...form, team: e.target.value })} /></label>
        <label>Agent name<input value={form.agent_name} onChange={e => setForm({ ...form, agent_name: e.target.value })} /></label>
        <label>Visibility scope<select value={form.visibility_scope} onChange={e => setForm({ ...form, visibility_scope: e.target.value })}>{scopes.map(s => <option key={s}>{s}</option>)}</select></label>
        <label><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Active</label>
        <div className="actions"><button className="button" type="submit">Save user</button><button className="button button-secondary" type="button" onClick={() => setForm(emptyForm)}>New</button></div>
      </form>
    </section>
    <section className="card"><h3>Users</h3><div className="table-wrap"><table><thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Scope</th><th>Team</th><th>Agent</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {users.map(u => <tr key={u.id}><td>{u.email}</td><td>{u.display_name || "—"}</td><td><span className="badge badge-uploaded">{u.role}</span></td><td><span className="badge badge-transcribed">{u.visibility_scope}</span></td><td>{u.team || "—"}</td><td>{u.agent_name || "—"}</td><td>{u.is_active ? "Active" : "Inactive"}</td><td className="actions"><button className="button button-secondary" onClick={() => edit(u)}>Edit</button><button className="button button-secondary" onClick={() => resetPassword(u)}>Reset password</button><button className="button button-secondary" onClick={() => setActive(u, !u.is_active)}>{u.is_active ? "Deactivate" : "Activate"}</button></td></tr>)}
    </tbody></table></div></section>
  </main></AdminOnly>;
}
