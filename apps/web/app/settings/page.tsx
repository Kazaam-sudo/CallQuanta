import Link from "next/link";

const cards = [
  { href: "/settings/workspace", title: "Users / Access", text: "Authentication is enabled by default. The first admin account is bootstrapped from ADMIN_EMAIL and ADMIN_PASSWORD." },
  { href: "/settings/llm", title: "LLM Providers", text: "Configure LLM endpoints. Saved API keys are never shown after save." },
  { href: "/settings/stt", title: "STT Providers", text: "Configure transcription providers. Saved API keys display only as configured." },
  { href: "/settings/scorecard", title: "Scorecard", text: "Edit QA criteria and reset to the default scorecard." },
  { href: "/settings/integrations", title: "Telephony Integrations", text: "Manage webhook integrations and regenerate ingestion tokens." },
  { href: "/settings/system", title: "System Status", text: "Inspect API, database, Redis, queue, worker and storage health." },
  { href: "/settings/retention", title: "Retention", text: "Preview and run manual cleanup for old audio, transcripts, QA reviews and ingestion events." },
  { href: "/docs/deploy-production.md", title: "Deployment notes", text: "Read the production deployment checklist and backup guidance." },
];

export default function SettingsPage() {
  return (
    <main className="grid" style={{ gap: 18 }}>
      <section className="card">
        <h2>Settings</h2>
        <p style={{ color: "var(--text-muted)" }}>Production readiness controls for access, providers, system status, retention and deployment.</p>
      </section>
      <section className="grid grid-2">
        {cards.map((card) => (
          <Link key={card.href} className="card" href={card.href} style={{ textDecoration: "none", color: "inherit" }}>
            <h3>{card.title}</h3>
            <p style={{ color: "var(--text-muted)" }}>{card.text}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
