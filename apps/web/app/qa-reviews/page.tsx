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
  const reviewStatusLabel = (status?: string) => {
    if (status === "human_reviewed") return t("qa.humanReviewed");
    if (status === "approved") return t("qa.approved");
    if (status === "disputed") return t("qa.disputed");
    if (status === "needs_rework") return t("qa.needsRework");
    return t("status.ai_generated");
  };

  return <main className="grid page-stack">
    <section className="card">
      <div className="section-header">
        <div>
          <h2>{t("qa.reviewQueue")}</h2>
          <small>{t("qa.queueHelp")} {total} {t("dashboard.totalQaReviews")}.</small>
        </div>
        <Link className="button button-secondary" href="/dashboard">{t("nav.dashboard")}</Link>
      </div>
      <div className="demo-summary-grid" style={{ marginBottom: 14 }}>
        <article className="demo-summary-card"><strong>{t("qa.queueWhatReview")}</strong><span className="technical-detail">{t("qa.queueWhatReviewHelp")}</span></article>
        <article className="demo-summary-card"><strong>{t("qa.queueCompleteAction")}</strong><span className="technical-detail">{t("qa.queueCompleteActionHelp")}</span></article>
      </div>
      <div className="filters-grid">
        <label>{t("qa.view")}<select value={filters.view} onChange={(e) => update("view", e.target.value)}><option value="">{t("qa.view.all")}</option><option value="my_assigned">{t("qa.view.myAssigned")}</option><option value="ai_unreviewed">{t("qa.view.aiUnreviewed")}</option><option value="disputed">{t("qa.view.disputed")}</option><option value="needs_rework">{t("qa.view.needsRework")}</option><option value="calibration">{t("qa.view.calibration")}</option><option value="low_score">{t("qa.view.lowScore")}</option></select></label>
        <label>{t("qa.reviewStatus")}<select value={filters.review_status} onChange={(e) => update("review_status", e.target.value)}>
          <option value="">{t("common.all")}</option>
          <option value="ai_generated">{t("status.ai_generated")}</option>
          <option value="human_reviewed">{t("qa.humanReviewed")}</option>
          <option value="approved">{t("qa.approved")}</option>
          <option value="disputed">{t("qa.disputed")}</option>
          <option value="needs_rework">{t("qa.needsRework")}</option>
        </select></label>
        <label>{t("qa.calibrationSample")}<select value={filters.calibration_flag} onChange={(e) => update("calibration_flag", e.target.value)}><option value="">{t("common.all")}</option><option value="true">{t("common.yes")}</option><option value="false">{t("common.no")}</option></select></label>
        <label>{t("qa.highDelta")}<input type="number" step="0.01" value={filters.min_delta} onChange={(e) => update("min_delta", e.target.value)} placeholder="10" /></label>
        <label>{t("calls.agent")}<input value={filters.agent_name} onChange={(e) => update("agent_name", e.target.value)} /></label>
        <label>{t("calls.team")}<input value={filters.team} onChange={(e) => update("team", e.target.value)} /></label>
        <label>{t("calls.campaign")}<input value={filters.campaign} onChange={(e) => update("campaign", e.target.value)} /></label>
        <label>{t("qa.assignedTo")}<input value={filters.assigned_to} onChange={(e) => update("assigned_to", e.target.value)} placeholder={t("qa.assignedPlaceholder")} /></label>
        <label>{t("qa.feedbackStatus")}<select value={filters.feedback_status} onChange={(e) => update("feedback_status", e.target.value)}><option value="">{t("common.all")}</option><option value="no_feedback">{t("qa.feedback.noFeedback")}</option><option value="feedback_added">{t("qa.feedback.added")}</option><option value="has_issue">{t("qa.feedback.hasIssue")}</option></select></label>
      </div>
    </section>
    <section className="card">
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>{t("dashboard.table.date")}</th><th>{t("dashboard.table.call")}</th><th>{t("dashboard.table.agent")}</th><th>{t("dashboard.table.team")}</th><th>{t("dashboard.table.campaign")}</th><th>{t("common.status")}</th><th>{t("qa.assignedTo")}</th><th>{t("qa.feedbackStatus")}</th><th>{t("qa.ai")}</th><th>{t("qa.human")}</th><th>{t("qa.delta")}</th><th>{t("qa.coaching")}</th><th>{t("common.link")}</th></tr></thead>
          <tbody>{items.map((item) => <tr key={item.id}>
            <td>{item.created_at ? new Date(item.created_at).toLocaleString() : "-"}</td>
            <td>{item.filename || `${t("dashboard.table.call")} #${item.call_id}`}{item.calibration_flag ? <span className="badge badge-uploaded" style={{ marginLeft: 6 }}>{t("qa.calibrationSample")}</span> : null}</td>
            <td>{item.agent_name || "-"}</td>
            <td>{item.team || "-"}</td>
            <td>{item.campaign || "-"}</td>
            <td><span className="badge">{reviewStatusLabel(item.review_status)}</span></td>
            <td>{item.assigned_to_email || "-"}</td>
            <td><span className="badge">{t(`qa.feedback.${item.feedback_status === "feedback_added" ? "added" : item.feedback_status === "has_issue" ? "hasIssue" : "noFeedback"}`)}</span></td>
            <td>{item.score ?? "-"}</td>
            <td>{item.human_total_score ?? "-"}</td>
            <td>{item.ai_human_score_delta ?? "-"}</td>
            <td>{item.open_coaching_actions_count || 0}/{item.coaching_actions_count || 0}</td>
            <td><Link href={`/calls/${item.call_id}`}>{t("dashboard.open")}</Link></td>
          </tr>)}</tbody>
        </table>
        {items.length === 0 ? <p className="empty-state">{t("qa.emptyQueue")}</p> : null}
      </div>
    </section>
  </main>;
}
