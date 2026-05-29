"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../components/I18nProvider";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

type MetricRow = { calls_count: number; analyzed_calls_count: number; average_score: number | null; lowest_score: number | null; highest_score: number | null; latest_review_at?: string | null; agent_name?: string; team?: string; campaign?: string };
type DashboardMetrics = { summary: { total_calls: number; uploaded_calls: number; transcribed_calls: number; analyzed_calls: number; analysis_failed_calls: number; total_qa_reviews: number; average_score: number | null; lowest_score: number | null; highest_score: number | null }; latest_reviews: any[]; lowest_score_reviews: any[]; criteria_problem_summary: any[]; agent_metrics: MetricRow[]; team_metrics: MetricRow[]; campaign_metrics: MetricRow[] };

const fmt = (value: number | null | undefined) => (value == null ? "-" : Number(value).toFixed(2));
const scorePercent = (value: number | null | undefined) => Math.max(0, Math.min(100, Number(value ?? 0)));

export default function Page() {
  const [data, setData] = useState<DashboardMetrics | null>(null);
  const { t } = useI18n();

  useEffect(() => { const load = async () => { const res = await fetch(`${API_BASE_URL}/dashboard/metrics`); if (res.ok) setData(await res.json()); }; load(); }, []);

  const emptyMessage = useMemo(() => {
    if (!data) return null;
    if (data.summary.total_calls === 0) return t("dashboard.emptyUpload");
    if (data.summary.total_qa_reviews === 0) return t("dashboard.emptyAnalyze");
    return null;
  }, [data, t]);

  if (!data) return <main className="grid"><section className="card empty-state">Loading dashboard…</section></main>;

  return (
    <main className="grid page-stack">
      {emptyMessage ? <section className="card empty-state">{emptyMessage}</section> : null}

      <section className="kpi-grid">
        {[
          [t("dashboard.totalCalls"), data.summary.total_calls, t("dashboard.helper.totalCalls")],
          [t("dashboard.analyzedCalls"), data.summary.analyzed_calls, t("dashboard.helper.analyzedCalls")],
          [t("dashboard.averageScore"), fmt(data.summary.average_score), t("dashboard.helper.averageScore")],
          [t("dashboard.failedAnalyses"), data.summary.analysis_failed_calls, t("calls.failed")],
          [t("dashboard.totalQaReviews"), data.summary.total_qa_reviews, "QA"],
        ].map(([label, value, helper]) => <article key={String(label)} className="kpi-card"><small>{helper}</small><strong>{value}</strong><div>{label}</div></article>)}
      </section>

      <section className="card"><div className="section-header"><h2>{t("dashboard.latestQaReviews")}</h2></div>{data.latest_reviews.length === 0 ? <p className="empty-state">{t("dashboard.emptyAnalyze")}</p> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Call</th><th>Agent</th><th>Score</th><th>Model</th><th>Scorecard</th><th>Link</th></tr></thead><tbody>{data.latest_reviews.map((r) => <tr key={r.review_id}><td>{r.created_at ? new Date(r.created_at).toLocaleString() : "-"}</td><td>{r.filename || `Call #${r.call_id}`}</td><td>{r.agent_name || "-"}</td><td><strong>{fmt(r.score)}</strong></td><td>{r.model || "-"}</td><td>{r.scorecard_name || "-"}</td><td><Link href={`/calls/${r.call_id}`}>{t("dashboard.open")}</Link></td></tr>)}</tbody></table></div>}</section>

      <section className="card"><div className="section-header"><h2>{t("dashboard.lowestScoreReviews")}</h2></div>{data.lowest_score_reviews.length === 0 ? <p className="empty-state">{t("dashboard.emptyAnalyze")}</p> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Score</th><th>Call</th><th>Agent</th><th>Team</th><th>Campaign</th><th>Summary</th><th>Link</th></tr></thead><tbody>{data.lowest_score_reviews.map((r) => <tr key={r.review_id}><td>{fmt(r.score)}</td><td>{r.filename || `Call #${r.call_id}`}</td><td>{r.agent_name || "-"}</td><td>{r.team || "-"}</td><td>{r.campaign || "-"}</td><td className="summary-cell">{r.summary || "-"}</td><td><Link href={`/calls/${r.call_id}`}>{t("dashboard.open")}</Link></td></tr>)}</tbody></table></div>}</section>

      <section className="card"><div className="section-header"><h2>{t("dashboard.criteriaAttention")}</h2></div>{data.criteria_problem_summary.length === 0 ? <p className="empty-state">{t("dashboard.emptyAnalyze")}</p> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Criterion</th><th>Avg %</th><th>Warnings</th><th>Criticals</th><th>Count</th></tr></thead><tbody>{data.criteria_problem_summary.map((r: any) => <tr key={r.criterion_title}><td>{r.criterion_title}</td><td><ScoreBar value={r.average_percent} /></td><td>{r.warning_count}</td><td>{r.critical_count}</td><td>{r.reviews_count}</td></tr>)}</tbody></table></div>}</section>

      <section className="card"><div className="section-header"><h2>{t("dashboard.agentPerformance")}</h2></div>{renderMetricsTable(data.agent_metrics, "agent_name", true)}</section>
      <section className="card"><div className="section-header"><h2>{t("dashboard.teamPerformance")}</h2></div>{renderMetricsTable(data.team_metrics, "team")}</section>
      <section className="card"><div className="section-header"><h2>{t("dashboard.campaignPerformance")}</h2></div>{renderMetricsTable(data.campaign_metrics, "campaign")}</section>
    </main>
  );
}

function ScoreBar({ value }: { value: number | null | undefined }) { return <div className="score-bar"><div className="score-bar-track"><div className="score-bar-fill" style={{ width: `${scorePercent(value)}%` }} /></div><small>{fmt(value)}%</small></div>; }

function renderMetricsTable(rows: MetricRow[], keyName: "agent_name" | "team" | "campaign", includeLatest = false) {
  if (rows.length === 0) return <p className="empty-state">No metrics yet.</p>;
  return <div className="table-wrap"><table className="data-table"><thead><tr><th>{keyName.replace("_", " ")}</th><th>Calls</th><th>Analyzed</th><th>Average score</th><th>Lowest score</th><th>Highest score</th>{includeLatest ? <th>Latest review</th> : null}</tr></thead><tbody>{rows.map((r) => <tr key={String(r[keyName])}><td>{r[keyName] || "Unassigned"}</td><td>{r.calls_count}</td><td>{r.analyzed_calls_count}</td><td><ScoreBar value={r.average_score} /></td><td>{fmt(r.lowest_score)}</td><td>{fmt(r.highest_score)}</td>{includeLatest ? <td>{r.latest_review_at ? new Date(r.latest_review_at).toLocaleString() : "-"}</td> : null}</tr>)}</tbody></table></div>;
}
