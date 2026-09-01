"use client";

import { useEffect, useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import { api, SplitRule, Vendor } from "@/lib/api";

export default function SplitRulesPage() {
  const [rules, setRules] = useState<SplitRule[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // form state
  const [showForm, setShowForm] = useState(false);
  const [formVendorId, setFormVendorId] = useState("");
  const [formRuleType, setFormRuleType] = useState<"percentage" | "fixed">("percentage");
  const [formValue, setFormValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Find a platform from recent transactions
      const txns = await api.listTransactions({ limit: 1 });
      if (txns.length > 0) {
        const pid = txns[0].platform_id;
        const [rulesData, vendorsData] = await Promise.all([
          api.listSplitRules(pid),
          api.listVendors(pid),
        ]);
        setRules(rulesData);
        setVendors(vendorsData);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load split rules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formVendorId) {
      setFormError("Select a vendor");
      return;
    }
    const numValue = Number(formValue);
    if (isNaN(numValue) || numValue <= 0) {
      setFormError("Enter a valid positive value");
      return;
    }
    if (formRuleType === "percentage" && numValue > 10000) {
      setFormError("Percentage cannot exceed 10000 basis points (100%)");
      return;
    }

    // find platform_id from first vendor
    const platformId = vendors[0]?.platform_id;
    if (!platformId) {
      setFormError("No platform available");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const rule = await api.createSplitRule(platformId, {
        vendor_id: formVendorId,
        rule_type: formRuleType,
        value: numValue,
      });
      setRules((prev) => [...prev, rule]);
      setShowForm(false);
      setFormVendorId("");
      setFormValue("");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to create rule");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivate(ruleId: string) {
    try {
      await api.deactivateSplitRule(ruleId);
      setRules((prev) => prev.map((r) => (r.id === ruleId ? { ...r, is_active: false } : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to deactivate rule");
    }
  }

  function getVendorName(vendorId: string): string {
    const v = vendors.find((v) => v.id === vendorId);
    return v?.name || vendorId.slice(0, 8) + "…";
  }

  function formatValue(rule: SplitRule): string {
    if (rule.rule_type === "percentage") {
      return `${(rule.value / 100).toFixed(1)}%`;
    }
    return `KES ${(rule.value / 100).toLocaleString()}`;
  }

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 lg:ml-0 pt-16 lg:pt-0">
        <div className="px-6 lg:px-10 py-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Split Rules</h1>
              <p className="text-sm text-gray-500 mt-1">
                Configure how incoming payments are divided across vendors.
              </p>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              New Rule
            </button>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="px-6 py-3 font-medium">Vendor</th>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium text-right">Value</th>
                  <th className="px-6 py-3 font-medium">Priority</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                      <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600 mb-2" />
                      <p>Loading split rules...</p>
                    </td>
                  </tr>
                ) : rules.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                      No split rules configured.
                    </td>
                  </tr>
                ) : (
                  rules.map((rule) => (
                    <tr
                      key={rule.id}
                      className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-3 font-medium">
                        {getVendorName(rule.vendor_id)}
                      </td>
                      <td className="px-6 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          {rule.rule_type}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right font-medium">
                        {formatValue(rule)}
                      </td>
                      <td className="px-6 py-3 text-gray-500">{rule.priority}</td>
                      <td className="px-6 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            rule.is_active
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {rule.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        {rule.is_active && (
                          <button
                            onClick={() => handleDeactivate(rule.id)}
                            className="text-xs text-red-600 hover:text-red-500 font-medium"
                          >
                            Deactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* new rule modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold">New Split Rule</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-gray-100">
                <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreate} className="px-6 py-4 space-y-4">
              {formError && (
                <div className="px-3 py-2 rounded bg-red-50 text-red-700 text-sm">{formError}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vendor *</label>
                <select
                  value={formVendorId}
                  onChange={(e) => setFormVendorId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                >
                  <option value="">Select a vendor</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rule Type *</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFormRuleType("percentage")}
                    className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      formRuleType === "percentage"
                        ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    Percentage
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormRuleType("fixed")}
                    className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      formRuleType === "fixed"
                        ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    Fixed (KES cents)
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {formRuleType === "percentage" ? "Value (basis points) *" : "Value (cents) *"}
                </label>
                <input
                  type="number"
                  value={formValue}
                  onChange={(e) => setFormValue(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder={formRuleType === "percentage" ? "e.g. 1500 = 15%" : "e.g. 50000 = KES 500"}
                  min="1"
                />
                <p className="mt-1 text-xs text-gray-500">
                  {formRuleType === "percentage"
                    ? "Enter in basis points. 100 = 1%, 1500 = 15%, 10000 = 100%"
                    : "Enter the fixed amount in cents. 50000 = KES 500"}
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {submitting ? "Creating..." : "Create Rule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
