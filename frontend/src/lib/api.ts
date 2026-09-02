/**
 * Typed API client for the Conduit backend.
 *
 * Supports JWT auth via a token stored in localStorage.
 * Provides a reusable `useApi` hook for data fetching with loading/error states.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("conduit_token");
}

export function setToken(token: string) {
  localStorage.setItem("conduit_token", token);
}

export function clearToken() {
  localStorage.removeItem("conduit_token");
}

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options?.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
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
  webhook_secret?: string;
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

export interface WebhookDelivery {
  id: string;
  platform_id: string;
  transaction_id: string | null;
  external_ref: string;
  status: string;
  request_body: Record<string, unknown>;
  response_body: Record<string, unknown> | null;
  status_code: number | null;
  error_message: string | null;
  attempts: number;
  max_attempts: number;
  next_retry_at: string | null;
  source_ip: string | null;
  received_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface LedgerResponse {
  transaction_id: string;
  entries: LedgerEntry[];
  summary: {
    total_debits: number;
    total_credits: number;
    balanced: boolean;
  };
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export interface AdminPublic {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

export interface AuthResponse {
  token: string;
  admin: AdminPublic;
}

export const api = {
  // health
  health: () => request<{ status: string }>("/health"),
  ready: () =>
    request<{ status: string; postgres: boolean; redis: boolean }>(
      "/health/ready"
    ),

  // auth
  signup: (data: { email: string; name: string; password: string }) =>
    request<AuthResponse>("/api/v1/auth/signup", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  login: (data: { email: string; password: string }) =>
    request<AuthResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  me: () => request<AdminPublic>("/api/v1/auth/me"),

  // platforms
  listPlatforms: () => request<Platform[]>("/api/v1/platforms"),
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
  deletePlatform: (id: string) =>
    request<{ status: string }>(`/api/v1/platforms/${id}`, {
      method: "DELETE",
    }),

  // vendors
  createVendor: (
    platformId: string,
    data: {
      name: string;
      phone_number?: string;
      bank_account?: string;
      email?: string;
    }
  ) =>
    request<Vendor>(`/api/v1/platforms/${platformId}/vendors`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  listVendors: (platformId: string, params?: { limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return request<Vendor[]>(
      `/api/v1/platforms/${platformId}/vendors${query ? `?${query}` : ""}`
    );
  },
  updateVendor: (vendorId: string, data: Partial<Vendor>) =>
    request<Vendor>(`/api/v1/vendors/${vendorId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteVendor: (vendorId: string) =>
    request<{ status: string }>(`/api/v1/vendors/${vendorId}`, {
      method: "DELETE",
    }),

  // split rules
  createSplitRule: (
    platformId: string,
    data: {
      vendor_id: string;
      rule_type: "percentage" | "fixed";
      value: number;
      priority?: number;
    }
  ) =>
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

  // stats
  getPlatformStats: (platformId: string) =>
    request<{ platform_id: string; days: { date: string; count: number; volume_cents: number }[] }>(
      `/api/v1/platforms/${platformId}/stats`
    ),

  // transactions
  listTransactions: (params?: {
    platform_id?: string;
    limit?: number;
    offset?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.platform_id) qs.set("platform_id", params.platform_id);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return request<Transaction[]>(
      `/api/v1/transactions${query ? `?${query}` : ""}`
    );
  },
  getTransaction: (id: string) =>
    request<Transaction>(`/api/v1/transactions/${id}`),
  getTransactionLedger: (id: string) =>
    request<LedgerResponse>(`/api/v1/transactions/${id}/ledger`),

  // payout jobs
  listPayoutJobs: (params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return request<PayoutJob[]>(
      `/api/v1/payout-jobs${query ? `?${query}` : ""}`
    );
  },
  getPayoutJob: (id: string) =>
    request<PayoutJob>(`/api/v1/payout-jobs/${id}`),

  // webhook deliveries
  listWebhookDeliveries: (params?: {
    platform_id?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.platform_id) qs.set("platform_id", params.platform_id);
    if (params?.status) qs.set("status", params.status);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return request<WebhookDelivery[]>(
      `/api/v1/webhook-deliveries${query ? `?${query}` : ""}`
    );
  },
  getWebhookDelivery: (id: string) =>
    request<WebhookDelivery>(`/api/v1/webhook-deliveries/${id}`),
  replayWebhookDelivery: (id: string) =>
    request<{ status: string; new_delivery_id: string }>(
      `/api/v1/webhook-deliveries/${id}/replay`,
      { method: "POST" }
    ),
};
