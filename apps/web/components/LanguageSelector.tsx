"use client";

import { useMemo } from "react";
import { useI18n } from "./I18nProvider";

export function LanguageSelector() {
  const { settings, languages, t, setInterfaceLanguage } = useI18n();
  const selected = useMemo(() => languages.find((item) => item.code === settings.interface_language), [languages, settings.interface_language]);
  const options = languages.length ? languages.filter((item) => item.code !== "custom") : [{ code: "en", label: "English", native_label: "English", ui_supported: true, llm_supported: true }];

  return (
    <div className="language-control">
      <label htmlFor="language-select">{t("language.label")}:</label>
      <select id="language-select" value={settings.interface_language} onChange={(event) => setInterfaceLanguage(event.target.value)}>
        {options.map((language) => (
          <option key={language.code} value={language.code}>{language.label}</option>
        ))}
      </select>
      {selected && !selected.ui_supported ? <small className="language-note">{t("language.unsupported")}</small> : null}
    </div>
  );
}
