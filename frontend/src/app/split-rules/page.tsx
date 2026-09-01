"use client";

import { useEffect, useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import { api, SplitRule, Vendor } from "@/lib/api";
import { usePlatform } from "@/lib/PlatformContext";

export default function SplitRulesPage() {
  const { selectedPlatformId, selectedPlatform } = usePlatform();
  const [rules, setRules] = useState<SplitRule[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formVendorId, setFormVendorId] = useState("");
  const [formRuleType, setFormRuleType] = useState<"percentage" | "fixed">("percentage");
  const [formValue, setFormValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!selectedPlatformId) {
      setRules([]); setVendors([]);
      setLoading(false);
      return;
    }
    setLoading(true); setError(null);
    try {
      const [r, v] = await Promise.all([
        api.listSplitRules(selectedPlatformId),
        api.listVendors(selectedPlatformId),
      ]);
      setRules(r); setVendors(v);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [selectedPlatformId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Reset form when platform changes
  useEffect(() => { setShowForm(false); }, [selectedPlatformId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formVendorId) { setFormError("Select a vendor"); return; }
    const numValue = Number(formValue);
    if (isNaN(numValue) || numValue <= 0) { setFormError("Enter a valid positive value"); return; }
    if (formRuleType === "percentage" && numValue > 10000) { setFormError("Percentage cannot exceed 100% (10000 basis points)"); return; }
    if (!selectedPlatformId) { setFormError("No platform selected"); return; }
    setSubmitting(true); setFormError(null);
    try {
      const rule = await api.createSplitRule(selectedPlatformId, { vendor_id: formVendorId, rule_type: formRuleType, value: numValue });
      setRules(prev => [...prev, rule]); setShowForm(false); setFormVendorId(""); setFormValue("");
    } catch (e) { setFormError(e instanceof Error ? e.message : "Failed to create"); }
    finally { setSubmitting(false); }
  }

  async function handleDeactivate(ruleId: string) {
    try { await api.deactivateSplitRule(ruleId); setRules(prev => prev.map(r => r.id === ruleId ? { ...r, is_active: false } : r)); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  }

  const getVendorName = (id: string) => vendors.find(v => v.id === id)?.name || id.slice(0, 8) + "…";
  const formatValue = (rule: SplitRule) => rule.rule_type === "percentage" ? `${(rule.value / 100).toFixed(1)}%` : `KES ${(rule.value / 100).toLocaleString()}`;

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 lg:ml-0 pt-16 lg:pt-0 overflow-y-auto">
        <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-[22px] font-bold tracking-tight text-[var(--color-ink)]">Split Rules</h1>
              <p className="text-[13px] text-[var(--color-ink-secondary)] mt-1">
                {selectedPlatform ? `Configure how payments are divided for ${selectedPlatform.name}` : "Select a platform to view split rules"}
              </p>
            </div>
            {selectedPlatformId && (
              <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-[var(--color-primary)] text-white text-[13px] font-semibold rounded-[var(--radius-md)] hover:bg-[var(--color-primary-hover)] transition-colors shadow-sm">
                + New Rule
              </button>
            )}
          </div>

          {!selectedPlatformId ? (
            <div className="bg-white rounded-[var(--radius-lg)] border border-[var(--color-border)] shadow-[var(--shadow-xs)] px-6 py-16 text-center">
              <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">Select a platform from the sidebar to configure its split rules.</p>
            </div>
          ) : (
            <>
              {error && <div className="mb-4 px-4 py-3 rounded-[var(--radius-md)] bg-[var(--color-danger-bg)] border border-red-200 text-[13px] text-[var(--color-danger)] font-medium">{error}</div>}

              <div className="bg-white rounded-[var(--radius-lg)] border border-[var(--color-border)] shadow-[var(--shadow-xs)] overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead><tr className="border-b border-[var(--color-border-subtle)] text-left">
                    <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)]">Vendor</th>
                    <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)]">Type</th>
                    <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)] text-right">Value</th>
                    <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)]">Priority</th>
                    <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)]">Status</th>
                    <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)]">Actions</th>
                  </tr></thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={6} className="px-6 py-16 text-center">
                        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-ink-faint)] border-t-[var(--color-primary)] mb-3" />
                        <p className="text-[13px] text-[var(--color-ink-muted)]">Loading…</p>
                      </td></tr>
                    ) : rules.length === 0 ? (
                      <tr><td colSpan={6} className="px-6 py-16 text-center text-[13px] text-[var(--color-ink-muted)]">No split rules configured.</td></tr>
                    ) : rules.map(rule => (
                      <tr key={rule.id} className="border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[var(--color-surface-hover)] transition-colors">
                        <td className="px-6 py-3.5 font-semibold text-[var(--color-ink)]">{getVendorName(rule.vendor_id)}</td>
                        <td className="px-6 py-3.5"><span className="px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-slate-100 text-slate-600">{rule.rule_type}</span></td>
                        <td className="px-6 py-3.5 text-right font-bold text-[var(--color-ink)] tabular-nums">{formatValue(rule)}</td>
                        <td className="px-6 py-3.5 text-[var(--color-ink-muted)] tabular-nums">{rule.priority}</td>
                        <td className="px-6 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold ${rule.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-500"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${rule.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
                            {rule.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-6 py-3.5">
                          {rule.is_active && <button onClick={() => handleDeactivate(rule.id)} className="text-[12px] font-semibold text-[var(--color-danger)] hover:text-red-700 transition-colors">Deactivate</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </main>

      {showForm && selectedPlatformId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] max-w-md w-full mx-4 border border-[var(--color-border)]">
            <div className="px-6 py-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between">
              <h2 className="text-[15px] font-bold text-[var(--color-ink)]">New Split Rule</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-ink-muted)]">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">
              {formError && <div className="px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-[13px] font-medium">{formError}</div>}
              <div>
                <label className="block text-[13px] font-semibold text-[var(--color-ink)] mb-1.5">Vendor *</label>
                <select value={formVendorId} onChange={e => setFormVendorId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-[var(--color-border)] rounded-[var(--radius-md)] text-[13px] focus:ring-2 focus:ring-[var(--color-primary-ring)] focus:border-[var(--color-primary)] outline-none transition-shadow bg-white">
                  <option value="">Select a vendor</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-[var(--color-ink)] mb-1.5">Rule Type *</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setFormRuleType("percentage")}
                    className={`flex-1 px-4 py-2.5 text-[13px] font-semibold rounded-[var(--radius-md)] border transition-all duration-150 ${formRuleType === "percentage" ? "bg-[var(--color-primary-light)] text-[var(--color-primary)] border-[var(--color-primary)]" : "bg-white text-[var(--color-ink-secondary)] border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]"}`}>
                    Percentage
                  </button>
                  <button type="button" onClick={() => setFormRuleType("fixed")}
                    className={`flex-1 px-4 py-2.5 text-[13px] font-semibold rounded-[var(--radius-md)] border transition-all duration-150 ${formRuleType === "fixed" ? "bg-[var(--color-primary-light)] text-[var(--color-primary)] border-[var(--color-primary)]" : "bg-white text-[var(--color-ink-secondary)] border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]"}`}>
                    Fixed (KES cents)
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-[var(--color-ink)] mb-1.5">
                  {formRuleType === "percentage" ? "Value (basis points) *" : "Value (cents) *"}
                </label>
                <input type="number" value={formValue} onChange={e => setFormValue(e.target.value)} min="1"
                  className="w-full px-3 py-2.5 border border-[var(--color-border)] rounded-[var(--radius-md)] text-[13px] focus:ring-2 focus:ring-[var(--color-primary-ring)] focus:border-[var(--color-primary)] outline-none transition-shadow tabular-nums"
                  placeholder={formRuleType === "percentage" ? "e.g. 1500 = 15%" : "e.g. 50000 = KES 500"} />
                <p className="mt-1 text-[11px] text-[var(--color-ink-muted)]">
                  {formRuleType === "percentage" ? "100 = 1%, 1500 = 15%, 10000 = 100%" : "50000 cents = KES 500"}
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-4 py-2.5 text-[13px] font-semibold rounded-[var(--radius-md)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2.5 text-[13px] font-semibold rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-colors">{submitting ? "Creating…" : "Create Rule"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
