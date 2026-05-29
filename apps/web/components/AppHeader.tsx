"use client";

import Link from "next/link";
import { useI18n } from "./I18nProvider";
import { LanguageSelector } from "./LanguageSelector";

export function AppHeader() {
  const { t } = useI18n();
  return (
    <header className="app-header">
      <div className="header-inner">
        <div>
          <h1 className="brand-title">CallQuanta</h1>
          <p className="brand-subtitle">Open-source AI QA for contact centers</p>
        </div>
        <div className="header-actions">
          <nav className="top-nav" aria-label="Main navigation">
            <Link href="/dashboard">{t("nav.dashboard")}</Link>
            <Link href="/calls">{t("nav.calls")}</Link>
            <Link href="/settings/llm">{t("nav.settings")}</Link>
          </nav>
          <LanguageSelector />
        </div>
      </div>
    </header>
  );
}
