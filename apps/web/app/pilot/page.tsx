"use client";

import Link from "next/link";
import { useI18n } from "../../components/I18nProvider";

export default function PilotPage() {
  const { t } = useI18n();
  const steps = [
    "pilot.step.upload",
    "pilot.step.transcript",
    "pilot.step.qa",
    "pilot.step.evidence",
    "pilot.step.human",
    "pilot.step.feedback",
    "pilot.step.coaching",
    "pilot.step.dashboard",
    "pilot.step.export",
    "pilot.step.share",
  ];

  return (
    <main className="grid page-stack">
      <section className="card">
        <div className="section-header">
          <div>
            <h2>{t("pilot.title")}</h2>
            <small>{t("pilot.help")}</small>
          </div>
          <Link className="button button-secondary" href="/dashboard">{t("nav.dashboard")}</Link>
        </div>
        <ol>{steps.map((step) => <li key={step}>{t(step)}</li>)}</ol>
      </section>
      <section className="card">
        <h3>{t("pilot.practicalHelp")}</h3>
        <ul>
          <li><strong>{t("pilot.help.whatCheck")}</strong> {t("pilot.help.whatCheckText")}</li>
          <li><strong>{t("pilot.transcriptQuality")}:</strong> {t("pilot.help.transcriptText")}</li>
          <li><strong>{t("pilot.qaAnalysisQuality")}:</strong> {t("pilot.help.qaText")}</li>
          <li><strong>{t("qa.disputed")}:</strong> {t("pilot.help.disputedText")}</li>
          <li><strong>{t("qa.coachingActions")}:</strong> {t("pilot.help.coachingText")}</li>
        </ul>
      </section>
    </main>
  );
}
