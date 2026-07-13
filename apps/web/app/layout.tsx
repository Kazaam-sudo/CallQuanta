import "./globals.css";
import { AppHeader } from "../components/AppHeader";
import { AuthProvider } from "../components/AuthProvider";
import { I18nProvider } from "../components/I18nProvider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <I18nProvider>
          <AuthProvider>
            <div className="app-shell">
              <AppHeader />
              <main className="main-container">{children}</main>
            </div>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
