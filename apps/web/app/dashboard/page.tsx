"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DemoModeNotice } from "../../components/DemoModeNotice";
import { useI18n } from "../../components/I18nProvider";
import { sttLanguageLabel } from "../../lib/i18n";

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
  qa_calibration?: { ai_reviews_count:number; human_reviewed_count:number; approved_count:number; disputed_count:number; reviews_needing_rework:number; average_ai_score:number|null; average_human_score:number|null; average_ai_human_delta:number|null; calibration_samples_count:number; top_criteria_disagreement:any[] };
  agent_metrics: MetricRow[];
  team_metrics: MetricRow[];
  campaign_metrics: MetricRow[];
};
type FilterOptions = {
  agents: string[];
  teams: string[];
  campaigns: string[];
  directions: string[];
  languages: string[];
  statuses: string[];
};
type DashboardFilters = {
  created_from: string;
  created_to: string;
  agent_name: string;
  team: string;
  campaign: string;
  direction: string;
  language: string;
};

const emptyFilters: DashboardFilters = {
  created_from: "",
  created_to: "",
  agent_name: "",
  team: "",
  campaign: "",
  direction: "",
  language: "",
};
const fmt = (value: number | null | undefined) =>
  value == null ? "-" : Number(value).toFixed(2);
const scorePercent = (value: number | null | undefined) =>
  Math.max(0, Math.min(100, Number(value ?? 0)));

export default function Page() {
  const [data, setData] = useState<DashboardMetrics | null>(null);
  const [pilot, setPilot] = useState<any | null>(null);
  const [filters, setFilters] = useState<DashboardFilters>(emptyFilters);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    agents: [],
    teams: [],
    campaigns: [],
    directions: [],
    languages: [],
    statuses: [],
  });
  const { t, sttLanguages } = useI18n();

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value.trim()) params.set(key, value.trim());
    });
    return params.toString();
  }, [filters]);
  const load = useCallback(async () => {
    const [metricsRes, optionsRes, pilotRes] = await Promise.all([
      fetch(`${API_BASE_URL}/dashboard/metrics?${query}`),
      fetch(`${API_BASE_URL}/calls/filter-options`),
      fetch(`${API_BASE_URL}/dashboard/pilot-feedback`),
    ]);
    if (metricsRes.ok) setData(await metricsRes.json());
    if (optionsRes.ok) setFilterOptions(await optionsRes.json());
    if (pilotRes.ok) setPilot(await pilotRes.json());
  }, [query]);
  useEffect(() => {
    load();
  }, [load]);

  const emptyMessage = useMemo(() => {
    if (!data) return null;
    if (data.summary.total_calls === 0) return t("dashboard.emptyUpload");
    if (data.summary.total_qa_reviews === 0) return t("dashboard.emptyAnalyze");
    return null;
  }, [data, t]);
  const activeFilterSummary = useMemo(() => {
    const parts = [
      filters.agent_name,
      filters.team,
      filters.campaign,
      filters.direction,
      sttLanguageLabel(filters.language, sttLanguages, t),
      filters.created_from && filters.created_to
        ? `${filters.created_from}–${filters.created_to}`
        : filters.created_from
          ? `${t("calls.dateFrom")} ${filters.created_from}`
          : filters.created_to
            ? `${t("calls.dateTo")} ${filters.created_to}`
            : "",
    ].filter(Boolean);
    return parts.length > 0
      ? `${t("dashboard.filteredBy")}: ${parts.join(" · ")}`
      : t("dashboard.noFilters");
  }, [filters, sttLanguages, t]);
  const updateFilter = (key: keyof DashboardFilters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));

  if (!data)
    return (
      <main className="grid">
        <section className="card empty-state">{t("dashboard.loading")}</section>
      </main>
    );

  return (
    <main className="grid page-stack">
      <section className="card hero dashboard-hero">
        <div className="section-header">
          <div>
            <h1>{t("dashboard.productTitle")}</h1>
            <p>{t("dashboard.productHelp")}</p>
          </div>
          <Link href="/calls" className="button">{t("dashboard.primaryAction")}</Link>
        </div>
        <div className="hero-signal-row" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>
      <DemoModeNotice />
      <section className="card workflow-panel">
        <div className="section-header">
          <div>
            <h2>{t("dashboard.workflow")}</h2>
            <small>{t("dashboard.workflowHelp")}</small>
          </div>
        </div>
        <div className="demo-summary-grid workflow-grid">
          {[
            ["dashboard.workflow.upload.title", "dashboard.workflow.upload.text"],
            ["dashboard.workflow.transcript.title", "dashboard.workflow.transcript.text"],
            ["dashboard.workflow.qa.title", "dashboard.workflow.qa.text"],
            ["dashboard.workflow.growth.title", "dashboard.workflow.growth.text"],
          ].map(([title, text], index) => <article key={title} className="demo-summary-card workflow-card"><small>{index + 1}</small><strong>{t(title)}</strong><span className="technical-detail">{t(text)}</span></article>)}
        </div>
      </section>
      <section className="card benefits-panel">
        <div className="section-header compact-section-header">
          <h2>{t("dashboard.outputs")}</h2>
        </div>
        <div className="benefit-grid">
          {[
            ["dashboard.output.score", "dashboard.output.scoreText"],
            ["dashboard.output.topic", "dashboard.output.topicText"],
            ["dashboard.output.actions", "dashboard.output.actionsText"],
            ["dashboard.output.evidence", "dashboard.output.evidenceText"],
            ["dashboard.output.feedback", "dashboard.output.feedbackText"],
          ].map(([title, text], index) => <article key={title} className={`benefit-card benefit-card-${index + 1}`}><span className="benefit-icon" aria-hidden="true" /><div><strong>{t(title)}</strong><p>{t(text)}</p></div></article>)}
        </div>
      </section>
      <section className="card filters-card">
        <div className="section-header filters-header">
          <div>
            <h2>{t("calls.filters")}</h2>
            <small>{activeFilterSummary}</small>
          </div>
          <button
            className="button button-secondary button-small"
            type="button"
            onClick={() => setFilters(emptyFilters)}
          >
            {t("calls.resetFilters")}
          </button>
        </div>
        <div className="filters-grid">
          <label>
            {t("calls.dateFrom")}
            <input
              type="date"
              value={filters.created_from}
              onChange={(e) => updateFilter("created_from", e.target.value)}
            />
          </label>
          <label>
            {t("calls.dateTo")}
            <input
              type="date"
              value={filters.created_to}
              onChange={(e) => updateFilter("created_to", e.target.value)}
            />
          </label>
          <FilterSelect
            label={t("calls.agent")}
            value={filters.agent_name}
            onChange={(v) => updateFilter("agent_name", v)}
            options={filterOptions.agents}
            allLabel={t("common.all")}
          />
          <FilterSelect
            label={t("calls.team")}
            value={filters.team}
            onChange={(v) => updateFilter("team", v)}
            options={filterOptions.teams}
            allLabel={t("common.all")}
          />
          <FilterSelect
            label={t("calls.campaign")}
            value={filters.campaign}
            onChange={(v) => updateFilter("campaign", v)}
            options={filterOptions.campaigns}
            allLabel={t("common.all")}
          />
          <FilterSelect
            label={t("calls.direction")}
            value={filters.direction}
            onChange={(v) => updateFilter("direction", v)}
            options={[
              "inbound",
              "outbound",
              "internal",
              "unknown",
              ...filterOptions.directions.filter(
                (d) =>
                  !["inbound", "outbound", "internal", "unknown"].includes(d),
              ),
            ]}
            allLabel={t("common.all")}
          />
          <label>
            {t("call.audioLanguage")}
            <select
              value={filters.language}
              onChange={(e) => updateFilter("language", e.target.value)}
            >
              <option value="">{t("common.all")}</option>
              {Array.from(
                new Set([
                  "auto",
                  ...sttLanguages.map((language) => language.code),
                ]),
              ).map((code) => (
                <option key={code} value={code}>
                  {code === "auto"
                    ? t("stt.auto")
                    : sttLanguageLabel(code, sttLanguages, t)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <section className="card">
        <div className="section-header">
          <div><h2>{t("dashboard.pilotFeedback")}</h2><small>{t("dashboard.pilotFeedbackHelp")}</small></div>
          <div className="actions"><a className="button button-secondary" href={`${API_BASE_URL}/qa-feedback/export?format=csv`}>{t("dashboard.exportCsv")}</a><a className="button button-secondary" href={`${API_BASE_URL}/qa-feedback/export?format=xlsx`}>{t("dashboard.exportXlsx")}</a><Link className="button button-secondary" href="/pilot">{t("dashboard.pilotChecklist")}</Link></div>
        </div>
        {pilot ? <div className="kpi-grid">
          {[
            [t("dashboard.reviewsWithFeedback"), pilot.reviews_with_feedback],
            [t("dashboard.usefulForCoaching"), `${pilot.useful_for_coaching_percent ?? "-"}%`],
            [t("dashboard.sttProblems"), pilot.reviews_with_stt_problems],
            [t("dashboard.qaLogicProblems"), pilot.reviews_with_qa_logic_problems],
            [t("dashboard.scorecardMismatch"), pilot.reviews_with_scorecard_mismatch],
            [t("dashboard.topicProblems"), pilot.reviews_with_topic_classification_problems],
            [t("dashboard.requiredActionsProblems"), pilot.reviews_with_required_actions_problems],
            [t("dashboard.uiUxProblems"), pilot.reviews_with_ui_ux_problems],
            [t("dashboard.qaSkippedInvalidTranscript"), pilot.reviews_not_evaluated_invalid_transcript],
            [t("dashboard.avgAiHumanDelta"), pilot.average_ai_human_delta_with_feedback ?? "-"],
          ].map(([label, value]) => <article className="kpi-card" key={String(label)}><small>{label}</small><strong>{value}</strong></article>)}
        </div> : <p>{t("common.loading")}</p>}
        <p><strong>{t("dashboard.topIssueTags")}:</strong> {pilot?.top_issue_tags?.map((x:any) => `${x.tag} (${x.count})`).join(", ") || "-"}</p>
      </section>
      {emptyMessage ? (
        <section className="card empty-state">{emptyMessage}</section>
      ) : null}
      <section className="kpi-grid">
        {[
          [
            t("dashboard.totalCalls"),
            data.summary.total_calls,
            t("dashboard.helper.totalCalls"),
          ],
          [
            t("dashboard.analyzedCalls"),
            data.summary.analyzed_calls,
            t("dashboard.helper.analyzedCalls"),
          ],
          [
            t("dashboard.averageScore"),
            fmt(data.summary.average_score),
            t("dashboard.helper.averageScore"),
          ],
          [
            t("dashboard.failedAnalyses"),
            data.summary.analysis_failed_calls,
            t("calls.failed"),
          ],
          [t("dashboard.totalQaReviews"), data.summary.total_qa_reviews, t("call.tab.qa")],
        ].map(([label, value, helper]) => (
          <article key={String(label)} className="kpi-card">
            <small>{helper}</small>
            <strong>{value}</strong>
            <div>{label}</div>
          </article>
        ))}
      </section>
      <section className="card">
        <div className="section-header">
          <h2>{t("qa.calibration")}</h2>
          <Link href="/qa-reviews">{t("qa.reviewQueue")}</Link>
        </div>
        <section className="kpi-grid">
          {[
            [t("qa.aiReviews"), data.qa_calibration?.ai_reviews_count ?? 0],
            [t("qa.humanReviewed"), data.qa_calibration?.human_reviewed_count ?? 0],
            [t("qa.approved"), data.qa_calibration?.approved_count ?? 0],
            [t("qa.disputed"), data.qa_calibration?.disputed_count ?? 0],
            [t("qa.needsRework"), data.qa_calibration?.reviews_needing_rework ?? 0],
            [t("qa.averageHumanScore"), fmt(data.qa_calibration?.average_human_score)],
            [t("qa.averageDelta"), fmt(data.qa_calibration?.average_ai_human_delta)],
            [t("qa.calibrationSamples"), data.qa_calibration?.calibration_samples_count ?? 0],
          ].map(([label, value]) => <article key={String(label)} className="kpi-card"><strong>{value}</strong><div>{label}</div></article>)}
        </section>
        {(data.qa_calibration?.top_criteria_disagreement || []).length ? <div className="table-wrap" style={{ marginTop: 12 }}><table className="data-table"><thead><tr><th>{t("qa.topCriteriaDisagreement")}</th><th>{t("common.count")}</th></tr></thead><tbody>{data.qa_calibration?.top_criteria_disagreement.map((row:any) => <tr key={row.criterion_title}><td>{row.criterion_title}</td><td>{row.disagreements}</td></tr>)}</tbody></table></div> : <p className="empty-state">{t("qa.noDisagreements")}</p>}
      </section>
      <section className="card">
        <div className="section-header">
          <h2>{t("dashboard.latestQaReviews")}</h2>
        </div>
        {data.latest_reviews.length === 0 ? (
          <p className="empty-state">{t("dashboard.emptyAnalyze")}</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("dashboard.table.date")}</th>
                  <th>{t("dashboard.table.call")}</th>
                  <th>{t("dashboard.table.agent")}</th>
                  <th>{t("dashboard.table.score")}</th>
                  <th>{t("dashboard.table.model")}</th>
                  <th>{t("dashboard.table.scorecard")}</th>
                  <th>{t("common.link")}</th>
                </tr>
              </thead>
              <tbody>
                {data.latest_reviews.map((r) => (
                  <tr key={r.review_id}>
                    <td>
                      {r.created_at
                        ? new Date(r.created_at).toLocaleString()
                        : "-"}
                    </td>
                    <td>{r.filename || `${t("dashboard.table.call")} #${r.call_id}`}</td>
                    <td>{r.agent_name || "-"}</td>
                    <td>
                      <strong>{fmt(r.score)}</strong>
                    </td>
                    <td>{r.model || "-"}</td>
                    <td>{r.scorecard_name || "-"}</td>
                    <td>
                      <Link href={`/calls/${r.call_id}`}>
                        {t("dashboard.open")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="card">
        <div className="section-header">
          <h2>{t("dashboard.lowestScoreReviews")}</h2>
        </div>
        {data.lowest_score_reviews.length === 0 ? (
          <p className="empty-state">{t("dashboard.emptyAnalyze")}</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("dashboard.table.score")}</th>
                  <th>{t("dashboard.table.call")}</th>
                  <th>{t("dashboard.table.agent")}</th>
                  <th>{t("dashboard.table.team")}</th>
                  <th>{t("dashboard.table.campaign")}</th>
                  <th>{t("dashboard.table.summary")}</th>
                  <th>{t("common.link")}</th>
                </tr>
              </thead>
              <tbody>
                {data.lowest_score_reviews.map((r) => (
                  <tr key={r.review_id}>
                    <td>{fmt(r.score)}</td>
                    <td>{r.filename || `${t("dashboard.table.call")} #${r.call_id}`}</td>
                    <td>{r.agent_name || "-"}</td>
                    <td>{r.team || "-"}</td>
                    <td>{r.campaign || "-"}</td>
                    <td className="summary-cell">{r.summary || "-"}</td>
                    <td>
                      <Link href={`/calls/${r.call_id}`}>
                        {t("dashboard.open")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="card">
        <div className="section-header">
          <h2>{t("dashboard.criteriaAttention")}</h2>
        </div>
        {data.criteria_problem_summary.length === 0 ? (
          <p className="empty-state">{t("dashboard.emptyAnalyze")}</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("dashboard.table.criterion")}</th>
                  <th>{t("dashboard.averagePercent")}</th>
                  <th>{t("dashboard.warnings")}</th>
                  <th>{t("dashboard.criticalFindings")}</th>
                  <th>{t("common.count")}</th>
                </tr>
              </thead>
              <tbody>
                {data.criteria_problem_summary.map((r: any) => (
                  <tr key={r.criterion_title}>
                    <td>{r.criterion_title}</td>
                    <td>
                      <ScoreBar value={r.average_percent} />
                    </td>
                    <td>{r.warning_count}</td>
                    <td>{r.critical_count}</td>
                    <td>{r.reviews_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="card">
        <div className="section-header">
          <h2>{t("dashboard.agentPerformance")}</h2>
        </div>
        {renderMetricsTable(data.agent_metrics, "agent_name", t, true)}
      </section>
      <section className="card">
        <div className="section-header">
          <h2>{t("dashboard.teamPerformance")}</h2>
        </div>
        {renderMetricsTable(data.team_metrics, "team", t)}
      </section>
      <section className="card">
        <div className="section-header">
          <h2>{t("dashboard.campaignPerformance")}</h2>
        </div>
        {renderMetricsTable(data.campaign_metrics, "campaign", t)}
      </section>
    </main>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  allLabel: string;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {Array.from(new Set(options))
          .filter(Boolean)
          .map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
      </select>
    </label>
  );
}
function ScoreBar({ value }: { value: number | null | undefined }) {
  return (
    <div className="score-bar">
      <div className="score-bar-track">
        <div
          className="score-bar-fill"
          style={{ width: `${scorePercent(value)}%` }}
        />
      </div>
      <small>{fmt(value)}%</small>
    </div>
  );
}
function renderMetricsTable(
  rows: MetricRow[],
  keyName: "agent_name" | "team" | "campaign",
  t: (key: string) => string,
  includeLatest = false,
) {
  if (rows.length === 0) return <p className="empty-state">{t("dashboard.emptyAnalyze")}</p>;
  const keyLabel = keyName === "agent_name" ? t("calls.agent") : keyName === "team" ? t("calls.team") : t("calls.campaign");
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>{keyLabel}</th>
            <th>{t("dashboard.totalCalls")}</th>
            <th>{t("dashboard.analyzedCalls")}</th>
            <th>{t("dashboard.averageScore")}</th>
            <th>{t("dashboard.lowestScoreReviews")}</th>
            <th>{t("dashboard.table.score")}</th>
            {includeLatest ? <th>{t("dashboard.latestQaReviews")}</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r[keyName])}>
              <td>{r[keyName] || "-"}</td>
              <td>{r.calls_count}</td>
              <td>{r.analyzed_calls_count}</td>
              <td>
                <ScoreBar value={r.average_score} />
              </td>
              <td>{fmt(r.lowest_score)}</td>
              <td>{fmt(r.highest_score)}</td>
              {includeLatest ? (
                <td>
                  {r.latest_review_at
                    ? new Date(r.latest_review_at).toLocaleString()
                    : "-"}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
