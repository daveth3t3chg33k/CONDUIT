"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { clearToken } from "@/lib/api";
import { usePlatform } from "@/lib/PlatformContext";

const navigation = [
  {
    name: "Dashboard",
    href: "/",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    name: "Transactions",
    href: "/transactions",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    ),
  },
  {
    name: "Vendors",
    href: "/vendors",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    name: "Split Rules",
    href: "/split-rules",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    ),
  },
  {
    name: "Payout Jobs",
    href: "/payout-jobs",
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [adminName, setAdminName] = useState("Admin");
  const [showCreatePlatform, setShowCreatePlatform] = useState(false);
  const [newPlatformName, setNewPlatformName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const {
    platforms,
    selectedPlatformId,
    selectPlatform,
    createPlatform,
  } = usePlatform();

  useEffect(() => {
    try {
      const raw = localStorage.getItem("conduit_admin");
      if (raw) {
        const admin = JSON.parse(raw);
        if (admin.name) setAdminName(admin.name);
      }
    } catch { /* ignore */ }
  }, []);

  function handleLogout() {
    clearToken();
    localStorage.removeItem("conduit_admin");
    localStorage.removeItem("conduit_platform_id");
    router.push("/login");
  }

  async function handleCreatePlatform(e: React.FormEvent) {
    e.preventDefault();
    if (!newPlatformName.trim()) {
      setCreateError("Name is required");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await createPlatform(newPlatformName.trim());
      setShowCreatePlatform(false);
      setNewPlatformName("");
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create platform");
    } finally {
      setCreating(false);
    }
  }

  const initial = adminName.charAt(0).toUpperCase();

  return (
    <>
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-[var(--color-border)] px-4 py-3 flex items-center justify-between">
        <span className="text-base font-semibold tracking-tight text-[var(--color-ink)]">Conduit</span>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="p-2 rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors">
          <svg className="h-5 w-5 text-[var(--color-ink-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            {mobileOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />}
          </svg>
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-[var(--color-border)] transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-auto ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex flex-col h-full">
          {/* Brand */}
          <div className="px-5 h-16 flex items-center gap-3 border-b border-[var(--color-border-subtle)]">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)] flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-[var(--color-ink)]">Conduit</h1>
              <p className="text-[10px] text-[var(--color-ink-muted)] font-medium tracking-wide uppercase">Payment Routing</p>
            </div>
          </div>

          {/* Platform selector */}
          <div className="px-3 pt-4 pb-2">
            <label className="px-3 text-[10px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">Platform</label>
            <div className="mt-1.5 relative">
              <select
                value={selectedPlatformId || ""}
                onChange={(e) => selectPlatform(e.target.value)}
                className="w-full appearance-none px-3 py-2 pr-8 text-[13px] font-medium text-[var(--color-ink)] bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-[var(--radius-md)] focus:ring-2 focus:ring-[var(--color-primary-ring)] focus:border-[var(--color-primary)] outline-none transition-shadow cursor-pointer truncate"
              >
                {platforms.length === 0 ? (
                  <option value="" disabled>No platforms</option>
                ) : (
                  platforms.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))
                )}
              </select>
              <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-ink-muted)] pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <button
              onClick={() => setShowCreatePlatform(true)}
              className="mt-1.5 w-full px-3 py-1.5 text-[12px] font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] rounded-[var(--radius-md)] transition-colors text-left flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New platform
            </button>
          </div>

          {/* Divider */}
          <div className="px-5 py-2">
            <div className="h-px bg-[var(--color-border-subtle)]" />
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-2 space-y-0.5">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150
                    ${isActive
                      ? "bg-[var(--color-primary-light)] text-[var(--color-primary)]"
                      : "text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]"
                    }`}
                >
                  <span className={isActive ? "text-[var(--color-primary)]" : "text-[var(--color-ink-muted)]"}>
                    {item.icon}
                  </span>
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* User section */}
          <div className="px-3 pb-4">
            <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-border-subtle)]">
              <div className="w-8 h-8 rounded-full bg-[var(--color-primary-light)] flex items-center justify-center text-[var(--color-primary)] text-xs font-bold">
                {initial}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-[var(--color-ink)] truncate">{adminName}</p>
                <p className="text-[11px] text-[var(--color-ink-muted)]">Admin</p>
              </div>
              <button
                onClick={handleLogout}
                title="Sign out"
                className="p-1.5 rounded-lg text-[var(--color-ink-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Create Platform Modal */}
      {showCreatePlatform && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] max-w-md w-full mx-4 border border-[var(--color-border)]">
            <div className="px-6 py-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between">
              <h2 className="text-[15px] font-bold text-[var(--color-ink)]">Create Platform</h2>
              <button onClick={() => { setShowCreatePlatform(false); setNewPlatformName(""); setCreateError(null); }} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-ink-muted)]">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleCreatePlatform} className="px-6 py-5 space-y-4">
              {createError && <div className="px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-[13px] font-medium">{createError}</div>}
              <div>
                <label className="block text-[13px] font-semibold text-[var(--color-ink)] mb-1.5">Platform Name *</label>
                <input
                  type="text"
                  value={newPlatformName}
                  onChange={e => setNewPlatformName(e.target.value)}
                  className="w-full px-3 py-2.5 border border-[var(--color-border)] rounded-[var(--radius-md)] text-[13px] focus:ring-2 focus:ring-[var(--color-primary-ring)] focus:border-[var(--color-primary)] outline-none transition-shadow"
                  placeholder="e.g. Acme Marketplace"
                  autoFocus
                />
                <p className="mt-1.5 text-[11px] text-[var(--color-ink-muted)]">
                  A webhook secret will be generated automatically. Save it — it won&apos;t be shown again.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowCreatePlatform(false); setNewPlatformName(""); setCreateError(null); }} className="flex-1 px-4 py-2.5 text-[13px] font-semibold rounded-[var(--radius-md)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors">Cancel</button>
                <button type="submit" disabled={creating} className="flex-1 px-4 py-2.5 text-[13px] font-semibold rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-colors">{creating ? "Creating…" : "Create Platform"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
