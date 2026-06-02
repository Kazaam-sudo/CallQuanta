"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "../../../components/I18nProvider";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

type SttSettings = { mode: string; model: string };

export default function Page() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<SttSettings | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/settings/stt`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (data) setSettings(data); })
      .catch(() => {});
  }, []);

  return (
    <main className="grid page-stack">
      <section className="card">
        <div className="actions"><Link href="/settings/llm">LLM Providers</Link><Link href="/settings/scorecard">Scorecard</Link><Link href="/settings/workspace">Workspace Language</Link><Link href="/settings/stt">STT</Link></div>
        <h2>{t("settings.sttSettings")}</h2>
        <p className="message">{t("settings.sttExplanation")}</p>
        <div className="meta-grid">
          <div className="meta-item"><small>{t("settings.sttMode")}</small>{settings?.mode || "-"}</div>
          <div className="meta-item"><small>{t("settings.currentSttModel")}</small>{settings?.model || "-"}</div>
        </div>
      </section>
    </main>
  );
}
