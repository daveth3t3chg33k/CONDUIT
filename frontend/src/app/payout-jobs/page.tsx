"use client";

import { useEffect, useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import StatusBadge from "@/components/StatusBadge";
import { api, PayoutJob } from "@/lib/api";

const STATUS_FILTERS = ["all", "queued", "dispatching", "completed", "manual_review"];

export default function PayoutJobsPage() {
  const [jobs, setJobs] = useState<PayoutJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [page, setPage] = useState(0);
  const limit = 20;

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { status?: string; limit: number; offset: number } = {
        limit,
        offset: page * limit,
      };
      if (activeFilter !== "all") params.status = activeFilter;
      const data = await api.listPayoutJobs(params);
      setJobs(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payout jobs");
    } finally {
      setLoading(false);
    }
  }, [activeFilter, page]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // Summary stats
  const stats = {
    queued: jobs.filter((j) => j.status === "queued").length,
    completed: jobs.filter((j) => j.status === "completed").length,
    failed: jobs.filter((j) => j.status === "manual_review").length,
    totalAmount: jobs.reduce((sum, j) => sum + j.amount_cents, 0),
  };

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 lg:ml-0 pt-16 lg:pt-0">
        <div className="px-6 lg:px-10 py-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">Payout Jobs</h1>
            <p className="text-sm text-gray-500 mt-1">
              Track outgoing payouts to vendors and their delivery status.
            </p>
          </div>

          {/* summary row */}
          {!loading && jobs.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="px-4 py-3 bg-white rounded-lg border border-gray-200">
                <p className="text-xs text-gray-500">Queued</p>
                <p className="text-lg font-semibold mt-0.5">{stats.queued}</p>
              </div>
              <div className="px-4 py-3 bg-white rounded-lg border border-gray-200">
                <p className="text-xs text-gray-500">Completed</p>
                <p className="text-lg font-semibold mt-0.5">{stats.completed}</p>
              </div>
              <div className="px-4 py-3 bg-white rounded-lg border border-gray-200">
                <p className="text-xs text-gray-500">Manual Review</p>
                <p className="text-lg font-semibold mt-0.5 text-orange-600">{stats.failed}</p>
              </div>
              <div className="px-4 py-3 bg-white rounded-lg border border-gray-200">
                <p className="text-xs text-gray-500">Total Amount</p>
                <p className="text-lg font-semibold mt-0.5">
                  KES {(stats.totalAmount / 100).toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {/* status filter pills */}
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => {
                  setActiveFilter(f);
                  setPage(0);
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  activeFilter === f
                    ? f === "manual_review"
                      ? "bg-orange-50 text-orange-700 border border-orange-200"
                      : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                    : "bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100"
                }`}
              >
                {f === "all" ? "All" : f.replace(/_/g, " ")}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="px-6 py-3 font-medium">Job ID</th>
                  <th className="px-6 py-3 font-medium">Vendor</th>
                  <th className="px-6 py-3 font-medium text-right">Amount</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Attempts</th>
                  <th className="px-6 py-3 font-medium">Last Error</th>
                  <th className="px-6 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                      <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600 mb-2" />
                      <p>Loading payout jobs...</p>
                    </td>
                  </tr>
                ) : jobs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                      No payout jobs found.
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <tr
                      key={job.id}
                      className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-3 font-mono text-xs">
                        {job.id.slice(0, 8)}…
                      </td>
                      <td className="px-6 py-3 font-mono text-xs">
                        {job.vendor_id.slice(0, 8)}…
                      </td>
                      <td className="px-6 py-3 text-right font-medium">
                        KES {(job.amount_cents / 100).toLocaleString()}
                      </td>
                      <td className="px-6 py-3">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="px-6 py-3 text-gray-600">{job.attempts}</td>
                      <td className="px-6 py-3 text-red-600 text-xs max-w-[200px] truncate">
                        {job.last_error || "—"}
                      </td>
                      <td className="px-6 py-3 text-gray-500 text-xs">
                        {new Date(job.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* pagination */}
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              Previous
            </button>
            <span className="text-sm text-gray-500">Page {page + 1}</span>
            <button
              onClick={() => {
                if (jobs.length === limit) setPage((p) => p + 1);
              }}
              disabled={jobs.length < limit}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
