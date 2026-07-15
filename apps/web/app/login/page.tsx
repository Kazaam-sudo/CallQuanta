"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "../../components/AuthProvider";
import { useI18n } from "../../components/I18nProvider";
import { API_BASE_URL, fetchWithCredentials } from "../../lib/api";
import { safeNextPath } from "../../lib/auth-routing.mjs";

function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, user, error: authError, markAuthenticated } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const nextPath = safeNextPath(searchParams.get("next"));

  useEffect(() => {
    if (status === "authenticated" && user) {
      router.replace(user.must_change_password ? "/change-password" : nextPath);
    }
  }, [nextPath, router, status, user]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetchWithCredentials(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.detail || t("auth.invalidCredentials"));
      if (!body?.user) throw new Error(t("auth.loginFailed"));
      markAuthenticated(body.user);
      router.replace(body.user.must_change_password ? "/change-password" : nextPath);
      router.refresh();
    } catch (err) {
      const message = err instanceof DOMException && err.name === "AbortError"
        ? t("auth.loginFailed")
        : err instanceof Error
          ? err.message
          : t("auth.loginFailed");
      setError(message);
    } finally {
      window.clearTimeout(timeout);
      setIsSubmitting(false);
    }
  }

  return (
    <section className="card" style={{ maxWidth: 440, margin: "48px auto" }}>
      <h2>{t("auth.signIn")}</h2>
      <p style={{ color: "var(--text-muted)" }}>{t("auth.loginHelp")}</p>
      {status === "error" && authError ? <div className="notice">{t("auth.sessionCheckFailed")}</div> : null}
      <form className="grid" style={{ gap: 14 }} onSubmit={submit}>
        <label htmlFor="login-email">{t("auth.email")}</label>
        <input id="login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
        <label htmlFor="login-password">{t("auth.password")}</label>
        <div className="password-field-row">
          <input id="login-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
          <button className="button button-secondary" type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? t("auth.hidePassword") : t("auth.showPassword")}</button>
        </div>
        {error && <div className="notice notice-danger" role="alert">{error}</div>}
        <button className="button" type="submit" disabled={isSubmitting}>{isSubmitting ? t("auth.signingIn") : t("auth.signIn")}</button>
      </form>
    </section>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<section className="card" style={{ maxWidth: 440, margin: "48px auto" }}>...</section>}>
      <LoginForm />
    </Suspense>
  );
}
