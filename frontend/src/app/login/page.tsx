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
    setLoading(true);
    setError(null);

    try {
      let result;
      if (mode === "signup") {
        result = await api.signup({ email, name, password });
      } else {
        result = await api.login({ email, password });
      }
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-indigo-600">
            Conduit
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Split payment routing dashboard
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          {/* mode toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1 mb-6">
            <button
              onClick={() => { setMode("login"); setError(null); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === "login"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Sign in
            </button>
            <button
              onClick={() => { setMode("signup"); setError(null); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === "signup"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Create account
            </button>
          </div>

          {error && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="e.g. Jane Wanjiku"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                placeholder="you@company.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                placeholder={mode === "signup" ? "8+ characters" : "Your password"}
                minLength={8}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {loading
                ? "Please wait..."
                : mode === "login"
                ? "Sign in"
                : "Create account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
