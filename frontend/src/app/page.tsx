"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import StatCard from "@/components/StatCard";
import StatusBadge from "@/components/StatusBadge";
import { api, Transaction } from "@/lib/api";
import { usePlatform } from "@/lib/PlatformContext";

export default function DashboardPage() {
  const { selectedPlatformId, selectedPlatform } = usePlatform();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<"ok" | "degraded" | "error">("error");

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
        const [txns, health] = await Promise.allSettled([
          api.listTransactions({ platform_id: selectedPlatformId!, limit: 10 }),
          api.ready(),
        ]);
        if (!cancelled) {
          if (txns.status === "fulfilled") setTransactions(txns.value);
          if (health.status === "fulfilled") setServerStatus(health.value.status === "ok" ? "ok" : "degraded");
          if (txns.status === "rejected") setError(txns.reason?.message || "Failed to load");
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

  const totalVolume = transactions.reduce((sum, tx) => sum + tx.amount_cents, 0);
  const pendingPayouts = transactions.filter(tx => tx.status === "received" || tx.status === "split_computed").length;

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 lg:ml-0 pt-16 lg:pt-0 overflow-y-auto">
        <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto">
          {/* header */}
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1 className="text-[22px] font-bold tracking-tight text-[var(--color-ink)]">Dashboard</h1>
              <p className="text-[13px] text-[var(--color-ink-secondary)] mt-1">
                {selectedPlatform ? `Overview of ${selectedPlatform.name}` : "Select a platform to get started"}
              </p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-[var(--color-border)]">
              <div className={`w-2 h-2 rounded-full ${serverStatus === "ok" ? "bg-emerald-500" : serverStatus === "degraded" ? "bg-amber-500" : "bg-red-500"}`} />
              <span className="text-[12px] font-medium text-[var(--color-ink-secondary)]">
                {serverStatus === "ok" ? "Operational" : serverStatus === "degraded" ? "Degraded" : "Checking"}
              </span>
            </div>
          </div>

          {!selectedPlatformId ? (
            <div className="bg-white rounded-[var(--radius-lg)] border border-[var(--color-border)] shadow-[var(--shadow-xs)] px-6 py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-[var(--color-primary-light)] flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <p className="text-[15px] font-semibold text-[var(--color-ink)]">No platform selected</p>
              <p className="text-[13px] text-[var(--color-ink-muted)] mt-1">Select a platform from the sidebar or create a new one to view data.</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-6 px-4 py-3 rounded-[var(--radius-md)] bg-[var(--color-danger-bg)] border border-red-200 text-[13px] text-[var(--color-danger)] font-medium">
                  {error}
                </div>
              )}

              {/* stat cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
                <StatCard
                  label="Transactions"
                  value={loading ? "—" : transactions.length}
                  change={loading ? "Loading…" : "Last 10 incoming"}
                  icon={
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                    </svg>
                  }
                />
                <StatCard
                  label="Volume (KES)"
                  value={loading ? "—" : `KES ${(totalVolume / 100).toLocaleString()}`}
                  change={loading ? "Loading…" : "Combined value"}
                  trend="up"
                  icon={
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  }
                />
                <StatCard
                  label="Server Health"
                  value={serverStatus === "ok" ? "Healthy" : serverStatus === "degraded" ? "Degraded" : "—"}
                  change={serverStatus === "ok" ? "DB + Redis connected" : "Checking dependencies"}
                  icon={
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  }
                />
                <StatCard
                  label="Pending Payouts"
                  value={pendingPayouts}
                  change={pendingPayouts === 0 ? "All caught up" : "Awaiting payout"}
                  trend={pendingPayouts === 0 ? "up" : "down"}
                  icon={
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  }
                />
              </div>

              {/* recent transactions */}
              <div className="bg-white rounded-[var(--radius-lg)] border border-[var(--color-border)] shadow-[var(--shadow-xs)]">
                <div className="px-6 py-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold text-[var(--color-ink)]">Recent Transactions</h2>
                  <a href="/transactions" className="text-[13px] font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] transition-colors">
                    View all →
                  </a>
                </div>

                {loading ? (
                  <div className="px-6 py-16 text-center">
                    <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-ink-faint)] border-t-[var(--color-primary)] mb-3" />
                    <p className="text-[13px] text-[var(--color-ink-muted)]">Loading transactions…</p>
                  </div>
                ) : transactions.length === 0 ? (
                  <div className="px-6 py-16 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary-light)] flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                      </svg>
                    </div>
                    <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">No transactions yet</p>
                    <p className="text-[12px] text-[var(--color-ink-muted)] mt-1">Payments will appear here once webhooks arrive.</p>
                  </div>
                ) : (
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-[var(--color-border-subtle)] text-left">
                        <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)]">Ref</th>
                        <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)] text-right">Amount</th>
                        <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)]">Status</th>
                        <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)]">Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((tx) => (
                        <tr key={tx.id} className="border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[var(--color-surface-hover)] transition-colors">
                          <td className="px-6 py-3.5 font-mono text-[12px] text-[var(--color-ink-secondary)] tabular-nums">{tx.external_ref}</td>
                          <td className="px-6 py-3.5 text-right font-semibold text-[var(--color-ink)] tabular-nums">
                            {tx.currency} {(tx.amount_cents / 100).toLocaleString()}
                          </td>
                          <td className="px-6 py-3.5"><StatusBadge status={tx.status} /></td>
                          <td className="px-6 py-3.5 text-[var(--color-ink-muted)]">
                            {new Date(tx.received_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
