"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { API_BASE_URL, fetchWithCredentials } from "../../lib/api";
import { SettingsNav } from "../../components/SettingsNav";
import { useI18n } from "../../components/I18nProvider";

const cards = [
  { href: "/settings/llm", titleKey: "settings.llmProviders", text: "Configure LLM endpoints. Saved API keys are never shown after save." },
  { href: "/settings/stt", titleKey: "settings.sttProviders", text: "Configure transcription providers. Saved API keys display only as configured." },
  { href: "/settings/scorecard", titleKey: "settings.scorecard", text: "Edit QA criteria and reset to the default scorecard." },
  { href: "/settings/workspace", titleKey: "settings.workspaceLanguage", text: "Manage interface, workspace and QA report languages." },
  { href: "/settings/integrations", titleKey: "settings.telephonyIntegrations", text: "Manage webhook integrations and regenerate ingestion tokens." },
  { href: "/settings/system-status", titleKey: "settings.systemStatus", text: "Inspect API, database, Redis, queue, worker and storage health." },
  { href: "/settings/retention", titleKey: "settings.retention", text: "Preview and run manual cleanup for old audio, transcripts, QA reviews and ingestion events." },
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

  if (!loaded) return null;

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
      <section className="card">
        <h2>{t("nav.settings")}</h2>
        <p style={{ color: "var(--text-muted)" }}>Production readiness controls for access, providers, system status, retention and deployment.</p>
        <SettingsNav />
      </section>
      <section className="grid grid-2">
        {cards.map((card) => (
          <Link key={card.href} className="card" href={card.href} style={{ textDecoration: "none", color: "inherit" }}>
            <h3>{t(card.titleKey)}</h3>
            <p style={{ color: "var(--text-muted)" }}>{card.text}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
