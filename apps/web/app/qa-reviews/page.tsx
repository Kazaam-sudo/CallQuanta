"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../../components/I18nProvider";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

type QAQueueItem = {
  id: number;
  call_id: number;
  filename?: string | null;
  created_at?: string | null;
  score?: number | null;
  human_total_score?: number | null;
  ai_human_score_delta?: number | null;
  review_status?: string;
  calibration_flag?: boolean;
  agent_name?: string | null;
  team?: string | null;
  campaign?: string | null;
  coaching_actions_count?: number;
  open_coaching_actions_count?: number;
  assigned_to_email?: string | null;
  feedback_status?: string;
};

export default function QAReviewsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<QAQueueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ view: "", review_status: "", calibration_flag: "", min_delta: "", agent_name: "", team: "", campaign: "", assigned_to: "", feedback_status: "" });

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    return params.toString();
  }, [filters]);

  const load = useCallback(async () => {
    const response = await fetch(`${API_BASE_URL}/qa-reviews?${query}`);
    if (response.ok) {
      const data = await response.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
    }
  }, [query]);

  useEffect(() => { load(); }, [load]);
  const update = (key: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));

  return <main className="grid page-stack">
    <section className="card">
      <div className="section-header">
        <div>
          <h2>{t("qa.reviewQueue")}</h2>
          <small>{total} {t("dashboard.totalQaReviews")}</small>
        </div>
        <Link className="button button-secondary" href="/dashboard">{t("nav.dashboard")}</Link>
      </div>
      <div className="filters-grid">
        <label>View<select value={filters.view} onChange={(e) => update("view", e.target.value)}><option value="">All visible reviews</option><option value="my_assigned">My assigned reviews</option><option value="ai_unreviewed">AI generated, not human reviewed</option><option value="disputed">Disputed</option><option value="needs_rework">Needs rework</option><option value="calibration">Calibration samples</option><option value="low_score">Low score reviews</option></select></label>
        <label>{t("qa.reviewStatus")}<select value={filters.review_status} onChange={(e) => update("review_status", e.target.value)}>
          <option value="">All</option>
          <option value="ai_generated">AI generated</option>
          <option value="human_reviewed">{t("qa.humanReviewed")}</option>
          <option value="approved">{t("qa.approved")}</option>
          <option value="disputed">{t("qa.disputed")}</option>
          <option value="needs_rework">{t("qa.needsRework")}</option>
        </select></label>
        <label>{t("qa.calibrationSample")}<select value={filters.calibration_flag} onChange={(e) => update("calibration_flag", e.target.value)}><option value="">All</option><option value="true">Yes</option><option value="false">No</option></select></label>
        <label>{t("qa.highDelta")}<input type="number" step="0.01" value={filters.min_delta} onChange={(e) => update("min_delta", e.target.value)} placeholder="10" /></label>
        <label>{t("calls.agent")}<input value={filters.agent_name} onChange={(e) => update("agent_name", e.target.value)} /></label>
        <label>{t("calls.team")}<input value={filters.team} onChange={(e) => update("team", e.target.value)} /></label>
        <label>{t("calls.campaign")}<input value={filters.campaign} onChange={(e) => update("campaign", e.target.value)} /></label>
        <label>Assigned to<input value={filters.assigned_to} onChange={(e) => update("assigned_to", e.target.value)} placeholder="me or user id" /></label>
        <label>Feedback status<select value={filters.feedback_status} onChange={(e) => update("feedback_status", e.target.value)}><option value="">All</option><option value="no_feedback">No feedback</option><option value="feedback_added">Feedback added</option><option value="has_issue">Has issue</option></select></label>
      </div>
    </section>
    <section className="card">
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Date</th><th>Call</th><th>Agent</th><th>Team</th><th>Campaign</th><th>Status</th><th>Assigned to</th><th>Feedback</th><th>AI</th><th>Human</th><th>Delta</th><th>Coaching</th><th>Link</th></tr></thead>
          <tbody>{items.map((item) => <tr key={item.id}>
            <td>{item.created_at ? new Date(item.created_at).toLocaleString() : "-"}</td>
            <td>{item.filename || `Call #${item.call_id}`}{item.calibration_flag ? <span className="badge badge-uploaded" style={{ marginLeft: 6 }}>{t("qa.calibrationSample")}</span> : null}</td>
            <td>{item.agent_name || "-"}</td>
            <td>{item.team || "-"}</td>
            <td>{item.campaign || "-"}</td>
            <td><span className="badge">{(item.review_status || "ai_generated").replaceAll("_", " ")}</span></td>
            <td>{item.assigned_to_email || "-"}</td>
            <td><span className="badge">{(item.feedback_status || "no_feedback").replaceAll("_", " ")}</span></td>
            <td>{item.score ?? "-"}</td>
            <td>{item.human_total_score ?? "-"}</td>
            <td>{item.ai_human_score_delta ?? "-"}</td>
            <td>{item.open_coaching_actions_count || 0}/{item.coaching_actions_count || 0}</td>
            <td><Link href={`/calls/${item.call_id}`}>{t("dashboard.open")}</Link></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  </main>;
}
