"use client";

import { useEffect, useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import StatusBadge from "@/components/StatusBadge";
import { api, Transaction, LedgerResponse } from "@/lib/api";

const STATUS_FILTERS = ["all", "received", "split_computed", "paid_out", "failed"];

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [page, setPage] = useState(0);
  const limit = 20;

  // detail modal
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listTransactions({ limit, offset: page * limit });
      setTransactions(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const filtered =
    activeFilter === "all"
      ? transactions
      : transactions.filter((tx) => tx.status === activeFilter);

  async function openDetail(tx: Transaction) {
    setSelectedTx(tx);
    setLedgerLoading(true);
    try {
      const data = await api.getTransactionLedger(tx.id);
      setLedger(data);
    } catch {
      setLedger(null);
    } finally {
      setLedgerLoading(false);
    }
  }

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 lg:ml-0 pt-16 lg:pt-0">
        <div className="px-6 lg:px-10 py-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
            <p className="text-sm text-gray-500 mt-1">
              All incoming payments and their processing status.
            </p>
          </div>

          {/* filters */}
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
                    ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
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
                  <th className="px-6 py-3 font-medium">Transaction ID</th>
                  <th className="px-6 py-3 font-medium">External Ref</th>
                  <th className="px-6 py-3 font-medium text-right">Amount</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Received</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                      <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600 mb-2" />
                      <p>Loading transactions...</p>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                      No transactions found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((tx) => (
                    <tr
                      key={tx.id}
                      onClick={() => openDetail(tx)}
                      className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-3 font-mono text-xs">
                        {tx.id.slice(0, 8)}…
                      </td>
                      <td className="px-6 py-3">{tx.external_ref}</td>
                      <td className="px-6 py-3 text-right font-medium">
                        {tx.currency} {(tx.amount_cents / 100).toLocaleString()}
                      </td>
                      <td className="px-6 py-3">
                        <StatusBadge status={tx.status} />
                      </td>
                      <td className="px-6 py-3 text-gray-500">
                        {new Date(tx.received_at).toLocaleString()}
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
                if (transactions.length === limit) setPage((p) => p + 1);
              }}
              disabled={transactions.length < limit}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </main>

      {/* detail modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Transaction Detail</h2>
              <button
                onClick={() => {
                  setSelectedTx(null);
                  setLedger(null);
                }}
                className="p-1 rounded hover:bg-gray-100"
              >
                <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">ID</span>
                  <p className="font-mono text-xs mt-1">{selectedTx.id}</p>
                </div>
                <div>
                  <span className="text-gray-500">External Ref</span>
                  <p className="mt-1">{selectedTx.external_ref}</p>
                </div>
                <div>
                  <span className="text-gray-500">Amount</span>
                  <p className="mt-1 font-medium">
                    {selectedTx.currency} {(selectedTx.amount_cents / 100).toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Status</span>
                  <div className="mt-1"><StatusBadge status={selectedTx.status} /></div>
                </div>
                <div>
                  <span className="text-gray-500">Received</span>
                  <p className="mt-1">{new Date(selectedTx.received_at).toLocaleString()}</p>
                </div>
                {selectedTx.processed_at && (
                  <div>
                    <span className="text-gray-500">Processed</span>
                    <p className="mt-1">{new Date(selectedTx.processed_at).toLocaleString()}</p>
                  </div>
                )}
              </div>

              {/* ledger entries */}
              <div className="pt-4 border-t border-gray-100">
                <h3 className="text-sm font-semibold mb-3">Ledger Entries</h3>
                {ledgerLoading ? (
                  <p className="text-sm text-gray-400">Loading ledger...</p>
                ) : ledger ? (
                  <>
                    <div className="flex items-center gap-4 mb-3 text-xs">
                      <span className={`px-2 py-0.5 rounded ${ledger.summary.balanced ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {ledger.summary.balanced ? "Balanced ✓" : "Imbalanced ✗"}
                      </span>
                      <span className="text-gray-500">
                        Debits: KES {(ledger.summary.total_debits / 100).toLocaleString()}
                      </span>
                      <span className="text-gray-500">
                        Credits: KES {(ledger.summary.total_credits / 100).toLocaleString()}
                      </span>
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500 border-b border-gray-100">
                          <th className="text-left py-2 font-medium">Account</th>
                          <th className="text-left py-2 font-medium">Type</th>
                          <th className="text-right py-2 font-medium">Amount</th>
                          <th className="text-left py-2 font-medium">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledger.entries.map((entry) => (
                          <tr key={entry.id} className="border-b border-gray-50">
                            <td className="py-2 font-mono">{entry.account_name}</td>
                            <td className="py-2">
                              <span className={entry.entry_type === "debit" ? "text-red-600" : "text-green-600"}>
                                {entry.entry_type.toUpperCase()}
                              </span>
                            </td>
                            <td className="py-2 text-right font-medium">
                              KES {(entry.amount_cents / 100).toLocaleString()}
                            </td>
                            <td className="py-2 text-gray-500">{entry.description || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <p className="text-sm text-gray-400">No ledger data available.</p>
                )}
              </div>

              {/* raw payload */}
              {selectedTx.raw_payload && (
                <div className="pt-4 border-t border-gray-100">
                  <h3 className="text-sm font-semibold mb-2">Raw Payload</h3>
                  <pre className="bg-gray-50 rounded-lg p-4 text-xs overflow-x-auto">
                    {JSON.stringify(JSON.parse(selectedTx.raw_payload), null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
