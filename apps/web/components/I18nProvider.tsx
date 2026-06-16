"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { API_BASE_URL, fetchWithCredentials } from "../lib/api";
import { defaultInterfaceLanguages, defaultWorkspaceSettings, LanguageCatalogItem, makeTranslator, SttLanguageItem, WorkspaceSettings } from "../lib/i18n";

type I18nContextValue = {
  settings: WorkspaceSettings;
  languages: LanguageCatalogItem[];
  sttLanguages: SttLanguageItem[];
  t: (key: string) => string;
  setInterfaceLanguage: (code: string) => Promise<void>;
  updateWorkspaceSettings: (updates: Partial<WorkspaceSettings>) => Promise<WorkspaceSettings>;
};

const I18nContext = createContext<I18nContextValue | null>(null);
const interfaceLanguageStorageKey = "callquanta.interface_language";
const interfaceLanguageCookieName = "cq_interface_language";
const supportedInterfaceLanguageCodes = new Set(defaultInterfaceLanguages.map((language) => language.code));

function isSupportedInterfaceLanguage(code: string | null | undefined): code is string {
  return Boolean(code && supportedInterfaceLanguageCodes.has(code));
}

function readPersistedInterfaceLanguage() {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(interfaceLanguageStorageKey);
  if (isSupportedInterfaceLanguage(stored)) return stored;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${interfaceLanguageCookieName}=`));
  const cookieValue = cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : null;
  return isSupportedInterfaceLanguage(cookieValue) ? cookieValue : null;
}

function persistInterfaceLanguage(code: string) {
  if (typeof window === "undefined" || !isSupportedInterfaceLanguage(code)) return;
  window.localStorage.setItem(interfaceLanguageStorageKey, code);
  document.cookie = `${interfaceLanguageCookieName}=${encodeURIComponent(code)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<WorkspaceSettings>(defaultWorkspaceSettings);
  const [languages, setLanguages] = useState<LanguageCatalogItem[]>(defaultInterfaceLanguages);
  const [sttLanguages, setSttLanguages] = useState<SttLanguageItem[]>([]);

  useEffect(() => {
    const persistedLanguage = readPersistedInterfaceLanguage();
    if (persistedLanguage) {
      setSettings((current) => ({ ...current, interface_language: persistedLanguage }));
    }

    const load = async () => {
      try {
        const [settingsRes, languagesRes, sttLanguagesRes] = await Promise.all([
          fetchWithCredentials(`${API_BASE_URL}/settings/workspace`),
          fetchWithCredentials(`${API_BASE_URL}/settings/languages`),
          fetchWithCredentials(`${API_BASE_URL}/settings/stt-languages`),
        ]);
        if (settingsRes.ok) {
          const apiSettings = (await settingsRes.json()) as WorkspaceSettings;
          const preferredLanguage = readPersistedInterfaceLanguage() || apiSettings.interface_language;
          setSettings({ ...apiSettings, interface_language: preferredLanguage });
          if (preferredLanguage !== apiSettings.interface_language) {
            fetchWithCredentials(`${API_BASE_URL}/settings/workspace`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ interface_language: preferredLanguage }),
            }).catch(() => null);
          }
        }
        if (languagesRes.ok) {
          const catalog = (await languagesRes.json()) as LanguageCatalogItem[];
          const supportedInterfaceLanguages = catalog.filter((language) => isSupportedInterfaceLanguage(language.code));
          setLanguages(supportedInterfaceLanguages.length ? supportedInterfaceLanguages : defaultInterfaceLanguages);
        }
        if (sttLanguagesRes.ok) setSttLanguages(await sttLanguagesRes.json());
      } catch {
        // Keep same-origin persisted language or English fallback if API is unavailable during local development.
      }
    };
    load();
  }, []);

  const updateWorkspaceSettings = useCallback(async (updates: Partial<WorkspaceSettings>) => {
    if (updates.interface_language) persistInterfaceLanguage(updates.interface_language);
    const response = await fetchWithCredentials(`${API_BASE_URL}/settings/workspace`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!response.ok) throw new Error("Failed to save workspace settings.");
    const saved = (await response.json()) as WorkspaceSettings;
    setSettings(saved);
    if (saved.interface_language) persistInterfaceLanguage(saved.interface_language);
    return saved;
  }, []);

  const setInterfaceLanguage = useCallback(async (code: string) => {
    if (!isSupportedInterfaceLanguage(code)) return;
    persistInterfaceLanguage(code);
    setSettings((current) => ({ ...current, interface_language: code }));
    try {
      await updateWorkspaceSettings({ interface_language: code });
    } catch {
      // Local same-origin persistence keeps the selector working through pilot gateways even before login.
    }
  }, [updateWorkspaceSettings]);

  const value = useMemo(() => ({
    settings,
    languages,
    sttLanguages,
    t: makeTranslator(settings.interface_language),
    setInterfaceLanguage,
    updateWorkspaceSettings,
  }), [settings, languages, sttLanguages, setInterfaceLanguage, updateWorkspaceSettings]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
