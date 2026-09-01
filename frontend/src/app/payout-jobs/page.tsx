"use client";

import { useEffect, useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import StatusBadge from "@/components/StatusBadge";
import { api, PayoutJob } from "@/lib/api";
import { usePlatform } from "@/lib/PlatformContext";

const STATUS_FILTERS = ["all", "queued", "dispatching", "completed", "manual_review"];

export default function PayoutJobsPage() {
  const { selectedPlatformId, selectedPlatform } = usePlatform();
  const [jobs, setJobs] = useState<PayoutJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [page, setPage] = useState(0);
  const limit = 20;

  const loadJobs = useCallback(async () => {
    if (!selectedPlatformId) {
      setJobs([]);
      setLoading(false);
      return;
    }
    setLoading(true); setError(null);
    try {
      const params: { status?: string; limit: number; offset: number } = { limit, offset: page * limit };
      if (activeFilter !== "all") params.status = activeFilter;
      setJobs(await api.listPayoutJobs(params));
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [selectedPlatformId, activeFilter, page]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  // Reset filter when platform changes
  useEffect(() => { setActiveFilter("all"); setPage(0); }, [selectedPlatformId]);

  const stats = {
    queued: jobs.filter(j => j.status === "queued").length,
    completed: jobs.filter(j => j.status === "completed").length,
    failed: jobs.filter(j => j.status === "manual_review").length,
    totalAmount: jobs.reduce((sum, j) => sum + j.amount_cents, 0),
  };

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 lg:ml-0 pt-16 lg:pt-0 overflow-y-auto">
        <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto">
          <div className="mb-6">
            <h1 className="text-[22px] font-bold tracking-tight text-[var(--color-ink)]">Payout Jobs</h1>
            <p className="text-[13px] text-[var(--color-ink-secondary)] mt-1">
              {selectedPlatform ? `Track outgoing payouts for ${selectedPlatform.name}` : "Select a platform to view payout jobs"}
            </p>
          </div>

          {!selectedPlatformId ? (
            <div className="bg-white rounded-[var(--radius-lg)] border border-[var(--color-border)] shadow-[var(--shadow-xs)] px-6 py-16 text-center">
              <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">Select a platform from the sidebar to view its payout jobs.</p>
            </div>
          ) : (
            <>
              {/* summary cards */}
              {!loading && jobs.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                  <div className="px-4 py-3 bg-white rounded-[var(--radius-md)] border border-[var(--color-border)]">
                    <p className="text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">Queued</p>
                    <p className="text-xl font-bold mt-1 tabular-nums text-[var(--color-ink)]">{stats.queued}</p>
                  </div>
                  <div className="px-4 py-3 bg-white rounded-[var(--radius-md)] border border-[var(--color-border)]">
                    <p className="text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">Completed</p>
                    <p className="text-xl font-bold mt-1 tabular-nums text-emerald-600">{stats.completed}</p>
                  </div>
                  <div className="px-4 py-3 bg-white rounded-[var(--radius-md)] border border-[var(--color-border)]">
                    <p className="text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">Manual Review</p>
                    <p className="text-xl font-bold mt-1 tabular-nums text-orange-600">{stats.failed}</p>
                  </div>
                  <div className="px-4 py-3 bg-white rounded-[var(--radius-md)] border border-[var(--color-border)]">
                    <p className="text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">Total Amount</p>
                    <p className="text-xl font-bold mt-1 tabular-nums text-[var(--color-ink)]">KES {(stats.totalAmount / 100).toLocaleString()}</p>
                  </div>
                </div>
              )}

              {/* filter pills */}
              <div className="flex items-center gap-2 mb-6 flex-wrap">
                {STATUS_FILTERS.map(f => (
                  <button key={f} onClick={() => { setActiveFilter(f); setPage(0); }}
                    className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all duration-150
                      ${activeFilter === f ? "bg-[var(--color-primary-light)] text-[var(--color-primary)] ring-1 ring-[var(--color-primary)]" : "bg-white text-[var(--color-ink-secondary)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]"}`}>
                    {f === "all" ? "All" : f.replace(/_/g, " ")}
                  </button>
                ))}
              </div>

              {error && <div className="mb-4 px-4 py-3 rounded-[var(--radius-md)] bg-[var(--color-danger-bg)] border border-red-200 text-[13px] text-[var(--color-danger)] font-medium">{error}</div>}

              <div className="bg-white rounded-[var(--radius-lg)] border border-[var(--color-border)] shadow-[var(--shadow-xs)] overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead><tr className="border-b border-[var(--color-border-subtle)] text-left">
                    <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)]">Job ID</th>
                    <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)]">Vendor</th>
                    <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)] text-right">Amount</th>
                    <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)]">Status</th>
                    <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)]">Attempts</th>
                    <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)]">Last Error</th>
                    <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)]">Created</th>
                  </tr></thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={7} className="px-6 py-16 text-center">
                        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-ink-faint)] border-t-[var(--color-primary)] mb-3" />
                        <p className="text-[13px] text-[var(--color-ink-muted)]">Loading…</p>
                      </td></tr>
                    ) : jobs.length === 0 ? (
                      <tr><td colSpan={7} className="px-6 py-16 text-center text-[13px] text-[var(--color-ink-muted)]">No payout jobs found.</td></tr>
                    ) : jobs.map(job => (
                      <tr key={job.id} className="border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[var(--color-surface-hover)] transition-colors">
                        <td className="px-6 py-3.5 font-mono text-[12px] text-[var(--color-ink-secondary)] tabular-nums">{job.id.slice(0, 8)}…</td>
                        <td className="px-6 py-3.5 font-mono text-[12px] text-[var(--color-ink-secondary)] tabular-nums">{job.vendor_id.slice(0, 8)}…</td>
                        <td className="px-6 py-3.5 text-right font-bold text-[var(--color-ink)] tabular-nums">KES {(job.amount_cents / 100).toLocaleString()}</td>
                        <td className="px-6 py-3.5"><StatusBadge status={job.status} /></td>
                        <td className="px-6 py-3.5 text-[var(--color-ink-muted)] tabular-nums">{job.attempts}</td>
                        <td className="px-6 py-3.5 text-[var(--color-danger)] text-[12px] max-w-[200px] truncate">{job.last_error || "—"}</td>
                        <td className="px-6 py-3.5 text-[var(--color-ink-muted)] text-[12px]">{new Date(job.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* pagination */}
              <div className="flex items-center justify-between mt-4">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                  className="px-4 py-2 text-[13px] font-medium rounded-[var(--radius-md)] border border-[var(--color-border)] disabled:opacity-40 hover:bg-[var(--color-surface-hover)] transition-colors bg-white">Previous</button>
                <span className="text-[13px] text-[var(--color-ink-muted)]">Page {page + 1}</span>
                <button onClick={() => { if (jobs.length === limit) setPage(p => p + 1); }} disabled={jobs.length < limit}
                  className="px-4 py-2 text-[13px] font-medium rounded-[var(--radius-md)] border border-[var(--color-border)] disabled:opacity-40 hover:bg-[var(--color-surface-hover)] transition-colors bg-white">Next</button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
