"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "../lib/api";
import { useI18n } from "./I18nProvider";

export type DemoQuota = {
  mode: "demo";
  enabled: boolean;
  limit: number;
  used: number;
  remaining: number | null;
  exceeded: boolean;
};

export function demoQuotaLabel(t: (key: string) => string, quota: DemoQuota) {
  return t("demo.remaining")
    .replace("{remaining}", String(quota.remaining ?? 0))
    .replace("{limit}", String(quota.limit));
}

export function DemoModeNotice({
  quota,
  compact = false,
}: {
  quota?: DemoQuota | null;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const [loadedQuota, setLoadedQuota] = useState<DemoQuota | null>(quota ?? null);

  useEffect(() => {
    if (quota) {
      setLoadedQuota(quota);
      return;
    }
    let cancelled = false;
    fetch(`${API_BASE_URL}/demo/status`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) setLoadedQuota(data);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [quota]);

  const current = quota ?? loadedQuota;
  if (!current?.enabled) return null;

  return (
    <section className={`demo-mode-card${compact ? " demo-mode-card-compact" : ""}`}>
      <div>
        <span className="badge badge-demo">{t("demo.mode")}</span>
        <strong>{demoQuotaLabel(t, current)}</strong>
        <small>{t("demo.limitedWorkspace")}</small>
      </div>
      {current.exceeded ? (
        <p className="message message-warning">{t("demo.limitReached")}</p>
      ) : null}
    </section>
  );
}
