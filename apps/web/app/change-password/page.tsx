"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "../../components/I18nProvider";
import { API_BASE_URL, fetchWithCredentials } from "../../lib/api";

const passwordPattern = /^(?=.*[A-Za-zА-Яа-я])(?=.*\d).{8,}$/;

function PasswordInput({ label, value, onChange, autoComplete }: { label: string; value: string; onChange: (value: string) => void; autoComplete: string }) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  return <label>{label}<div className="password-field-row"><input type={visible ? "text" : "password"} value={value} onChange={e => onChange(e.target.value)} autoComplete={autoComplete} required /><button className="button button-secondary" type="button" onClick={() => setVisible(!visible)}>{visible ? t("auth.hidePassword") : t("auth.showPassword")}</button></div></label>;
}

export default function ChangePasswordPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordValid = passwordPattern.test(newPassword);
  const passwordsMatch = newPassword === confirmPassword;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!passwordValid) return setError(t("users.weakPassword"));
    if (!passwordsMatch) return setError(t("auth.passwordsDoNotMatch"));
    setIsSubmitting(true);
    try {
      const response = await fetchWithCredentials(`${API_BASE_URL}/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || t("auth.changePasswordFailed"));
      window.dispatchEvent(new Event("callquanta-auth-changed"));
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.changePasswordFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return <section className="card" style={{ maxWidth: 520, margin: "48px auto" }}>
    <h2>{t("users.changePassword")}</h2>
    <p style={{ color: "var(--text-muted)" }}>{t("users.passwordHint")}</p>
    <form className="grid" style={{ gap: 14 }} onSubmit={submit}>
      <PasswordInput label={t("auth.currentPassword")} value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
      <PasswordInput label={t("auth.newPassword")} value={newPassword} onChange={setNewPassword} autoComplete="new-password" />
      <small className={newPassword && !passwordValid ? "field-error" : ""}>{newPassword && !passwordValid ? t("users.weakPassword") : t("users.passwordHint")}</small>
      <PasswordInput label={t("auth.confirmPassword")} value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
      {confirmPassword && !passwordsMatch ? <small className="field-error">{t("auth.passwordsDoNotMatch")}</small> : null}
      {error ? <div className="notice notice-danger message-error">{error}</div> : null}
      <button className="button" type="submit" disabled={isSubmitting || !passwordValid || !passwordsMatch}>{isSubmitting ? t("common.saving") : t("users.changePassword")}</button>
    </form>
  </section>;
}
