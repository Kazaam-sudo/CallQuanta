"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

type MetricRow = {
  calls_count: number;
  analyzed_calls_count: number;
  average_score: number | null;
  lowest_score: number | null;
  highest_score: number | null;
  latest_review_at?: string | null;
  agent_name?: string;
  team?: string;
  campaign?: string;
};

type DashboardMetrics = {
  summary: {
    total_calls: number;
    uploaded_calls: number;
    transcribed_calls: number;
    analyzed_calls: number;
    analysis_failed_calls: number;
    total_qa_reviews: number;
    average_score: number | null;
    lowest_score: number | null;
    highest_score: number | null;
  };
  latest_reviews: any[];
  lowest_score_reviews: any[];
  criteria_problem_summary: any[];
  agent_metrics: MetricRow[];
  team_metrics: MetricRow[];
  campaign_metrics: MetricRow[];
};

const fmt = (value: number | null | undefined) => (value == null ? "-" : Number(value).toFixed(2));

export default function Page() {
  const [data, setData] = useState<DashboardMetrics | null>(null);

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`${API_BASE_URL}/dashboard/metrics`);
      if (!res.ok) return;
      setData(await res.json());
    };
    load();
  }, []);

  const emptyMessage = useMemo(() => {
    if (!data) return null;
    if (data.summary.total_calls === 0) return "Upload your first call to start building QA metrics.";
    if (data.summary.total_qa_reviews === 0) return "Analyze calls to populate dashboard metrics.";
    return null;
  }, [data]);

  if (!data) return <main className="grid"><section className="card">Loading dashboard…</section></main>;

  return (
    <main className="grid" style={{ gap: 16 }}>
      {emptyMessage ? <section className="card">{emptyMessage}</section> : null}

      <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        {[
          ["Total calls", data.summary.total_calls],
          ["Analyzed calls", data.summary.analyzed_calls],
          ["Average score", fmt(data.summary.average_score)],
          ["Failed analyses", data.summary.analysis_failed_calls],
          ["Total QA reviews", data.summary.total_qa_reviews],
        ].map(([label, value]) => (
          <article key={String(label)} className="card" style={{ padding: 12 }}><div>{label}</div><h3 style={{ margin: 0 }}>{value}</h3></article>
        ))}
      </section>

      <section className="card"><h2>Latest QA reviews</h2><table><thead><tr><th>Date</th><th>Call</th><th>Agent</th><th>Score</th><th>Model</th><th>Scorecard</th><th>Link</th></tr></thead><tbody>{data.latest_reviews.map((r) => <tr key={r.review_id}><td>{r.created_at ? new Date(r.created_at).toLocaleString() : "-"}</td><td>{r.filename || `Call #${r.call_id}`}</td><td>{r.agent_name}</td><td>{fmt(r.score)}</td><td>{r.model || "-"}</td><td>{r.scorecard_name || "-"}</td><td><Link href={`/calls/${r.call_id}`}>Open</Link></td></tr>)}</tbody></table></section>

      <section className="card"><h2>Lowest score reviews</h2><table><thead><tr><th>Score</th><th>Call</th><th>Agent</th><th>Team</th><th>Campaign</th><th>Summary</th><th>Link</th></tr></thead><tbody>{data.lowest_score_reviews.map((r) => <tr key={r.review_id}><td>{fmt(r.score)}</td><td>{r.filename || `Call #${r.call_id}`}</td><td>{r.agent_name}</td><td>{r.team}</td><td>{r.campaign}</td><td style={{ maxWidth: 320 }}>{r.summary || "-"}</td><td><Link href={`/calls/${r.call_id}`}>Open</Link></td></tr>)}</tbody></table></section>

      <section className="card"><h2>Criteria needing attention</h2><table><thead><tr><th>Criterion</th><th>Avg %</th><th>Warnings</th><th>Criticals</th><th>Count</th></tr></thead><tbody>{data.criteria_problem_summary.map((r: any) => <tr key={r.criterion_title}><td>{r.criterion_title}</td><td><div style={{ minWidth: 140 }}><div style={{ background: "#eee", borderRadius: 4, height: 8 }}><div style={{ width: `${Math.max(0, Math.min(100, r.average_percent || 0))}%`, background: "#ef4444", height: 8, borderRadius: 4 }} /></div><small>{fmt(r.average_percent)}%</small></div></td><td>{r.warning_count}</td><td>{r.critical_count}</td><td>{r.reviews_count}</td></tr>)}</tbody></table></section>

      <section className="card"><h2>Agent performance</h2>{renderMetricsTable(data.agent_metrics, "agent_name", true)}</section>
      <section className="card"><h2>Team performance</h2>{renderMetricsTable(data.team_metrics, "team")}</section>
      <section className="card"><h2>Campaign performance</h2>{renderMetricsTable(data.campaign_metrics, "campaign")}</section>
    </main>
  );
}

function renderMetricsTable(rows: MetricRow[], keyName: "agent_name" | "team" | "campaign", includeLatest = false) {
  return <table><thead><tr><th>{keyName.replace("_", " ")}</th><th>Calls</th><th>Analyzed</th><th>Average score</th><th>Lowest score</th><th>Highest score</th>{includeLatest ? <th>Latest review</th> : null}</tr></thead><tbody>{rows.map((r) => <tr key={String(r[keyName])}><td>{r[keyName] || "Unassigned"}</td><td>{r.calls_count}</td><td>{r.analyzed_calls_count}</td><td>{fmt(r.average_score)}</td><td>{fmt(r.lowest_score)}</td><td>{fmt(r.highest_score)}</td>{includeLatest ? <td>{r.latest_review_at ? new Date(r.latest_review_at).toLocaleString() : "-"}</td> : null}</tr>)}</tbody></table>;
}
