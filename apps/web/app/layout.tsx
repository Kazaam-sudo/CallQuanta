import "./globals.css";
import { AppHeader } from "../components/AppHeader";
import { AuthProvider } from "../components/AuthProvider";
import { I18nProvider } from "../components/I18nProvider";
import { ProtectedRoute } from "../components/ProtectedRoute";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <I18nProvider>
            <div className="app-shell">
              <AppHeader />
              <main className="main-container">
                <ProtectedRoute>{children}</ProtectedRoute>
              </main>
            </div>
          </I18nProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
