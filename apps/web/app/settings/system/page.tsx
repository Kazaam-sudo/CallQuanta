"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL, fetchWithCredentials } from "../../../lib/api";
import { SettingsNav } from "../../../components/SettingsNav";
import { AdminOnly } from "../../../components/AdminOnly";
import { useI18n } from "../../../components/I18nProvider";


export default function SystemStatusPage() {
  const { t } = useI18n();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const response = await fetchWithCredentials(`${API_BASE_URL}/system/status`);
    if (!response.ok) {
      setError(t("system.adminOnly"));
      return;
    }
    setData(await response.json());
  }

  useEffect(() => { load(); }, []);
  const llmReady = data?.qa?.mode !== "placeholder" && Boolean(data?.qa?.active_provider || data?.providers?.llm?.name);
  const sttReady = Boolean(data?.providers?.stt?.name || data?.stt?.mode || data?.qa?.stt_mode);
  const authEnabled = Boolean(data?.api?.require_auth);
  const workers = Object.values(data?.workers || {}) as any[];
  const workersReady = workers.length > 0 && workers.every((worker) => worker.ok);
  const queues = Object.values(data?.queues || {}) as any[];
  const queuedJobs = queues.reduce((total, queue) => total + Number(queue.length || 0), 0);
  const pilotReady = llmReady && sttReady && authEnabled && workersReady;

  return (
    <AdminOnly><main className="grid" style={{ gap: 16 }}>
      <SettingsNav />
      <section className="card">
        <div className="actions" style={{ justifyContent: "space-between" }}><div><h2>{t("system.systemReadiness")}</h2><p style={{ color: "var(--text-muted)", marginBottom: 0 }}>{t("system.systemReadinessHelp")}</p></div><button className="button button-secondary" onClick={load}>{t("call.refresh")}</button></div>
        {error && <p className="message message-error">{error}</p>}
        {!data && !error && <p>{t("system.loading")}</p>}
      </section>
      {data && <>
        <section className="card">
          <h3>{t("system.demoEnvironmentStatus")}</h3>
          <p style={{ color: "var(--text-muted)" }}>{t("system.demoEnvironmentStatusHelp")}</p>
          <div className="system-readiness-grid">
            <div className="segment"><strong>{t("system.pilotReadiness")}</strong><p><span className={`badge ${pilotReady ? "badge-transcribed" : "badge-analysis_pending"}`}>{pilotReady ? t("system.readyForPilot") : t("system.needsAttention")}</span></p><small>{pilotReady ? t("system.readyForPilotHelp") : t("system.needsAttentionHelp")}</small></div>
            <div className="segment"><strong>{t("system.llmMode")}</strong><p><span className={`badge ${llmReady ? "badge-transcribed" : "badge-analysis_pending"}`}>{llmReady ? t("system.realLlmConnected") : t("system.placeholderMode")}</span></p><small>{t("system.llmModeHelp")} {t("system.activeProvider")}: {data.qa?.active_provider ? t("common.yes") : t("common.no")} • {t("call.model")}: {data.qa?.model || "-"}</small></div>
            <div className="segment"><strong>{t("system.transcriptValidation")}</strong><p><span className="badge badge-transcribed">{t("system.enabled")}</span></p><small>{t("system.invalidTranscriptGateHelp")}</small></div>
            <div className="segment"><strong>{t("system.workerStatus")}</strong><p><span className={`badge ${workersReady ? "badge-transcribed" : "badge-analysis_failed"}`}>{workersReady ? t("system.workersReady") : t("system.workersNeedAttention")}</span></p><small>{t("system.workerStatusHelp")} {queuedJobs} {t("system.jobsWaiting")}.</small></div>
            <div className="segment"><strong>{t("system.sttProvider")}</strong><p><span className={`badge ${sttReady ? "badge-transcribed" : "badge-analysis_pending"}`}>{sttReady ? t("system.sttConfigured") : t("system.sttMissing")}</span></p><small>{t("system.sttProviderHelp")} {data.providers?.stt?.name || data.stt?.mode || t("system.checkSttSettings")}</small></div>
            <div className="segment"><strong>{t("system.authEnabled")}</strong><p><span className={`badge ${authEnabled ? "badge-transcribed" : "badge-analysis_failed"}`}>{authEnabled ? t("system.enabled") : t("system.checkRequired")}</span></p><small>{t("system.authEnabledHelp")}</small></div>
          </div>
        </section>
        <section className="card">
          <h3>{t("system.whatThisMeans")}</h3>
          <p>{pilotReady ? t("system.whatThisMeansReady") : t("system.whatThisMeansNeedsAttention")}</p>
        </section>
        <section className="grid grid-2">
          <article className="card"><h3>{t("system.apiStatus")}</h3><p>{data.api?.status} • v{data.api?.version} • {data.api?.app_env}</p><small>{t("system.apiStatusHelp")} {t("system.authEnabled")}: {authEnabled ? t("common.yes") : t("common.no")}</small></article>
          <article className="card"><h3>{t("system.databaseStatus")}</h3><p>{data.postgres?.ok ? t("system.healthy") : t("system.unavailable")}</p><small>{t("system.databaseStatusHelp")}</small>{data.postgres?.error && <p className="message message-error">{data.postgres.error}</p>}</article>
          <article className="card"><h3>{t("system.queueStatus")}</h3><p>{data.redis?.ok ? t("system.healthy") : t("system.unavailable")}</p><small>{t("system.queueStatusHelp")}</small>{data.redis?.error && <p className="message message-error">{data.redis.error}</p>}</article>
          <article className="card"><h3>{t("system.storage")}</h3><p>{data.storage?.files_count ?? 0} {t("system.files")} • {Math.round((data.storage?.total_bytes || 0) / 1024 / 1024)} MB</p><small>{t("system.protectedStorageHelp")}</small></article>
        </section>
        <section className="card"><h3>{t("system.queues")}</h3><p style={{ color: "var(--text-muted)" }}>{t("system.queuesHelp")}</p><div className="grid grid-3">{Object.entries(data.queues || {}).map(([key, queue]: any) => <div key={key} className="segment"><strong>{key}</strong><p>{queue.length} {t("system.jobs")}</p><small>{queue.name}</small></div>)}</div></section>
        <section className="card"><h3>{t("system.workers")}</h3><p style={{ color: "var(--text-muted)" }}>{t("system.workersHelp")}</p><div className="grid grid-3">{Object.entries(data.workers || {}).map(([key, worker]: any) => <div key={key} className="segment"><strong>{key}</strong><p><span className={`badge ${worker.ok ? "badge-transcribed" : "badge-analysis_failed"}`}>{worker.ok ? t("system.healthy") : t("system.warning")}</span></p><small>{t("system.lastHeartbeat")}: {worker.last_heartbeat || t("system.never")}</small>{worker.warning && <p className="message message-error">{worker.warning}</p>}</div>)}</div></section>
        <section className="grid grid-2">
          <article className="card"><h3>{t("system.llmMode")}</h3><p>{data.qa?.mode === "placeholder" ? t("system.placeholderMode") : t("system.realLlmConnected")}</p><small>{t("system.activeProvider")}: {data.qa?.active_provider ? t("common.yes") : t("common.no")} • {t("call.model")}: {data.qa?.model || "-"}</small></article><article className="card"><h3>{t("system.activeLlmProvider")}</h3><p>{data.providers?.llm?.name || t("system.noneConfigured")}</p><small>{data.providers?.llm?.model}</small></article>
          <article className="card"><h3>{t("system.activeSttProvider")}</h3><p>{data.providers?.stt?.name || t("system.noneConfigured")}</p><small>{data.providers?.stt?.model}</small></article>
        </section>
        <section className="card"><h3>{t("system.uploadLimits")}</h3><p>{t("system.perFile")}: {data.upload_limits?.max_upload_mb} MB • {t("system.bulk")}: {data.upload_limits?.max_bulk_upload_mb} MB</p><small>{t("system.uploadLimitsHelp")}</small></section>
      </>}
    </main></AdminOnly>
  );
}
