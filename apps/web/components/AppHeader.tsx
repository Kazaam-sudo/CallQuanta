"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { API_BASE_URL, fetchWithCredentials } from "../lib/api";
import { useAuth } from "./AuthProvider";
import { useI18n } from "./I18nProvider";
import { LanguageSelector } from "./LanguageSelector";

export function AppHeader() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const { user, status, markUnauthenticated } = useAuth();

  async function logout() {
    await fetchWithCredentials(`${API_BASE_URL}/auth/logout`, {
      method: "POST",
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);
    markUnauthenticated();
    router.replace("/login");
    router.refresh();
  }

  const roleLabel = user?.role ? t(`role.${user.role}`) : "";
  const navItems = user
    ? [
        { href: "/dashboard", label: t("nav.dashboard") },
        { href: "/calls", label: t("nav.calls") },
        { href: "/qa-reviews", label: t("qa.reviewQueue") },
        ...(user.role === "admin" ? [{ href: "/settings", label: t("nav.settings") }] : []),
      ]
    : [];
  const isActive = (href: string) => pathname === href || Boolean(pathname?.startsWith(`${href}/`));

  return (
    <header className="app-header">
      <div className="header-inner">
        <Link href={user ? "/dashboard" : "/"} className="brand-link" aria-label="CallQuanta">
          <h1 className="brand-title">CallQuanta</h1>
          <p className="brand-subtitle">{t("app.subtitle")}</p>
        </Link>
        <div className="header-actions">
          {status === "authenticated" ? (
            <nav className="top-nav" aria-label={t("nav.main")}>
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} className={isActive(item.href) ? "active" : ""}>
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : null}
          <LanguageSelector />
          {user ? (
            <div className="user-chip" title={`${user.email} · ${user.role}`}>
              <span>{user.email}</span>
              <span className="badge badge-uploaded">{roleLabel}</span>
              <button className="button button-secondary" onClick={logout}>{t("auth.logout")}</button>
            </div>
          ) : status === "unauthenticated" || status === "error" ? (
            <Link href="/login" className="button button-secondary">{t("auth.login")}</Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
