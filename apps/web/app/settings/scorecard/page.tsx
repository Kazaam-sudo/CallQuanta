"use client";

import { useEffect, useMemo, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";
const ALLOWED_LANGUAGES = ["english", "russian", "same_as_transcript"] as const;

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
  report_language: "english",
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
  const [scorecard, setScorecard] = useState<Scorecard>(emptyScorecard);
  const [message, setMessage] = useState<string>("");
  const [errors, setErrors] = useState<string[]>([]);

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
      validationErrors.push("Scorecard name must not be empty.");
    }
    if (!ALLOWED_LANGUAGES.includes(scorecard.report_language)) {
      validationErrors.push("Report language must be one of: english, russian, same_as_transcript.");
    }
    if (scorecard.criteria.length === 0) {
      validationErrors.push("Scorecard must contain at least one criterion.");
    }
    scorecard.criteria.forEach((criterion, idx) => {
      if (!criterion.title.trim()) {
        validationErrors.push(`Criterion #${idx + 1}: title must not be empty.`);
      }
      if (Number(criterion.max_points) <= 0) {
        validationErrors.push(`Criterion #${idx + 1}: max_points must be greater than 0.`);
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
      const savedCriteriaCount = saved.criteria.length;
      const savedTotal = saved.criteria.reduce((sum, criterion) => sum + Number(criterion.max_points || 0), 0);
      setMessage(`Scorecard saved. Saved language: ${saved.report_language}. Criteria count: ${savedCriteriaCount}. Total max score: ${savedTotal}.`);
      return;
    }

    let detail = "Failed to save scorecard.";
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
      setMessage("Scorecard reset to default.");
      return;
    }

    let detail = "Failed to reset scorecard.";
    try {
      const payload = await res.json();
      if (payload?.detail) {
        detail = typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload.detail);
      }
    } catch {}
    setErrors([detail]);
  };

  return (
    <main className="grid" style={{ gap: 16 }}>
      <section className="card">
        <h2>Scorecard Settings</h2>

        <label>Scorecard name</label>
        <input value={scorecard.name} onChange={(e) => setScorecard({ ...scorecard, name: e.target.value })} />

        <label>Report language</label>
        <select
          value={scorecard.report_language}
          onChange={(e) => setScorecard({ ...scorecard, report_language: e.target.value as Scorecard["report_language"] })}
        >
          <option value="english">English</option>
          <option value="russian">Russian</option>
          <option value="same_as_transcript">Same as transcript</option>
        </select>

        <div className="actions" style={{ marginTop: 12 }}>
          <button className="button button-secondary" onClick={() => setScorecard({ ...scorecard, criteria: [...scorecard.criteria, newCriterion()] })}>
            Add criterion
          </button>
        </div>

        <div className="grid" style={{ marginTop: 12, gap: 12 }}>
          {scorecard.criteria.map((criterion, idx) => (
            <article key={criterion.id} className="segment">
              <strong>Criterion #{idx + 1}</strong>

              <label>Title</label>
              <input
                value={criterion.title}
                onChange={(e) => {
                  const criteria = [...scorecard.criteria];
                  criteria[idx] = { ...criteria[idx], title: e.target.value };
                  setScorecard({ ...scorecard, criteria });
                }}
              />

              <label>Max points</label>
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

              <label>Description</label>
              <textarea
                value={criterion.description || ""}
                onChange={(e) => {
                  const criteria = [...scorecard.criteria];
                  criteria[idx] = { ...criteria[idx], description: e.target.value };
                  setScorecard({ ...scorecard, criteria });
                }}
              />

              <label>Positive examples</label>
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

              <label>Negative examples</label>
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
                      setErrors(["Scorecard must contain at least one criterion."]);
                      return;
                    }
                    const criteria = scorecard.criteria.filter((_, cIdx) => cIdx !== idx);
                    setScorecard({ ...scorecard, criteria });
                  }}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="actions" style={{ marginTop: 12 }}>
          <button className="button" onClick={save}>Save scorecard</button>
          <button className="button button-secondary" onClick={resetToDefault}>Reset to default</button>
        </div>

        <p className="message" style={{ marginTop: 8 }}>
          Saved language: {scorecard.report_language}. Criteria count: {diagnostics.criteriaCount}. Total max score: {diagnostics.totalMax}.
        </p>

        {errors.length > 0 && (
          <div className="message" style={{ marginTop: 8 }}>
            {errors.map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        )}
        {message && <p className="message">{message}</p>}
      </section>
    </main>
  );
}
