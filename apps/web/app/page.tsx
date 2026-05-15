import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: 24 }}>
      <h1>CallQuanta</h1>
      <p>Upload calls and review metadata.</p>
      <nav>
        <ul>
          <li>
            <Link href="/calls">Go to Calls</Link>
          </li>
        </ul>
      </nav>
    </main>
  );
}
