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
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const loadTransactions = useCallback(async () => {
    setLoading(true); setError(null);
    try { setTransactions(await api.listTransactions({ limit, offset: page * limit })); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  const filtered = activeFilter === "all" ? transactions : transactions.filter(tx => tx.status === activeFilter);

  async function openDetail(tx: Transaction) {
    setSelectedTx(tx); setLedgerLoading(true);
    try { setLedger(await api.getTransactionLedger(tx.id)); }
    catch { setLedger(null); }
    finally { setLedgerLoading(false); }
  }

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 lg:ml-0 pt-16 lg:pt-0 overflow-y-auto">
        <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto">
          <div className="mb-6">
            <h1 className="text-[22px] font-bold tracking-tight text-[var(--color-ink)]">Transactions</h1>
            <p className="text-[13px] text-[var(--color-ink-secondary)] mt-1">All incoming payments and their processing status.</p>
          </div>

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
              <thead>
                <tr className="border-b border-[var(--color-border-subtle)] text-left">
                  <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)]">Transaction ID</th>
                  <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)]">External Ref</th>
                  <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)] text-right">Amount</th>
                  <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)]">Status</th>
                  <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)]">Received</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="px-6 py-16 text-center">
                    <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-ink-faint)] border-t-[var(--color-primary)] mb-3" />
                    <p className="text-[13px] text-[var(--color-ink-muted)]">Loading…</p>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-16 text-center text-[13px] text-[var(--color-ink-muted)]">No transactions found.</td></tr>
                ) : filtered.map(tx => (
                  <tr key={tx.id} onClick={() => openDetail(tx)} className="border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer">
                    <td className="px-6 py-3.5 font-mono text-[12px] text-[var(--color-ink-secondary)] tabular-nums">{tx.id.slice(0, 8)}…</td>
                    <td className="px-6 py-3.5">{tx.external_ref}</td>
                    <td className="px-6 py-3.5 text-right font-semibold text-[var(--color-ink)] tabular-nums">{tx.currency} {(tx.amount_cents / 100).toLocaleString()}</td>
                    <td className="px-6 py-3.5"><StatusBadge status={tx.status} /></td>
                    <td className="px-6 py-3.5 text-[var(--color-ink-muted)]">{new Date(tx.received_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="px-4 py-2 text-[13px] font-medium rounded-[var(--radius-md)] border border-[var(--color-border)] disabled:opacity-40 hover:bg-[var(--color-surface-hover)] transition-colors bg-white">Previous</button>
            <span className="text-[13px] text-[var(--color-ink-muted)]">Page {page + 1}</span>
            <button onClick={() => { if (transactions.length === limit) setPage(p => p + 1); }} disabled={transactions.length < limit}
              className="px-4 py-2 text-[13px] font-medium rounded-[var(--radius-md)] border border-[var(--color-border)] disabled:opacity-40 hover:bg-[var(--color-surface-hover)] transition-colors bg-white">Next</button>
          </div>
        </div>
      </main>

      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto border border-[var(--color-border)]">
            <div className="px-6 py-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between sticky top-0 bg-white z-10 rounded-t-[var(--radius-xl)]">
              <h2 className="text-[15px] font-bold text-[var(--color-ink)]">Transaction Detail</h2>
              <button onClick={() => { setSelectedTx(null); setLedger(null); }} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-ink-muted)]">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div className="grid grid-cols-2 gap-4 text-[13px]">
                <div><span className="text-[var(--color-ink-muted)] font-medium">ID</span><p className="font-mono text-[12px] mt-1 text-[var(--color-ink)] tabular-nums">{selectedTx.id}</p></div>
                <div><span className="text-[var(--color-ink-muted)] font-medium">External Ref</span><p className="mt-1 text-[var(--color-ink)]">{selectedTx.external_ref}</p></div>
                <div><span className="text-[var(--color-ink-muted)] font-medium">Amount</span><p className="mt-1 font-bold text-[var(--color-ink)] tabular-nums">{selectedTx.currency} {(selectedTx.amount_cents / 100).toLocaleString()}</p></div>
                <div><span className="text-[var(--color-ink-muted)] font-medium">Status</span><div className="mt-1"><StatusBadge status={selectedTx.status} /></div></div>
                <div><span className="text-[var(--color-ink-muted)] font-medium">Received</span><p className="mt-1">{new Date(selectedTx.received_at).toLocaleString()}</p></div>
                {selectedTx.processed_at && <div><span className="text-[var(--color-ink-muted)] font-medium">Processed</span><p className="mt-1">{new Date(selectedTx.processed_at).toLocaleString()}</p></div>}
              </div>

              <div className="pt-4 border-t border-[var(--color-border-subtle)]">
                <h3 className="text-[13px] font-bold text-[var(--color-ink)] mb-3">Ledger Entries</h3>
                {ledgerLoading ? <p className="text-[13px] text-[var(--color-ink-muted)]">Loading…</p> : ledger ? (
                  <>
                    <div className="flex items-center gap-4 mb-3 text-[12px]">
                      <span className={`px-2.5 py-0.5 rounded-full font-semibold ${ledger.summary.balanced ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                        {ledger.summary.balanced ? "Balanced ✓" : "Imbalanced ✗"}
                      </span>
                      <span className="text-[var(--color-ink-muted)] tabular-nums">Debits: KES {(ledger.summary.total_debits / 100).toLocaleString()}</span>
                      <span className="text-[var(--color-ink-muted)] tabular-nums">Credits: KES {(ledger.summary.total_credits / 100).toLocaleString()}</span>
                    </div>
                    <table className="w-full text-[12px]">
                      <thead><tr className="text-[var(--color-ink-muted)] border-b border-[var(--color-border-subtle)]">
                        <th className="text-left py-2 font-semibold">Account</th><th className="text-left py-2 font-semibold">Type</th><th className="text-right py-2 font-semibold">Amount</th><th className="text-left py-2 font-semibold">Description</th>
                      </tr></thead>
                      <tbody>{ledger.entries.map(entry => (
                        <tr key={entry.id} className="border-b border-[var(--color-border-subtle)]">
                          <td className="py-2 font-mono">{entry.account_name}</td>
                          <td className="py-2"><span className={entry.entry_type === "debit" ? "text-red-600 font-semibold" : "text-emerald-600 font-semibold"}>{entry.entry_type.toUpperCase()}</span></td>
                          <td className="py-2 text-right font-semibold tabular-nums">KES {(entry.amount_cents / 100).toLocaleString()}</td>
                          <td className="py-2 text-[var(--color-ink-muted)]">{entry.description || "—"}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </>
                ) : <p className="text-[13px] text-[var(--color-ink-muted)]">No ledger data.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
