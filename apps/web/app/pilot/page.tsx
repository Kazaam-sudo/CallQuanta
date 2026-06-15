import Link from "next/link";

const steps = [
  "Upload 5–10 real calls",
  "Check transcription quality",
  "Run QA analysis",
  "Review AI score and evidence",
  "Add human review",
  "Add feedback",
  "Add coaching action if needed",
  "Check dashboard",
  "Export results",
  "Share feedback summary",
];

export default function PilotPage() {
  return <main className="grid page-stack"><section className="card"><div className="section-header"><div><h2>Pilot testing checklist</h2><small>Use this workflow with managers before a wider rollout.</small></div><Link className="button button-secondary" href="/dashboard">Dashboard</Link></div><ol>{steps.map((step) => <li key={step}>{step}</li>)}</ol></section><section className="card"><h3>Practical review help</h3><ul><li><strong>What should I check?</strong> Transcript accuracy, AI evidence, score fit, missed issues, false positives, and coaching usefulness.</li><li><strong>Transcript quality:</strong> mark poor/unusable when words, language, or speakers are wrong enough to affect scoring.</li><li><strong>AI QA quality:</strong> mark poor when evidence does not support the score or key criteria are missed.</li><li><strong>Disputed:</strong> use when human score or interpretation materially differs from AI.</li><li><strong>Coaching action:</strong> add one only when the review identifies a specific behavior to improve.</li></ul></section></main>;
}
