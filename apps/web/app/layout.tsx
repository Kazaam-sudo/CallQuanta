import Link from "next/link";
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="app-header">
            <div className="header-inner">
              <div>
                <h1 className="brand-title">CallQuanta</h1>
                <p className="brand-subtitle">Open-source AI QA for contact centers</p>
              </div>
              <nav className="top-nav" aria-label="Main navigation">
                <Link href="/dashboard">Dashboard</Link>
                <Link href="/calls">Calls</Link>
                <Link href="/settings/llm">Settings</Link>
              </nav>
            </div>
          </header>
          <main className="main-container">{children}</main>
        </div>
      </body>
    </html>
  );
}
