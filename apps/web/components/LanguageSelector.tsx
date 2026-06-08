"use client";

import { useMemo } from "react";
import { defaultInterfaceLanguages } from "../lib/i18n";
import { useI18n } from "./I18nProvider";

export function LanguageSelector() {
  const { settings, languages, t, setInterfaceLanguage } = useI18n();
  const selected = useMemo(
    () => languages.find((item) => item.code === settings.interface_language),
    [languages, settings.interface_language],
  );
  const options = (languages.length ? languages : defaultInterfaceLanguages)
    .filter((item) => ["en", "ru", "uz"].includes(item.code));

  return (
    <div className="language-control">
      <label htmlFor="language-select">{t("language.label")}:</label>
      <select
        id="language-select"
        value={settings.interface_language}
        onChange={(event) => setInterfaceLanguage(event.target.value)}
      >
        {options.map((language) => (
          <option key={language.code} value={language.code}>
            {language.native_label === language.label ? language.label : `${language.native_label} / ${language.label}`}
          </option>
        ))}
      </select>
      {selected && !selected.ui_supported ? (
        <small className="language-note">{t("language.unsupported")}</small>
      ) : null}
    </div>
  );
}
