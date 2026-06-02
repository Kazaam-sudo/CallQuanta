"use client";

import { SttLanguageItem, normalizeSttLanguageCode } from "../lib/i18n";

type Props = {
  value: string;
  languages: SttLanguageItem[];
  t: (key: string) => string;
  onChange: (value: string) => void;
};

const fallbackLanguages: SttLanguageItem[] = [
  { code: "auto", label_en: "Auto-detect", label_ru: "Определить автоматически", whisper_code: null },
  { code: "ru", label_en: "Russian", label_ru: "Русский", whisper_code: "ru" },
  { code: "uz", label_en: "Uzbek", label_ru: "Узбекский", whisper_code: "uz" },
  { code: "en", label_en: "English", label_ru: "Английский", whisper_code: "en" },
  { code: "es", label_en: "Spanish", label_ru: "Испанский", whisper_code: "es" },
  { code: "tr", label_en: "Turkish", label_ru: "Турецкий", whisper_code: "tr" },
  { code: "kk", label_en: "Kazakh", label_ru: "Казахский", whisper_code: "kk" },
];

export function SttLanguageSelect({ value, languages, t, onChange }: Props) {
  const catalog = languages.length > 0 ? languages : fallbackLanguages;
  const normalized = normalizeSttLanguageCode(value) || "auto";
  return (
    <select value={normalized} onChange={(event) => onChange(event.target.value === "auto" ? "" : event.target.value)}>
      {catalog.map((language) => (
        <option key={language.code} value={language.code}>{t(`stt.${language.code}`)}</option>
      ))}
    </select>
  );
}
