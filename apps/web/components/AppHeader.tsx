"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { API_BASE_URL, fetchWithCredentials } from "../lib/api";
import { useI18n } from "./I18nProvider";
import { LanguageSelector } from "./LanguageSelector";

type AuthUser = { email: string; role: "admin" | "manager" | "supervisor" | "agent" | "viewer" | string; must_change_password?: boolean };

export function AppHeader() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);

  const loadUser = useCallback(async () => {
    try {
      const response = await fetchWithCredentials(`${API_BASE_URL}/auth/me`, { cache: "no-store" });
      const data = response.ok ? await response.json() : null;
      setUser(data?.user || null);
      if (data?.user?.must_change_password && !["/change-password", "/login"].includes(pathname || "")) {
        router.push("/change-password");
      }
    } catch {
      setUser(null);
    } finally {
      setAuthLoaded(true);
    }
  }, [pathname, router]);

  useEffect(() => {
    loadUser();
  }, [loadUser, pathname]);

  useEffect(() => {
    const onAuthChange = () => loadUser();
    window.addEventListener("callquanta-auth-changed", onAuthChange);
    return () => window.removeEventListener("callquanta-auth-changed", onAuthChange);
  }, [loadUser]);

  async function logout() {
    await fetchWithCredentials(`${API_BASE_URL}/auth/logout`, { method: "POST" }).catch(() => null);
    setUser(null);
    window.dispatchEvent(new Event("callquanta-auth-changed"));
    router.push("/login");
    router.refresh();
  }

  const roleLabel = user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : "";

  return (
    <header className="app-header">
      <div className="header-inner">
        <Link href="/dashboard" className="brand-link" aria-label="CallQuanta dashboard">
          <h1 className="brand-title">CallQuanta</h1>
          <p className="brand-subtitle">
            Open-source AI QA for contact centers
          </p>
        </Link>
        <div className="header-actions">
          <nav className="top-nav" aria-label="Main navigation">
            <Link href="/dashboard">{t("nav.dashboard")}</Link>
            <Link href="/calls">{t("nav.calls")}</Link>
            <Link href="/qa-reviews">{t("qa.reviewQueue")}</Link>
            {user?.role === "admin" ? <Link href="/settings">{t("nav.settings")}</Link> : null}
          </nav>
          <LanguageSelector />
          {user ? (
            <div className="user-chip" title={`${user.email} · ${user.role}`}>
              <span>{user.email}</span>
              <span className="badge badge-uploaded">{roleLabel}</span>
              <button className="button button-secondary" onClick={logout}>{t("auth.logout")}</button>
            </div>
          ) : authLoaded ? (
            <Link href="/login" className="button button-secondary">{t("auth.login")}</Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
