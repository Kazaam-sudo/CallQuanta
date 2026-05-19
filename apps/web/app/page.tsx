import Link from "next/link";

const cards = [
  "Upload calls",
  "Transcribe audio",
  "Review transcripts",
  "QA scoring coming soon",
];

export default function Home() {
  return (
    <div className="grid" style={{ gap: 20 }}>
      <section className="card hero">
        <h1>Conversation QA starts here</h1>
        <p>
          Upload real call recordings, run transcription, and inspect segments in one clean workflow.
        </p>
        <p style={{ marginTop: 18 }}>
          <Link href="/calls" className="button">
            Go to Calls
          </Link>
        </p>
      </section>

      <section className="grid grid-2">
        {cards.map((item) => (
          <article key={item} className="card">
            <h3 style={{ marginTop: 0 }}>{item}</h3>
            <p style={{ marginBottom: 0, color: "var(--text-muted)" }}>
              {item === "QA scoring coming soon"
                ? "Scoring and rubric automation are planned for a future release."
                : "Available in the current CallQuanta MVP workflow."}
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}
