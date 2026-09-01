/**
 * Thin API client for the Conduit backend.
 *
 * Nothing fancy — just typed fetch wrappers. In a real app you'd
 * probably use something like ky or ofetch, but for now plain
 * fetch keeps dependencies minimal.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(
      body?.error || `API error: ${res.status} ${res.statusText}`
    );
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Platform {
  id: string;
  name: string;
  webhook_secret: string;
  created_at: string;
  updated_at: string;
}

export interface Vendor {
  id: string;
  platform_id: string;
  name: string;
  phone_number: string | null;
  bank_account: string | null;
  email: string | null;
  created_at: string;
}

export interface SplitRule {
  id: string;
  platform_id: string;
  vendor_id: string;
  rule_type: "percentage" | "fixed";
  value: number;
  priority: number;
  is_active: boolean;
}

export interface Transaction {
  id: string;
  platform_id: string;
  external_ref: string;
  amount_cents: number;
  currency: string;
  status: string;
  raw_payload: string | null;
  received_at: string;
  processed_at: string | null;
}

export interface LedgerEntry {
  id: string;
  transaction_id: string;
  account_name: string;
  entry_type: "debit" | "credit";
  amount_cents: number;
  description: string | null;
  created_at: string;
}

export interface PayoutJob {
  id: string;
  transaction_id: string;
  vendor_id: string;
  amount_cents: number;
  status: string;
  attempts: number;
  next_retry_at: string | null;
  last_error: string | null;
  dispatched_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export const api = {
  // health
  health: () => request<{ status: string }>("/health"),
  ready: () => request<{ status: string; postgres: boolean; redis: boolean }>("/health/ready"),

  // platforms
  createPlatform: (data: { name: string }) =>
    request<Platform>("/api/v1/platforms", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getPlatform: (id: string) =>
    request<Platform>(`/api/v1/platforms/${id}`),
  updatePlatform: (id: string, data: Partial<Platform>) =>
    request<Platform>(`/api/v1/platforms/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // vendors
  createVendor: (platformId: string, data: { name: string; phone_number?: string; bank_account?: string; email?: string }) =>
    request<Vendor>(`/api/v1/platforms/${platformId}/vendors`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  listVendors: (platformId: string) =>
    request<Vendor[]>(`/api/v1/platforms/${platformId}/vendors`),
  updateVendor: (vendorId: string, data: Partial<Vendor>) =>
    request<Vendor>(`/api/v1/vendors/${vendorId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // split rules
  createSplitRule: (platformId: string, data: {
    vendor_id: string;
    rule_type: "percentage" | "fixed";
    value: number;
    priority?: number;
  }) =>
    request<SplitRule>(`/api/v1/platforms/${platformId}/split-rules`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  listSplitRules: (platformId: string) =>
    request<SplitRule[]>(`/api/v1/platforms/${platformId}/split-rules`),
  updateSplitRule: (ruleId: string, data: Partial<SplitRule>) =>
    request<SplitRule>(`/api/v1/split-rules/${ruleId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deactivateSplitRule: (ruleId: string) =>
    request<{ status: string }>(`/api/v1/split-rules/${ruleId}`, {
      method: "DELETE",
    }),

  // transactions
  listTransactions: (params?: { platform_id?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.platform_id) qs.set("platform_id", params.platform_id);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return request<Transaction[]>(`/api/v1/transactions${query ? `?${query}` : ""}`);
  },
  getTransaction: (id: string) =>
    request<Transaction>(`/api/v1/transactions/${id}`),
  getTransactionLedger: (id: string) =>
    request<{ transaction_id: string; entries: LedgerEntry[]; summary: { total_debits: number; total_credits: number; balanced: boolean } }>(
      `/api/v1/transactions/${id}/ledger`
    ),

  // payout jobs
  listPayoutJobs: (params?: { status?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return request<PayoutJob[]>(`/api/v1/payout-jobs${query ? `?${query}` : ""}`);
  },
  getPayoutJob: (id: string) =>
    request<PayoutJob>(`/api/v1/payout-jobs/${id}`),
};
