"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, setToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const result = mode === "signup"
        ? await api.signup({ email, name, password })
        : await api.login({ email, password });
      setToken(result.token);
      localStorage.setItem("conduit_admin", JSON.stringify(result.admin));
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-canvas)] px-4">
      <div className="w-full max-w-sm">
        {/* brand */}
        <div className="text-center mb-10">
          <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary)] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-ink)]">Welcome to Conduit</h1>
          <p className="text-[13px] text-[var(--color-ink-secondary)] mt-1.5">Split payment routing for your platform</p>
        </div>

        <div className="bg-white rounded-[var(--radius-xl)] border border-[var(--color-border)] shadow-[var(--shadow-md)] p-6">
          {/* mode toggle */}
          <div className="flex bg-[var(--color-canvas)] rounded-[var(--radius-md)] p-1 mb-6">
            <button onClick={() => { setMode("login"); setError(null); }}
              className={`flex-1 py-2 text-[13px] font-semibold rounded-[var(--radius-sm)] transition-all duration-150 ${mode === "login" ? "bg-white text-[var(--color-ink)] shadow-sm" : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink-secondary)]"}`}>
              Sign in
            </button>
            <button onClick={() => { setMode("signup"); setError(null); }}
              className={`flex-1 py-2 text-[13px] font-semibold rounded-[var(--radius-sm)] transition-all duration-150 ${mode === "signup" ? "bg-white text-[var(--color-ink)] shadow-sm" : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink-secondary)]"}`}>
              Create account
            </button>
          </div>

          {error && (
            <div className="mb-4 px-3 py-2.5 rounded-[var(--radius-md)] bg-[var(--color-danger-bg)] border border-red-200 text-[13px] text-[var(--color-danger)] font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="block text-[13px] font-semibold text-[var(--color-ink)] mb-1.5">Full name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2.5 border border-[var(--color-border)] rounded-[var(--radius-md)] text-[13px] focus:ring-2 focus:ring-[var(--color-primary-ring)] focus:border-[var(--color-primary)] outline-none transition-shadow"
                  placeholder="e.g. Jane Wanjiku" required />
              </div>
            )}
            <div>
              <label className="block text-[13px] font-semibold text-[var(--color-ink)] mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 border border-[var(--color-border)] rounded-[var(--radius-md)] text-[13px] focus:ring-2 focus:ring-[var(--color-primary-ring)] focus:border-[var(--color-primary)] outline-none transition-shadow"
                placeholder="you@company.com" required />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[var(--color-ink)] mb-1.5">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 border border-[var(--color-border)] rounded-[var(--radius-md)] text-[13px] focus:ring-2 focus:ring-[var(--color-primary-ring)] focus:border-[var(--color-primary)] outline-none transition-shadow"
                placeholder={mode === "signup" ? "8+ characters" : "Your password"} minLength={8} required />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-2.5 px-4 bg-[var(--color-primary)] text-white text-[13px] font-semibold rounded-[var(--radius-md)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-all duration-150 shadow-sm mt-2">
              {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-[var(--color-ink-muted)] mt-6">
          Non-custodial payment routing middleware for East African fintech.
        </p>
      </div>
    </div>
  );
}
