"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE_URL, fetchWithCredentials } from "../lib/api";
import { defaultInterfaceLanguages, defaultWorkspaceSettings, LanguageCatalogItem, makeTranslator, SttLanguageItem, WorkspaceSettings } from "../lib/i18n";
import { canPersistWorkspaceSettings } from "../lib/workspace-settings-policy.mjs";
import { useAuth } from "./AuthProvider";

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
  const { status, user } = useAuth();
  const [settings, setSettings] = useState<WorkspaceSettings>(defaultWorkspaceSettings);
  const [languages, setLanguages] = useState<LanguageCatalogItem[]>(defaultInterfaceLanguages);
  const [sttLanguages, setSttLanguages] = useState<SttLanguageItem[]>([]);
  const loadedForAuthenticatedSessionRef = useRef(false);

  useEffect(() => {
    const persistedLanguage = readPersistedInterfaceLanguage();
    if (persistedLanguage) {
      setSettings((current) => ({ ...current, interface_language: persistedLanguage }));
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") {
      loadedForAuthenticatedSessionRef.current = false;
      return;
    }
    if (loadedForAuthenticatedSessionRef.current) return;
    loadedForAuthenticatedSessionRef.current = true;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    const load = async () => {
      try {
        const [settingsRes, languagesRes, sttLanguagesRes] = await Promise.all([
          fetchWithCredentials(`${API_BASE_URL}/settings/workspace`, { signal: controller.signal }),
          fetchWithCredentials(`${API_BASE_URL}/settings/languages`, { signal: controller.signal }),
          fetchWithCredentials(`${API_BASE_URL}/settings/stt-languages`, { signal: controller.signal }),
        ]);
        if (settingsRes.ok) {
          const apiSettings = (await settingsRes.json()) as WorkspaceSettings;
          const preferredLanguage = readPersistedInterfaceLanguage() || apiSettings.interface_language;
          setSettings({ ...apiSettings, interface_language: preferredLanguage });
          if (preferredLanguage !== apiSettings.interface_language && canPersistWorkspaceSettings(user)) {
            void fetchWithCredentials(`${API_BASE_URL}/settings/workspace`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ interface_language: preferredLanguage }),
            }).catch(() => null);
          }
        }
        if (languagesRes.ok) {
          const catalog = (await languagesRes.json()) as LanguageCatalogItem[];
          const supported = catalog.filter((language) => isSupportedInterfaceLanguage(language.code));
          setLanguages(supported.length ? supported : defaultInterfaceLanguages);
        }
        if (sttLanguagesRes.ok) setSttLanguages(await sttLanguagesRes.json());
      } catch {
        // Bundled catalogs remain available; optional settings never block rendering.
      } finally {
        window.clearTimeout(timeout);
      }
    };
    void load();
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [status, user]);

  const updateWorkspaceSettings = useCallback(async (updates: Partial<WorkspaceSettings>) => {
    if (updates.interface_language) {
      persistInterfaceLanguage(updates.interface_language);
      setSettings((current) => ({ ...current, ...updates }));
    }
    if (status !== "authenticated" || !canPersistWorkspaceSettings(user)) return { ...settings, ...updates };

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
  }, [settings, status, user]);

  const setInterfaceLanguage = useCallback(async (code: string) => {
    if (!isSupportedInterfaceLanguage(code)) return;
    persistInterfaceLanguage(code);
    setSettings((current) => ({ ...current, interface_language: code }));
    if (status === "authenticated" && canPersistWorkspaceSettings(user)) {
      try {
        await updateWorkspaceSettings({ interface_language: code });
      } catch {
        // Local persistence keeps public and auth routes usable if settings are unavailable.
      }
    }
  }, [status, updateWorkspaceSettings, user]);

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
