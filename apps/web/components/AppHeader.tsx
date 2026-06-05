"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "./I18nProvider";
import { LanguageSelector } from "./LanguageSelector";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

type AuthUser = { email: string; role: "admin" | "viewer" | string };

export function AppHeader() {
  const { t } = useI18n();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/auth/me`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) setUser(data?.user || null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => { cancelled = true; };
  }, []);

  async function logout() {
    await fetch(`${API_BASE_URL}/auth/logout`, { method: "POST" }).catch(() => null);
    setUser(null);
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="app-header">
      <div className="header-inner">
        <div>
          <h1 className="brand-title">CallQuanta</h1>
          <p className="brand-subtitle">
            Open-source AI QA for contact centers
          </p>
        </div>
        <div className="header-actions">
          <nav className="top-nav" aria-label="Main navigation">
            <Link href="/dashboard">{t("nav.dashboard")}</Link>
            <Link href="/calls">{t("nav.calls")}</Link>
            <Link href="/settings/llm">{t("nav.settings")}</Link>
          </nav>
          <LanguageSelector />
          {user ? (
            <div className="user-chip" title={user.email}>
              <span>{user.email}</span>
              <span className="badge badge-uploaded">{user.role}</span>
              <button className="button button-secondary" onClick={logout}>Logout</button>
            </div>
          ) : (
            <Link href="/login" className="button button-secondary">Login</Link>
          )}
        </div>
      </div>
    </header>
  );
}
