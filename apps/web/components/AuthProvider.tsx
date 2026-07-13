"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { API_BASE_URL, fetchWithCredentials } from "../lib/api";

export type AuthUser = {
  email: string;
  role: "admin" | "manager" | "supervisor" | "agent" | "viewer" | string;
  must_change_password?: boolean;
};

export type AuthStatus = "checking" | "authenticated" | "unauthenticated" | "error";

type AuthContextValue = {
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;
  refreshAuth: () => Promise<AuthUser | null>;
  markAuthenticated: (user: AuthUser) => void;
  markUnauthenticated: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function checkSession(): Promise<AuthUser | null> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetchWithCredentials(`${API_BASE_URL}/auth/me`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error(`Authentication check failed (${response.status})`);
    const body = await response.json();
    return body?.user || null;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<Promise<AuthUser | null> | null>(null);
  const initialCheckStartedRef = useRef(false);

  const markAuthenticated = useCallback((nextUser: AuthUser) => {
    setUser(nextUser);
    setError(null);
    setStatus("authenticated");
  }, []);

  const markUnauthenticated = useCallback(() => {
    setUser(null);
    setError(null);
    setStatus("unauthenticated");
  }, []);

  const refreshAuth = useCallback(async () => {
    if (requestRef.current) return requestRef.current;

    setStatus("checking");
    setError(null);
    const request = checkSession()
      .then((nextUser) => {
        if (nextUser) {
          markAuthenticated(nextUser);
          return nextUser;
        }
        markUnauthenticated();
        return null;
      })
      .catch((reason) => {
        setUser(null);
        setError(reason instanceof Error ? reason.message : "Unable to verify session");
        setStatus("error");
        return null;
      })
      .finally(() => {
        requestRef.current = null;
      });

    requestRef.current = request;
    return request;
  }, [markAuthenticated, markUnauthenticated]);

  useEffect(() => {
    if (initialCheckStartedRef.current) return;
    initialCheckStartedRef.current = true;
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

  const value = useMemo(
    () => ({ user, status, error, refreshAuth, markAuthenticated, markUnauthenticated }),
    [error, markAuthenticated, markUnauthenticated, refreshAuth, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
