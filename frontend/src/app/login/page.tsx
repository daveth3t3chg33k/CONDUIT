"use client";

import { useState, useEffect } from "react";
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Check if already logged in
    const token = localStorage.getItem("conduit_token");
    if (token) router.push("/");
  }, [router]);

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

  // Password strength indicator
  const pwStrength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3;
  const pwLabels = ["", "Weak", "Okay", "Strong"];
  const pwColors = ["", "bg-red-400", "bg-amber-400", "bg-emerald-400"];

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-canvas)] px-4 relative overflow-hidden">
      {/* Background decoration — asymmetric blob, not centered, feels hand-placed */}
      <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-gradient-to-br from-indigo-100/60 via-purple-50/40 to-transparent blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-gradient-to-tr from-amber-50/50 via-orange-50/30 to-transparent blur-3xl pointer-events-none" />

      <div className={`w-full max-w-sm relative transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--color-primary)] to-indigo-600 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-indigo-200/80 animate-brand-buzz cursor-default">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-[26px] font-bold tracking-tight text-[var(--color-ink)]">
            {mode === "login" ? "Welcome back" : "Get started"}
          </h1>
          <p className="text-[14px] text-[var(--color-ink-secondary)] mt-1.5">
            {mode === "login"
              ? "Sign in to manage your payment splits"
              : "Set up your split-payment engine in minutes"}
          </p>
        </div>

        <div className="bg-[var(--color-surface)] rounded-[var(--radius-xl)] border border-[var(--color-border)] shadow-[var(--shadow-lg)] p-6 relative">
          {/* Mode toggle */}
          <div className="flex bg-[var(--color-canvas)] rounded-[var(--radius-md)] p-1 mb-6">
            <button onClick={() => { setMode("login"); setError(null); }}
              className={`flex-1 py-2.5 text-[13px] font-semibold rounded-[var(--radius-sm)] transition-all duration-200 btn-press ${mode === "login" ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm" : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink-secondary)]"}`}>
              Sign in
            </button>
            <button onClick={() => { setMode("signup"); setError(null); }}
              className={`flex-1 py-2.5 text-[13px] font-semibold rounded-[var(--radius-sm)] transition-all duration-200 btn-press ${mode === "signup" ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm" : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink-secondary)]"}`}>
              Create account
            </button>
          </div>

          {error && (
            <div className="mb-4 px-3 py-2.5 rounded-[var(--radius-md)] bg-[var(--color-danger-bg)] border border-red-200 text-[13px] text-[var(--color-danger)] font-medium flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="animate-card-enter">
                <label className="block text-[13px] font-semibold text-[var(--color-ink)] mb-1.5">Full name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2.5 border border-[var(--color-border)] rounded-[var(--radius-md)] text-[13px] focus:ring-2 focus:ring-[var(--color-primary-ring)] focus:border-[var(--color-primary)] outline-none transition-all duration-150 hover:border-[var(--color-ink-faint)]"
                  placeholder="e.g. Jane Wanjiku" required />
              </div>
            )}
            <div>
              <label className="block text-[13px] font-semibold text-[var(--color-ink)] mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 border border-[var(--color-border)] rounded-[var(--radius-md)] text-[13px] focus:ring-2 focus:ring-[var(--color-primary-ring)] focus:border-[var(--color-primary)] outline-none transition-all duration-150 hover:border-[var(--color-ink-faint)]"
                placeholder="you@company.com" required />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[var(--color-ink)] mb-1.5">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 border border-[var(--color-border)] rounded-[var(--radius-md)] text-[13px] focus:ring-2 focus:ring-[var(--color-primary-ring)] focus:border-[var(--color-primary)] outline-none transition-all duration-150 hover:border-[var(--color-ink-faint)]"
                placeholder={mode === "signup" ? "8+ characters" : "Your password"} minLength={8} required />
              {/* Password strength bar — only show on signup */}
              {mode === "signup" && password.length > 0 && (
                <div className="mt-2 flex items-center gap-2 animate-card-enter">
                  <div className="flex-1 h-1 rounded-full bg-[var(--color-border-subtle)] overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-300 ${pwColors[pwStrength]}`} style={{ width: `${(pwStrength / 3) * 100}%` }} />
                  </div>
                  <span className={`text-[11px] font-medium ${pwStrength === 1 ? "text-red-500" : pwStrength === 2 ? "text-amber-600" : "text-emerald-600"}`}>
                    {pwLabels[pwStrength]}
                  </span>
                </div>
              )}
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-[var(--color-primary)] to-indigo-600 text-white text-[13px] font-semibold rounded-[var(--radius-md)] hover:from-[var(--color-primary-hover)] hover:to-indigo-700 disabled:opacity-50 transition-all duration-200 shadow-sm hover:shadow-md mt-2 btn-press">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Please wait…
                </span>
              ) : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>

        <p className="text-center text-[12px] text-[var(--color-ink-muted)] mt-6 leading-relaxed">
          Non-custodial payment routing middleware<br />for East African fintech platforms.
        </p>
      </div>
    </div>
  );
}
