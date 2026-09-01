"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import StatCard from "@/components/StatCard";
import StatusBadge from "@/components/StatusBadge";
import { api, Transaction } from "@/lib/api";

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<"ok" | "degraded" | "error">("error");

  useEffect(() => {
    async function load() {
      try {
        const [txns, health] = await Promise.allSettled([
          api.listTransactions({ limit: 10 }),
          api.ready(),
        ]);

        if (txns.status === "fulfilled") setTransactions(txns.value);
        if (health.status === "fulfilled") {
          setServerStatus(health.value.status === "ok" ? "ok" : "degraded");
        }

        if (txns.status === "rejected") {
          setError(txns.reason?.message || "Failed to load transactions");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalVolume = transactions.reduce((sum, tx) => sum + tx.amount_cents, 0);
  const pendingPayouts = transactions.filter(
    (tx) => tx.status === "received" || tx.status === "split_computed"
  ).length;

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 lg:ml-0 pt-16 lg:pt-0">
        <div className="px-6 lg:px-10 py-8">
          {/* header */}
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
              <p className="text-sm text-gray-500 mt-1">
                Overview of your payment routing activity.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full ${
                  serverStatus === "ok"
                    ? "bg-green-500"
                    : serverStatus === "degraded"
                    ? "bg-yellow-500"
                    : "bg-red-500"
                }`}
              />
              <span className="text-xs text-gray-500">
                {serverStatus === "ok"
                  ? "All systems operational"
                  : serverStatus === "degraded"
                  ? "Partially degraded"
                  : "Checking..."}
              </span>
            </div>
          </div>

          {error && (
            <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Total Transactions"
              value={loading ? "—" : transactions.length}
              change={loading ? "Loading..." : "Last 10 incoming"}
            />
            <StatCard
              label="Volume (KES)"
              value={loading ? "—" : `KES ${(totalVolume / 100).toLocaleString()}`}
              change={loading ? "Loading..." : "Combined value"}
            />
            <StatCard
              label="Server Status"
              value={serverStatus === "ok" ? "Healthy" : serverStatus === "degraded" ? "Degraded" : "—"}
              change={
                serverStatus === "ok"
                  ? "DB and Redis connected"
                  : "Checking dependencies"
              }
            />
            <StatCard
              label="Needs Attention"
              value={pendingPayouts}
              change={
                pendingPayouts === 0
                  ? "All caught up"
                  : "Transactions awaiting payout"
              }
            />
          </div>

          {/* recent transactions */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Recent Transactions</h2>
              <a
                href="/transactions"
                className="text-sm text-indigo-600 hover:text-indigo-500 font-medium"
              >
                View all
              </a>
            </div>

            {loading ? (
              <div className="px-6 py-12 text-center text-gray-400 text-sm">
                <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600 mb-2" />
                <p>Loading transactions...</p>
              </div>
            ) : transactions.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-400 text-sm">
                <p>No transactions yet.</p>
                <p className="mt-1">
                  Once a payment webhook is received, it will appear here.
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-gray-500">
                    <th className="px-6 py-3 font-medium">Ref</th>
                    <th className="px-6 py-3 font-medium text-right">Amount</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr
                      key={tx.id}
                      className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-3 font-mono text-xs">
                        {tx.external_ref}
                      </td>
                      <td className="px-6 py-3 text-right font-medium">
                        {tx.currency}{" "}
                        {(tx.amount_cents / 100).toLocaleString()}
                      </td>
                      <td className="px-6 py-3">
                        <StatusBadge status={tx.status} />
                      </td>
                      <td className="px-6 py-3 text-gray-500">
                        {new Date(tx.received_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
