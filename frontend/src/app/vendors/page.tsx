"use client";

import { useEffect, useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import { api, Vendor } from "@/lib/api";
import { usePlatform } from "@/lib/PlatformContext";

export default function VendorsPage() {
  const { selectedPlatformId, selectedPlatform } = usePlatform();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formBank, setFormBank] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadVendors = useCallback(async () => {
    if (!selectedPlatformId) {
      setVendors([]);
      setLoading(false);
      return;
    }
    setLoading(true); setError(null);
    try {
      setVendors(await api.listVendors(selectedPlatformId));
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [selectedPlatformId]);

  useEffect(() => { loadVendors(); }, [loadVendors]);

  // Reset form when platform changes
  useEffect(() => { setShowForm(false); }, [selectedPlatformId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) { setFormError("Name is required"); return; }
    if (!selectedPlatformId) { setFormError("No platform selected"); return; }
    setSubmitting(true); setFormError(null);
    try {
      const vendor = await api.createVendor(selectedPlatformId, {
        name: formName.trim(),
        phone_number: formPhone.trim() || undefined,
        email: formEmail.trim() || undefined,
        bank_account: formBank.trim() || undefined,
      });
      setVendors(prev => [...prev, vendor]);
      setShowForm(false); setFormName(""); setFormPhone(""); setFormEmail(""); setFormBank("");
    } catch (e) { setFormError(e instanceof Error ? e.message : "Failed to create"); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 lg:ml-0 pt-16 lg:pt-0 overflow-y-auto">
        <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-[22px] font-bold tracking-tight text-[var(--color-ink)]">Vendors</h1>
              <p className="text-[13px] text-[var(--color-ink-secondary)] mt-1">
                {selectedPlatform ? `Manage vendors for ${selectedPlatform.name}` : "Select a platform to view vendors"}
              </p>
            </div>
            {selectedPlatformId && (
              <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-[var(--color-primary)] text-white text-[13px] font-semibold rounded-[var(--radius-md)] hover:bg-[var(--color-primary-hover)] transition-colors shadow-sm">
                + Add Vendor
              </button>
            )}
          </div>

          {!selectedPlatformId ? (
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] shadow-[var(--shadow-xs)] px-6 py-16 text-center">
              <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">Select a platform from the sidebar to manage its vendors.</p>
            </div>
          ) : (
            <>
              {error && <div className="mb-4 px-4 py-3 rounded-[var(--radius-md)] bg-[var(--color-danger-bg)] border border-red-200 text-[13px] text-[var(--color-danger)] font-medium">{error}</div>}

              <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] shadow-[var(--shadow-xs)] overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead><tr className="border-b border-[var(--color-border-subtle)] text-left">
                    <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)]">Name</th>
                    <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)]">Phone</th>
                    <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)]">Email</th>
                    <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)]">Bank Account</th>
                    <th className="px-6 py-3 font-semibold text-[var(--color-ink-muted)]">Created</th>
                  </tr></thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={5} className="px-6 py-16 text-center">
                        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-ink-faint)] border-t-[var(--color-primary)] mb-3" />
                        <p className="text-[13px] text-[var(--color-ink-muted)]">Loading…</p>
                      </td></tr>
                    ) : vendors.length === 0 ? (
                      <tr><td colSpan={5} className="px-6 py-16 text-center text-[13px] text-[var(--color-ink-muted)]">No vendors registered yet.</td></tr>
                    ) : vendors.map(v => (
                      <tr key={v.id} className="border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[var(--color-surface-hover)] transition-colors">
                        <td className="px-6 py-3.5 font-semibold text-[var(--color-ink)]">{v.name}</td>
                        <td className="px-6 py-3.5 text-[var(--color-ink-secondary)] tabular-nums">{v.phone_number || "—"}</td>
                        <td className="px-6 py-3.5 text-[var(--color-ink-secondary)]">{v.email || "—"}</td>
                        <td className="px-6 py-3.5 text-[var(--color-ink-secondary)] font-mono text-[12px]">{v.bank_account || "—"}</td>
                        <td className="px-6 py-3.5 text-[var(--color-ink-muted)] text-[12px]">{new Date(v.created_at).toLocaleDateString()}</td>
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
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] max-w-md w-full mx-4 border border-[var(--color-border)]">
            <div className="px-6 py-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between">
              <h2 className="text-[15px] font-bold text-[var(--color-ink)]">Add Vendor</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-ink-muted)]">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">
              {formError && <div className="px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-[13px] font-medium">{formError}</div>}
              <div>
                <label className="block text-[13px] font-semibold text-[var(--color-ink)] mb-1.5">Name *</label>
                <input type="text" value={formName} onChange={e => setFormName(e.target.value)}
                  className="w-full px-3 py-2.5 border border-[var(--color-border)] rounded-[var(--radius-md)] text-[13px] focus:ring-2 focus:ring-[var(--color-primary-ring)] focus:border-[var(--color-primary)] outline-none transition-shadow"
                  placeholder="e.g. John Muthoni" />
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-[var(--color-ink)] mb-1.5">Phone</label>
                <input type="text" value={formPhone} onChange={e => setFormPhone(e.target.value)}
                  className="w-full px-3 py-2.5 border border-[var(--color-border)] rounded-[var(--radius-md)] text-[13px] focus:ring-2 focus:ring-[var(--color-primary-ring)] focus:border-[var(--color-primary)] outline-none transition-shadow"
                  placeholder="+254712345678" />
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-[var(--color-ink)] mb-1.5">Email</label>
                <input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)}
                  className="w-full px-3 py-2.5 border border-[var(--color-border)] rounded-[var(--radius-md)] text-[13px] focus:ring-2 focus:ring-[var(--color-primary-ring)] focus:border-[var(--color-primary)] outline-none transition-shadow"
                  placeholder="john@example.com" />
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-[var(--color-ink)] mb-1.5">Bank Account</label>
                <input type="text" value={formBank} onChange={e => setFormBank(e.target.value)}
                  className="w-full px-3 py-2.5 border border-[var(--color-border)] rounded-[var(--radius-md)] text-[13px] focus:ring-2 focus:ring-[var(--color-primary-ring)] focus:border-[var(--color-primary)] outline-none transition-shadow"
                  placeholder="Account number" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-4 py-2.5 text-[13px] font-semibold rounded-[var(--radius-md)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2.5 text-[13px] font-semibold rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-colors">{submitting ? "Creating…" : "Create Vendor"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
