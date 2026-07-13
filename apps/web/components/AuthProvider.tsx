"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { API_BASE_URL, fetchWithCredentials } from "../lib/api";
import { isPublicPath, loginUrlFor } from "../lib/auth-routing.mjs";

export type AuthUser = {
  email: string;
  role: "admin" | "manager" | "supervisor" | "agent" | "viewer" | string;
  must_change_password?: boolean;
};

type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";

type AuthContextValue = {
  user: AuthUser | null;
  status: AuthStatus;
  refreshAuth: () => Promise<AuthUser | null>;
  markAuthenticated: (user: AuthUser) => void;
  markUnauthenticated: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const redirectingRef = useRef(false);

  const markAuthenticated = useCallback((nextUser: AuthUser) => {
    redirectingRef.current = false;
    setUser(nextUser);
    setStatus("authenticated");
  }, []);

  const markUnauthenticated = useCallback(() => {
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const refreshAuth = useCallback(async () => {
    setStatus((current) => (current === "authenticated" ? current : "loading"));
    try {
      const response = await fetchWithCredentials(`${API_BASE_URL}/auth/me`, {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (response.status === 401) {
        markUnauthenticated();
        return null;
      }
      if (!response.ok) {
        throw new Error(`Authentication check failed (${response.status})`);
      }
      const body = await response.json();
      const nextUser = body?.user || null;
      if (!nextUser) {
        markUnauthenticated();
        return null;
      }
      markAuthenticated(nextUser);
      return nextUser;
    } catch {
      setUser(null);
      setStatus("error");
      return null;
    }
  }, [markAuthenticated, markUnauthenticated]);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  useEffect(() => {
    const onAuthChanged = () => void refreshAuth();
    const onUnauthorized = () => markUnauthenticated();
    window.addEventListener("callquanta-auth-changed", onAuthChanged);
    window.addEventListener("callquanta-unauthorized", onUnauthorized);
    return () => {
      window.removeEventListener("callquanta-auth-changed", onAuthChanged);
      window.removeEventListener("callquanta-unauthorized", onUnauthorized);
    };
  }, [markUnauthenticated, refreshAuth]);

  useEffect(() => {
    if (status !== "unauthenticated" || isPublicPath(pathname) || redirectingRef.current) return;
    redirectingRef.current = true;
    router.replace(loginUrlFor(pathname));
  }, [pathname, router, status]);

  useEffect(() => {
    if (status !== "authenticated" || !user?.must_change_password) return;
    if (!["/change-password", "/login"].includes(pathname)) router.replace("/change-password");
  }, [pathname, router, status, user]);

  const value = useMemo(
    () => ({ user, status, refreshAuth, markAuthenticated, markUnauthenticated }),
    [markAuthenticated, markUnauthenticated, refreshAuth, status, user],
  );

  const protectedRoute = !isPublicPath(pathname);
  if (protectedRoute && status !== "authenticated") {
    return (
      <AuthContext.Provider value={value}>
        <section className="card empty-state" aria-live="polite">
          {status === "error" ? (
            <>
              <p>Не удалось проверить сессию.</p>
              <button className="button" type="button" onClick={() => void refreshAuth()}>Повторить</button>
            </>
          ) : (
            <p>Проверка сессии...</p>
          )}
        </section>
      </AuthContext.Provider>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
