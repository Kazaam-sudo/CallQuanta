"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DemoModeNotice } from "../../components/DemoModeNotice";
import { API_BASE_URL, fetchWithCredentials } from "../../lib/api";
import { useI18n } from "../../components/I18nProvider";

const cards = [
  { href: "/settings/llm", titleKey: "settings.llmProviders", textKey: "settings.card.llm" },
  { href: "/settings/stt", titleKey: "settings.sttProviders", textKey: "settings.card.stt" },
  { href: "/settings/scorecard", titleKey: "settings.scorecard", textKey: "settings.card.scorecard" },
  { href: "/settings/call-topics", titleKey: "settings.callTopics", textKey: "settings.card.callTopics" },
  { href: "/settings/workspace", titleKey: "settings.workspaceLanguage", textKey: "settings.card.workspace" },
  { href: "/settings/integrations", titleKey: "settings.telephonyIntegrations", textKey: "settings.card.telephony" },
  { href: "/settings/users", titleKey: "settings.usersAccess", textKey: "settings.card.users" },
  { href: "/settings/system-status", titleKey: "settings.systemStatus", textKey: "settings.card.systemStatus" },
  { href: "/settings/retention", titleKey: "settings.retention", textKey: "settings.card.retention" },
  { href: "/settings/audit-log", titleKey: "settings.auditLog", textKey: "settings.card.auditLog" },
];

type AuthUser = { email: string; role: string };

export default function SettingsPage() {
  const { t } = useI18n();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchWithCredentials(`${API_BASE_URL}/auth/me`, { cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => setUser(data?.user || null))
      .catch(() => setUser(null))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return <section className="card empty-state">{t("settings.loading")}</section>;

  if (user?.role !== "admin") {
    return (
      <main className="grid" style={{ gap: 18 }}>
        <section className="card">
          <h2>{t("settings.adminOnly")}</h2>
          <p style={{ color: "var(--text-muted)" }}>{t("settings.adminOnlyHelp")}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="grid" style={{ gap: 18 }}>
      <section className="card hero-card settings-hero">
        <h2>{t("nav.settings")}</h2>
        <p style={{ color: "var(--text-muted)" }}>{t("settings.description")}</p>
      </section>
      <DemoModeNotice />
      <section className="grid grid-2 settings-card-grid">
        {cards.map((card, index) => (
          <Link key={card.href} className={`card settings-card settings-card-${(index % 5) + 1}`} href={card.href} style={{ textDecoration: "none", color: "inherit" }}>
            <span className="settings-card-marker" aria-hidden="true" />
            <h3>{t(card.titleKey || "")}</h3>
            <p style={{ color: "var(--text-muted)" }}>{t(card.textKey || "")}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
