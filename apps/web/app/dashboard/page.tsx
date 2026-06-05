"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
    const [metricsRes, optionsRes] = await Promise.all([
      fetch(`${API_BASE_URL}/dashboard/metrics?${query}`),
      fetch(`${API_BASE_URL}/calls/filter-options`),
    ]);
    if (metricsRes.ok) setData(await metricsRes.json());
    if (optionsRes.ok) setFilterOptions(await optionsRes.json());
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
          ? `from ${filters.created_from}`
          : filters.created_to
            ? `to ${filters.created_to}`
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
        <section className="card empty-state">Loading dashboard…</section>
      </main>
    );

  return (
    <main className="grid page-stack">
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
          />
          <FilterSelect
            label={t("calls.team")}
            value={filters.team}
            onChange={(v) => updateFilter("team", v)}
            options={filterOptions.teams}
          />
          <FilterSelect
            label={t("calls.campaign")}
            value={filters.campaign}
            onChange={(v) => updateFilter("campaign", v)}
            options={filterOptions.campaigns}
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
          />
          <label>
            {t("call.audioLanguage")}
            <select
              value={filters.language}
              onChange={(e) => updateFilter("language", e.target.value)}
            >
              <option value="">All</option>
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
          [t("dashboard.totalQaReviews"), data.summary.total_qa_reviews, "QA"],
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
          <h2>{t("dashboard.latestQaReviews")}</h2>
        </div>
        {data.latest_reviews.length === 0 ? (
          <p className="empty-state">{t("dashboard.emptyAnalyze")}</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Call</th>
                  <th>Agent</th>
                  <th>Score</th>
                  <th>Model</th>
                  <th>Scorecard</th>
                  <th>Link</th>
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
                    <td>{r.filename || `Call #${r.call_id}`}</td>
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
                  <th>Score</th>
                  <th>Call</th>
                  <th>Agent</th>
                  <th>Team</th>
                  <th>Campaign</th>
                  <th>Summary</th>
                  <th>Link</th>
                </tr>
              </thead>
              <tbody>
                {data.lowest_score_reviews.map((r) => (
                  <tr key={r.review_id}>
                    <td>{fmt(r.score)}</td>
                    <td>{r.filename || `Call #${r.call_id}`}</td>
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
                  <th>Criterion</th>
                  <th>Avg %</th>
                  <th>Warnings</th>
                  <th>Criticals</th>
                  <th>Count</th>
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
        {renderMetricsTable(data.agent_metrics, "agent_name", true)}
      </section>
      <section className="card">
        <div className="section-header">
          <h2>{t("dashboard.teamPerformance")}</h2>
        </div>
        {renderMetricsTable(data.team_metrics, "team")}
      </section>
      <section className="card">
        <div className="section-header">
          <h2>{t("dashboard.campaignPerformance")}</h2>
        </div>
        {renderMetricsTable(data.campaign_metrics, "campaign")}
      </section>
    </main>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
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
  includeLatest = false,
) {
  if (rows.length === 0) return <p className="empty-state">No metrics yet.</p>;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>{keyName.replace("_", " ")}</th>
            <th>Calls</th>
            <th>Analyzed</th>
            <th>Average score</th>
            <th>Lowest score</th>
            <th>Highest score</th>
            {includeLatest ? <th>Latest review</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r[keyName])}>
              <td>{r[keyName] || "Unassigned"}</td>
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
