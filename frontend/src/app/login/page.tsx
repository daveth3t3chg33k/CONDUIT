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

  const pwStrength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3;
  const pwLabels = ["", "Weak", "Okay", "Strong"];
  const pwColors = ["", "bg-red-400", "bg-amber-400", "bg-emerald-400"];

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-canvas)] px-4">
      <div className={`w-full max-w-[360px] transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}>
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--color-ink)] flex items-center justify-center mx-auto mb-4">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-[20px] font-semibold text-[var(--color-ink)] tracking-tight">
            {mode === "login" ? "Welcome back" : "Create account"}
          </h1>
          <p className="text-[13px] text-[var(--color-ink-secondary)] mt-1">
            {mode === "login"
              ? "Sign in to your Conduit dashboard"
              : "Set up your split-payment engine"}
          </p>
        </div>

        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5">
          {/* Mode toggle */}
          <div className="flex bg-[var(--color-canvas)] rounded-[var(--radius-md)] p-0.5 mb-5">
            <button onClick={() => { setMode("login"); setError(null); }}
              className={`flex-1 py-2 text-[13px] font-medium rounded-[var(--radius-sm)] transition-all duration-150 btn-press ${mode === "login" ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm" : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink-secondary)]"}`}>
              Sign in
            </button>
            <button onClick={() => { setMode("signup"); setError(null); }}
              className={`flex-1 py-2 text-[13px] font-medium rounded-[var(--radius-sm)] transition-all duration-150 btn-press ${mode === "signup" ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm" : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink-secondary)]"}`}>
              Create account
            </button>
          </div>

          {error && (
            <div className="mb-4 px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-[13px] font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "signup" && (
              <div className="animate-fade-in">
                <label className="block text-[13px] font-medium text-[var(--color-ink)] mb-1">Full name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] text-[13px] focus:ring-2 focus:ring-[var(--color-primary-ring)] focus:border-[var(--color-primary)] outline-none transition-all duration-150"
                  placeholder="e.g. Jane Wanjiku" required />
              </div>
            )}
            <div>
              <label className="block text-[13px] font-medium text-[var(--color-ink)] mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] text-[13px] focus:ring-2 focus:ring-[var(--color-primary-ring)] focus:border-[var(--color-primary)] outline-none transition-all duration-150"
                placeholder="you@company.com" required />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[var(--color-ink)] mb-1">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] text-[13px] focus:ring-2 focus:ring-[var(--color-primary-ring)] focus:border-[var(--color-primary)] outline-none transition-all duration-150"
                placeholder={mode === "signup" ? "8+ characters" : "Your password"} minLength={8} required />
              {mode === "signup" && password.length > 0 && (
                <div className="mt-2 flex items-center gap-2 animate-fade-in">
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
              className="w-full py-2 px-4 bg-[var(--color-ink)] text-white text-[13px] font-medium rounded-[var(--radius-md)] hover:bg-[var(--color-ink)]/90 disabled:opacity-50 transition-all duration-150 mt-3 btn-press">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Please wait…
                </span>
              ) : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>

        <p className="text-center text-[12px] text-[var(--color-ink-muted)] mt-5">
          Non-custodial payment routing middleware for East African fintech.
        </p>
      </div>
    </div>
  );
}
