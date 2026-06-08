"use client";

import { ReactNode, useEffect, useState } from "react";
import { API_BASE_URL, fetchWithCredentials } from "../lib/api";
import { useI18n } from "./I18nProvider";

type AuthUser = { email: string; role: string };

export function AdminOnly({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchWithCredentials(`${API_BASE_URL}/auth/me`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => setUser(data?.user || null))
      .catch(() => setUser(null))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  if (user?.role !== "admin") {
    return (
      <main className="grid" style={{ gap: 18 }}>
        <section className="card">
          <h2>{t("settings.adminOnly")}</h2>
          <p style={{ color: "var(--text-muted)" }}>{t("settings.adminOnlyHelp")}</p>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
