import "./globals.css";
import { AppHeader } from "../components/AppHeader";
import { I18nProvider } from "../components/I18nProvider";
import { PilotBanner } from "../components/PilotBanner";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <I18nProvider>
          <div className="app-shell">
            <PilotBanner />
            <AppHeader />
            <main className="main-container">{children}</main>
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
