"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { defaultWorkspaceSettings, LanguageCatalogItem, makeTranslator, WorkspaceSettings } from "../lib/i18n";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

type I18nContextValue = {
  settings: WorkspaceSettings;
  languages: LanguageCatalogItem[];
  t: (key: string) => string;
  setInterfaceLanguage: (code: string) => Promise<void>;
  updateWorkspaceSettings: (updates: Partial<WorkspaceSettings>) => Promise<WorkspaceSettings>;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<WorkspaceSettings>(defaultWorkspaceSettings);
  const [languages, setLanguages] = useState<LanguageCatalogItem[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [settingsRes, languagesRes] = await Promise.all([
          fetch(`${API_BASE_URL}/settings/workspace`),
          fetch(`${API_BASE_URL}/settings/languages`),
        ]);
        if (settingsRes.ok) setSettings(await settingsRes.json());
        if (languagesRes.ok) setLanguages(await languagesRes.json());
      } catch {
        // Keep English fallback if API is unavailable during local development.
      }
    };
    load();
  }, []);

  const updateWorkspaceSettings = useCallback(async (updates: Partial<WorkspaceSettings>) => {
    const response = await fetch(`${API_BASE_URL}/settings/workspace`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!response.ok) throw new Error("Failed to save workspace settings.");
    const saved = (await response.json()) as WorkspaceSettings;
    setSettings(saved);
    return saved;
  }, []);

  const setInterfaceLanguage = useCallback(async (code: string) => {
    await updateWorkspaceSettings({ interface_language: code });
  }, [updateWorkspaceSettings]);

  const value = useMemo(() => ({
    settings,
    languages,
    t: makeTranslator(settings.interface_language),
    setInterfaceLanguage,
    updateWorkspaceSettings,
  }), [settings, languages, setInterfaceLanguage, updateWorkspaceSettings]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
