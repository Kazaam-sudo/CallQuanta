"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || "Invalid email or password");
      }
      router.push(searchParams.get("next") || "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="card" style={{ maxWidth: 440, margin: "48px auto" }}>
      <h2>Sign in</h2>
      <p style={{ color: "var(--text-muted)" }}>Use your CallQuanta admin or viewer account to access sensitive call data.</p>
      <form className="grid" style={{ gap: 14 }} onSubmit={submit}>
        <label>Email</label>
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
        <label>Password</label>
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        {error && <div className="notice notice-danger">{error}</div>}
        <button className="button" type="submit" disabled={isSubmitting}>{isSubmitting ? "Signing in..." : "Sign in"}</button>
      </form>
    </section>
  );
}


export default function LoginPage() {
  return (
    <Suspense fallback={<section className="card" style={{ maxWidth: 440, margin: "48px auto" }}>Loading...</section>}>
      <LoginForm />
    </Suspense>
  );
}
