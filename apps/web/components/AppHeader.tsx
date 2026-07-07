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

  const roleLabel = user?.role ? t(`role.${user.role}`) : "";
  const navItems = [
    { href: "/dashboard", label: t("nav.dashboard") },
    { href: "/calls", label: t("nav.calls") },
    { href: "/qa-reviews", label: t("qa.reviewQueue") },
    ...(user?.role === "admin" ? [{ href: "/settings", label: t("nav.settings") }] : []),
  ];
  const isActive = (href: string) => pathname === href || Boolean(pathname?.startsWith(`${href}/`));

  return (
    <header className="app-header">
      <div className="header-inner">
        <Link href="/dashboard" className="brand-link" aria-label={t("nav.dashboard")}>
          <h1 className="brand-title">CallQuanta</h1>
          <p className="brand-subtitle">
            {t("app.subtitle")}
          </p>
        </Link>
        <div className="header-actions">
          <nav className="top-nav" aria-label={t("nav.main")}>
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className={isActive(item.href) ? "active" : ""}>
                {item.label}
              </Link>
            ))}
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
