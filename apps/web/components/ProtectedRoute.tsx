"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import { isPublicPath, loginUrlFor } from "../lib/auth-routing.mjs";
import { useAuth } from "./AuthProvider";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const { status, error, refreshAuth } = useAuth();
  const redirectedPathRef = useRef<string | null>(null);
  const isPublic = isPublicPath(pathname);

  useEffect(() => {
    if (isPublic || status !== "unauthenticated") return;
    if (redirectedPathRef.current === pathname) return;
    redirectedPathRef.current = pathname;
    router.replace(loginUrlFor(pathname));
  }, [isPublic, pathname, router, status]);

  useEffect(() => {
    if (status === "authenticated" || isPublic) redirectedPathRef.current = null;
  }, [isPublic, status]);

  if (isPublic) return <>{children}</>;
  if (status === "authenticated") return <>{children}</>;

  if (status === "error") {
    return (
      <section className="card empty-state" aria-live="polite">
        <p>Не удалось проверить сессию{error ? `: ${error}` : "."}</p>
        <button className="button" type="button" onClick={() => void refreshAuth()}>Повторить</button>
      </section>
    );
  }

  return (
    <section className="card empty-state" aria-live="polite">
      <p>{status === "unauthenticated" ? "Переход к странице входа..." : "Проверка сессии..."}</p>
    </section>
  );
}
