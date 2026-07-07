"use client";

import Link from "next/link";
import { useI18n } from "../components/I18nProvider";

export default function Home() {
  const { t } = useI18n();
  const workflow = [
    ["dashboard.workflow.upload.title", "dashboard.workflow.upload.text"],
    ["dashboard.workflow.transcript.title", "dashboard.workflow.transcript.text"],
    ["dashboard.workflow.qa.title", "dashboard.workflow.qa.text"],
    ["dashboard.workflow.growth.title", "dashboard.workflow.growth.text"],
  ];
  const outputs = [
    "dashboard.output.score",
    "dashboard.output.topic",
    "dashboard.output.actions",
    "dashboard.output.evidence",
    "dashboard.output.feedback",
  ];

  return (
    <main className="grid page-stack">
      <section className="card hero">
        <h1>{t("dashboard.productTitle")}</h1>
        <p>{t("dashboard.productHelp")}</p>
        <p style={{ marginTop: 18 }}>
          <Link href="/calls" className="button">
            {t("dashboard.primaryAction")}
          </Link>
        </p>
      </section>

      <section className="card">
        <div className="section-header">
          <div>
            <h2>{t("dashboard.workflow")}</h2>
            <small>{t("dashboard.workflowHelp")}</small>
          </div>
        </div>
        <div className="demo-summary-grid">
          {workflow.map(([title, text], index) => (
            <article key={title} className="demo-summary-card">
              <small>{index + 1}</small>
              <strong>{t(title)}</strong>
              <span className="technical-detail">{t(text)}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>{t("dashboard.outputs")}</h2>
        <div className="kpi-grid compact">
          {outputs.map((key) => (
            <article key={key} className="kpi-card">
              <strong>{t(key)}</strong>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
