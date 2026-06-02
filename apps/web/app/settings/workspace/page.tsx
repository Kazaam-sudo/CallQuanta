"use client";

import { FormEvent, useEffect, useState } from "react";
import { useI18n } from "../../../components/I18nProvider";
import Link from "next/link";
import { reportLanguageForCode, WorkspaceSettings } from "../../../lib/i18n";

export default function WorkspaceLanguagePage() {
  const { settings, languages, t, updateWorkspaceSettings } = useI18n();
  const [form, setForm] = useState<WorkspaceSettings>(settings);
  const [message, setMessage] = useState("");

  useEffect(() => setForm(settings), [settings]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    const payload = { ...form };
    if (payload.qa_report_language_mode === "workspace") {
      payload.qa_report_language = reportLanguageForCode(payload.interface_language);
    }
    const saved = await updateWorkspaceSettings(payload);
    setForm(saved);
    setMessage(t("settings.saved"));
  };

  return (
    <main className="grid" style={{ gap: 16 }}>
      <section className="card">
        <div className="actions"><Link href="/settings/llm">LLM Providers</Link><Link href="/settings/scorecard">Scorecard</Link><Link href="/settings/workspace">Workspace Language</Link><Link href="/settings/stt">STT</Link></div>
        <h2>{t("settings.workspaceLanguage")}</h2>
        <p className="message">{t("settings.explanation")}</p>
        <form className="grid" style={{ gap: 12 }} onSubmit={save}>
          <label>{t("settings.interfaceLanguage")}</label>
          <select value={form.interface_language} onChange={(e) => setForm({ ...form, interface_language: e.target.value, qa_report_language: form.qa_report_language_mode === "workspace" ? reportLanguageForCode(e.target.value) : form.qa_report_language })}>
            {languages.filter((language) => language.code !== "custom").map((language) => <option key={language.code} value={language.code}>{language.label} · {language.native_label}</option>)}
          </select>

          <label>{t("settings.qaMode")}</label>
          <select value={form.qa_report_language_mode} onChange={(e) => setForm({ ...form, qa_report_language_mode: e.target.value as WorkspaceSettings["qa_report_language_mode"] })}>
            <option value="workspace">{t("settings.useWorkspace")}</option>
            <option value="same_as_transcript">{t("settings.sameAsTranscript")}</option>
            <option value="custom">{t("settings.customLanguage")}</option>
          </select>

          {form.qa_report_language_mode === "custom" ? (
            <>
              <label>{t("settings.customQaLanguage")}</label>
              <input value={form.qa_report_language} onChange={(e) => setForm({ ...form, qa_report_language: e.target.value })} placeholder="Kazakh" />
            </>
          ) : null}

          <div><button className="button" type="submit">{t("settings.save")}</button></div>
        </form>
        {message && <p className="message message-success">{message}</p>}
      </section>
    </main>
  );
}
