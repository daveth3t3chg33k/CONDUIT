"use client";

import { useEffect, useState, useMemo } from "react";
import Sidebar from "@/components/Sidebar";
import StatCard from "@/components/StatCard";
import StatusBadge from "@/components/StatusBadge";
import { api, Transaction } from "@/lib/api";
import { StatCardSkeleton, DashboardTableSkeleton } from "@/components/Skeleton";
import { usePlatform } from "@/lib/PlatformContext";
import { useToast } from "@/lib/ToastContext";

interface DayStats {
  date: string;
  count: number;
  volume_cents: number;
}

// Friendly time ago helper
function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function DashboardPage() {
  const { selectedPlatformId, selectedPlatform } = usePlatform();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dayStats, setDayStats] = useState<DayStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<"ok" | "degraded" | "error">("error");
  const { addToast } = useToast();

  useEffect(() => {
    if (!selectedPlatformId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [txns, health, stats] = await Promise.allSettled([
          api.listTransactions({ platform_id: selectedPlatformId!, limit: 10 }),
          api.ready(),
          api.getPlatformStats(selectedPlatformId!),
        ]);
        if (!cancelled) {
          if (txns.status === "fulfilled") {
            const prev = transactions.length;
            setTransactions(txns.value);
            // Notify when new transactions arrive
            if (prev > 0 && txns.value.length > prev) {
              addToast({
                variant: "info",
                title: "New webhook received",
                message: `${txns.value.length - prev} new payment(s) just came in.`,
              });
            }
          }
          if (health.status === "fulfilled") setServerStatus(health.value.status === "ok" ? "ok" : "degraded");
          if (stats.status === "fulfilled") setDayStats(stats.value.days);
          if (txns.status === "rejected") {
            const msg = txns.reason?.message || "Failed to load";
            setError(msg);
            addToast({ variant: "error", title: "Data fetch failed", message: msg });
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [selectedPlatformId]);

  useEffect(() => {
    setTransactions([]);
    setDayStats([]);
  }, [selectedPlatformId]);

  const sparklines = useMemo(() => {
    const now = new Date();
    const last7: DayStats[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const found = dayStats.find(s => s.date === key);
      last7.push(found || { date: key, count: 0, volume_cents: 0 });
    }
    return {
      txCounts: last7.map(d => d.count),
      volumes: last7.map(d => d.volume_cents / 100),
      payoutCounts: last7.map(d => d.count),
    };
  }, [dayStats]);

  const totalVolume = transactions.reduce((sum, tx) => sum + tx.amount_cents, 0);
  const pendingPayouts = transactions.filter(tx => tx.status === "received" || tx.status === "split_computed").length;

  const txTrend = useMemo(() => {
    const d = sparklines.txCounts;
    if (d.length < 2) return "neutral" as const;
    const first3 = d.slice(0, 3).reduce((a, b) => a + b, 0);
    const last3 = d.slice(-3).reduce((a, b) => a + b, 0);
    if (last3 > first3) return "up" as const;
    if (last3 < first3) return "down" as const;
    return "neutral" as const;
  }, [sparklines.txCounts]);

  const volTrend = useMemo(() => {
    const d = sparklines.volumes;
    if (d.length < 2) return "neutral" as const;
    const first3 = d.slice(0, 3).reduce((a, b) => a + b, 0);
    const last3 = d.slice(-3).reduce((a, b) => a + b, 0);
    if (last3 > first3) return "up" as const;
    if (last3 < first3) return "down" as const;
    return "neutral" as const;
  }, [sparklines.volumes]);

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 lg:ml-0 pt-16 lg:pt-0 overflow-y-auto">
        <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto">
          {/* Header — asymmetric: left-aligned with a quirky tagline */}
          <div className="mb-8 animate-page-enter">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[12px] font-semibold text-[var(--color-primary)] uppercase tracking-wider mb-1">
                  {selectedPlatform ? selectedPlatform.name : "Conduit"}
                </p>
                <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-ink)] leading-tight">
                  {selectedPlatform
                    ? <>Hey — here&apos;s the <span className="bg-gradient-to-r from-[var(--color-primary)] to-violet-600 bg-clip-text text-transparent">money flow</span></>
                    : "Pick a platform"}
                </h1>
                <p className="text-[14px] text-[var(--color-ink-secondary)] mt-1">
                  {selectedPlatform
                    ? "Everything that matters, nothing that doesn't."
                    : "Select one from the sidebar to see what's happening."}
                </p>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] shadow-[var(--shadow-xs)]">
                <div className={`w-2 h-2 rounded-full ${serverStatus === "ok" ? "bg-emerald-500 animate-pulse-dot" : serverStatus === "degraded" ? "bg-amber-500" : "bg-red-500"}`} />
                <span className="text-[12px] font-medium text-[var(--color-ink-secondary)]">
                  {serverStatus === "ok" ? "All systems go" : serverStatus === "degraded" ? "A bit wobbly" : "Checking…"}
                </span>
              </div>
            </div>
          </div>

          {!selectedPlatformId ? (
            /* Empty state — not centered, left-aligned, conversational */
            <div className="animate-page-enter">
              <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] shadow-[var(--shadow-xs)] p-8 max-w-lg">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 flex items-center justify-center mb-5 animate-float">
                  <svg className="w-7 h-7 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <h3 className="text-[16px] font-bold text-[var(--color-ink)] mb-1">Nothing to see yet</h3>
                <p className="text-[13px] text-[var(--color-ink-secondary)] leading-relaxed">
                  Pick a platform from the sidebar, or create your first one. Once payments start flowing in through webhooks, you&apos;ll see everything here — transaction counts, volume, and payout status.
                </p>
                <div className="mt-5 flex items-center gap-2 text-[13px] font-medium text-[var(--color-primary)]">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  Start from the sidebar →
                </div>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-6 px-4 py-3 rounded-[var(--radius-md)] bg-[var(--color-danger-bg)] border border-red-200 text-[13px] text-[var(--color-danger)] font-medium flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  {error}
                </div>
              )}

              {/* Stat cards — varied layout: first card is accent, rest are white */}
              <div className="mb-8">
              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  <StatCardSkeleton accent />
                  <StatCardSkeleton />
                  <StatCardSkeleton />
                  <StatCardSkeleton />
                </div>
              ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 stagger-children">
                <StatCard
                  accent
                  label="Transactions"
                  value={transactions.length}
                  change="Last 10 incoming"
                  trend={txTrend}
                  sparklineData={sparklines.txCounts}
                  sparklineColor="#4F46E5"
                  icon={
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                    </svg>
                  }
                />
                <StatCard
                  label="Volume"
                  value={`KES ${(totalVolume / 100).toLocaleString()}`}
                  change="Combined value"
                  trend={volTrend}
                  sparklineData={sparklines.volumes}
                  sparklineColor="#10B981"
                  icon={
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  }
                />
                <StatCard
                  label="Health"
                  value={serverStatus === "ok" ? "Healthy" : serverStatus === "degraded" ? "Degraded" : "—"}
                  change={serverStatus === "ok" ? "DB + Redis connected" : "Checking deps"}
                  icon={
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  }
                />
                <StatCard
                  label="Pending"
                  value={pendingPayouts}
                  change={pendingPayouts === 0 ? "All caught up ✓" : "Awaiting payout"}
                  trend={pendingPayouts === 0 ? "up" : "down"}
                  sparklineData={sparklines.payoutCounts}
                  sparklineColor="#F59E0B"
                  icon={
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  }
                />
              </div>
              )}
              </div>

              {/* Recent transactions table */}
              <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] shadow-[var(--shadow-xs)] animate-card-enter" style={{ animationDelay: "300ms" }}>
                <div className="px-6 py-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between">
                  <div>
                    <h2 className="text-[14px] font-bold text-[var(--color-ink)]">Latest activity</h2>
                    <p className="text-[12px] text-[var(--color-ink-muted)] mt-0.5">
                      {transactions.length > 0
                        ? `${transactions.length} most recent payments`
                        : "No payments have come in yet"}
                    </p>
                  </div>
                  <a href="/transactions" className="link-underline text-[13px] font-semibold text-[var(--color-primary)] transition-colors hover:text-[var(--color-primary-hover)]">
                    View all →
                  </a>
                </div>

                {loading ? (
                  <div className="px-6 py-16 text-center">
                    <div className="flex justify-center gap-1 mb-4">
                      <div className="w-2 h-2 rounded-full bg-[var(--color-primary)] animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-2 h-2 rounded-full bg-[var(--color-primary)] animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-2 h-2 rounded-full bg-[var(--color-primary)] animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                    <p className="text-[13px] text-[var(--color-ink-muted)]">Crunching numbers…</p>
                  </div>
                ) : transactions.length === 0 ? (
                  <div className="px-6 py-12">
                    <div className="flex items-start gap-4 p-4 bg-[var(--color-canvas)] rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)]">
                      <div className="w-10 h-10 rounded-xl bg-[var(--color-surface)] flex items-center justify-center shrink-0 animate-float">
                        <svg className="w-5 h-5 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-[13px] font-semibold text-[var(--color-ink)]">Waiting on payments</p>
                        <p className="text-[12px] text-[var(--color-ink-muted)] mt-0.5 leading-relaxed">
                          Once your payment gateway sends a webhook here, transactions will show up in this table. Make sure the webhook URL is pointing to <code className="px-1.5 py-0.5 bg-[var(--color-surface)] rounded text-[11px] font-mono text-[var(--color-primary)]">/api/v1/webhook/ingress</code>
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="border-b border-[var(--color-border-subtle)] text-left">
                          <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)] text-[11px] uppercase tracking-wider">Reference</th>
                          <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)] text-[11px] uppercase tracking-wider text-right">Amount</th>
                          <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)] text-[11px] uppercase tracking-wider">Status</th>
                          <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)] text-[11px] uppercase tracking-wider">When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.map((tx, i) => (
                          <tr
                            key={tx.id}
                            className="border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[var(--color-surface-hover)] transition-colors duration-150 table-row-hover animate-card-enter"
                            style={{ animationDelay: `${i * 40}ms` }}
                          >
                            <td className="px-6 py-3.5 font-mono text-[12px] text-[var(--color-ink-secondary)] tabular-nums">
                              <span className="inline-flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] opacity-40" />
                                {tx.external_ref}
                              </span>
                            </td>
                            <td className="px-6 py-3.5 text-right font-bold text-[var(--color-ink)] tabular-nums">
                              {tx.currency} {(tx.amount_cents / 100).toLocaleString()}
                            </td>
                            <td className="px-6 py-3.5"><StatusBadge status={tx.status} /></td>
                            <td className="px-6 py-3.5 text-[var(--color-ink-muted)]" title={new Date(tx.received_at).toLocaleString()}>
                              {timeAgo(tx.received_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Quick action hint */}
              {transactions.length > 0 && (
                <div className="mt-6 flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-indigo-50/80 to-violet-50/60 rounded-[var(--radius-lg)] border border-indigo-100 animate-card-enter" style={{ animationDelay: "500ms" }}>
                  <div className="w-8 h-8 rounded-lg bg-[var(--color-surface)]/80 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold text-[var(--color-ink)]">Split rules are {pendingPayouts > 0 ? "actively routing" : "configured and ready"}</p>
                    <p className="text-[12px] text-[var(--color-ink-secondary)]">
                      {pendingPayouts > 0
                        ? `${pendingPayouts} payouts are queued or being processed right now.`
                        : "New payments will be automatically split according to your rules."}
                    </p>
                  </div>
                  <a href="/split-rules" className="text-[12px] font-semibold text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] transition-colors link-underline shrink-0">
                    Check rules →
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
