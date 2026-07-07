"use client";

import { SettingsNav } from "../../../components/SettingsNav";
import { AdminOnly } from "../../../components/AdminOnly";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../../components/I18nProvider";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";
const ALLOWED_LANGUAGES = ["workspace", "english", "russian", "same_as_transcript"] as const;

type Criterion = {
  id: string;
  title: string;
  max_points: number;
  description: string;
  positive_examples?: string[];
  negative_examples?: string[];
};

type Scorecard = {
  name: string;
  report_language: (typeof ALLOWED_LANGUAGES)[number];
  criteria: Criterion[];
};

const emptyScorecard: Scorecard = {
  name: "Default Sales QA",
  report_language: "workspace",
  criteria: [],
};

const newCriterion = (): Criterion => ({
  id: `criterion_${crypto.randomUUID()}`,
  title: "New criterion",
  max_points: 10,
  description: "",
  positive_examples: [],
  negative_examples: [],
});

export default function ScorecardPage() {
  const { t } = useI18n();
  const [scorecard, setScorecard] = useState<Scorecard>(emptyScorecard);
  const [message, setMessage] = useState<string>("");
  const [errors, setErrors] = useState<string[]>([]);
  const [successFlash, setSuccessFlash] = useState("");
  const topCriterionRef = useRef<HTMLDivElement | null>(null);

  const diagnostics = useMemo(() => {
    const criteriaCount = scorecard.criteria.length;
    const totalMax = scorecard.criteria.reduce((sum, criterion) => sum + Number(criterion.max_points || 0), 0);
    return { criteriaCount, totalMax };
  }, [scorecard]);

  const load = async () => {
    setMessage("");
    setErrors([]);
    const res = await fetch(`${API_BASE_URL}/settings/scorecard`);
    const payload = await res.json();
    setScorecard(payload);
  };

  useEffect(() => {
    load();
  }, []);

  const validate = (): string[] => {
    const validationErrors: string[] = [];
    if (!scorecard.name.trim()) {
      validationErrors.push(t("settings.scorecardNameRequired"));
    }
    if (!scorecard.report_language.trim()) {
      validationErrors.push(t("settings.reportLanguageRequired"));
    }
    if (scorecard.criteria.length === 0) {
      validationErrors.push(t("settings.scorecardNeedsCriterion"));
    }
    scorecard.criteria.forEach((criterion, idx) => {
      if (!criterion.title.trim()) {
        validationErrors.push(t("settings.criterionTitleRequired").replace("{number}", String(idx + 1)));
      }
      if (Number(criterion.max_points) <= 0) {
        validationErrors.push(t("settings.criterionMaxRequired").replace("{number}", String(idx + 1)));
      }
    });
    return validationErrors;
  };

  const save = async () => {
    setMessage("");
    const validationErrors = validate();
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors([]);

    const res = await fetch(`${API_BASE_URL}/settings/scorecard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scorecard),
    });

    if (res.ok) {
      const saved = (await res.json()) as Scorecard;
      setScorecard(saved);
      setSuccessFlash(t("settings.scorecardSaved")); setTimeout(() => setSuccessFlash(""), 2500);
      return;
    }

    let detail = t("settings.scorecardSaveFailed");
    try {
      const payload = await res.json();
      if (payload?.detail) {
        detail = typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload.detail);
      }
    } catch {}
    setErrors([detail]);
  };

  const resetToDefault = async () => {
    setMessage("");
    setErrors([]);
    const res = await fetch(`${API_BASE_URL}/settings/scorecard/reset`, { method: "POST" });
    if (res.ok) {
      const payload = await res.json();
      setScorecard(payload);
      setSuccessFlash(t("settings.scorecardReset")); setTimeout(() => setSuccessFlash(""), 2500);
      return;
    }

    let detail = t("settings.scorecardResetFailed");
    try {
      const payload = await res.json();
      if (payload?.detail) {
        detail = typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload.detail);
      }
    } catch {}
    setErrors([detail]);
  };

  return (
    <AdminOnly><main className="grid" style={{ gap: 16 }}>
      <SettingsNav />
      <section className="card">
        <h2>{t("settings.scorecard")}</h2>
        <p style={{ color: "var(--text-muted)" }}>{t("settings.scorecardHelp")}</p>

        <label>{t("settings.scorecardName")}</label>
        <input value={scorecard.name} onChange={(e) => setScorecard({ ...scorecard, name: e.target.value })} />

        <label>{t("settings.reportLanguage")}</label>
        <select
          value={scorecard.report_language}
          onChange={(e) => setScorecard({ ...scorecard, report_language: e.target.value as Scorecard["report_language"] })}
        >
          <option value="workspace">{t("settings.useWorkspaceDefault")}</option>
          <option value="english">{t("settings.english")}</option>
          <option value="russian">{t("settings.russian")}</option>
          <option value="same_as_transcript">{t("settings.sameAsTranscriptShort")}</option>
          <option value="Uzbek">{t("settings.customUzbek")}</option>
        </select>

        <div className="actions" style={{ marginTop: 12 }}>
          <button className="button button-secondary" onClick={() => { const created = { ...newCriterion(), title: t("settings.criterion") }; setScorecard({ ...scorecard, criteria: [created, ...scorecard.criteria] }); setTimeout(() => topCriterionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); }}>
            {t("settings.addCriterion")}
          </button>
        </div>

        <div className="grid" style={{ marginTop: 12, gap: 12 }}>
          {scorecard.criteria.map((criterion, idx) => (
            <article key={criterion.id} className="segment" ref={idx===0 ? topCriterionRef : undefined}>
              <strong>{t("settings.criterion")} #{idx + 1}</strong>

              <label>{t("common.title")}</label>
              <input
                value={criterion.title}
                onChange={(e) => {
                  const criteria = [...scorecard.criteria];
                  criteria[idx] = { ...criteria[idx], title: e.target.value };
                  setScorecard({ ...scorecard, criteria });
                }}
              />

              <label>{t("settings.maxPoints")}</label>
              <input
                type="number"
                min={1}
                value={criterion.max_points}
                onChange={(e) => {
                  const criteria = [...scorecard.criteria];
                  criteria[idx] = { ...criteria[idx], max_points: Number(e.target.value) };
                  setScorecard({ ...scorecard, criteria });
                }}
              />

              <label>{t("common.description")}</label>
              <textarea
                value={criterion.description || ""}
                onChange={(e) => {
                  const criteria = [...scorecard.criteria];
                  criteria[idx] = { ...criteria[idx], description: e.target.value };
                  setScorecard({ ...scorecard, criteria });
                }}
              />

              <label>{t("settings.positiveExamples")}</label>
              <textarea
                value={(criterion.positive_examples || []).join("\n")}
                onChange={(e) => {
                  const criteria = [...scorecard.criteria];
                  criteria[idx] = {
                    ...criteria[idx],
                    positive_examples: e.target.value
                      .split("\n")
                      .map((x) => x.trim())
                      .filter(Boolean),
                  };
                  setScorecard({ ...scorecard, criteria });
                }}
              />

              <label>{t("settings.negativeExamples")}</label>
              <textarea
                value={(criterion.negative_examples || []).join("\n")}
                onChange={(e) => {
                  const criteria = [...scorecard.criteria];
                  criteria[idx] = {
                    ...criteria[idx],
                    negative_examples: e.target.value
                      .split("\n")
                      .map((x) => x.trim())
                      .filter(Boolean),
                  };
                  setScorecard({ ...scorecard, criteria });
                }}
              />

              <div className="actions" style={{ marginTop: 8 }}>
                <button
                  className="button button-secondary"
                  onClick={() => {
                    if (scorecard.criteria.length <= 1) {
                      setErrors([t("settings.scorecardNeedsCriterion")]);
                      return;
                    }
                    const criteria = scorecard.criteria.filter((_, cIdx) => cIdx !== idx);
                    setScorecard({ ...scorecard, criteria });
                  }}
                >
                  {t("settings.removeCriterion")}
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="actions" style={{ marginTop: 12 }}>
          <button className="button" onClick={save}>{t("settings.saveScorecard")}</button>
          <button className="button button-secondary" onClick={resetToDefault}>{t("settings.resetScorecard")}</button>
        </div>

        <p className="message" style={{ marginTop: 8 }}>
          {t("settings.scorecardDiagnostics")
            .replace("{language}", scorecard.report_language)
            .replace("{count}", String(diagnostics.criteriaCount))
            .replace("{total}", String(diagnostics.totalMax))}
        </p>

        {errors.length > 0 && (
          <div className="message" style={{ marginTop: 8 }}>
            {errors.map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        )}
        {successFlash && <p className="message">{successFlash}</p>}
      </section>
    </main></AdminOnly>
  );
}
