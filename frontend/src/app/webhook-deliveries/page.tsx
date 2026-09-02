"use client";

import { useState, useEffect } from "react";
import { api, WebhookDelivery } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import { usePlatform } from "@/lib/PlatformContext";
import { useToast } from "@/lib/ToastContext";

const STATUS_FILTERS = ["all", "completed", "failed", "dead_letter", "processing", "received"];

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function WebhookDeliveriesPage() {
  const { selectedPlatformId } = usePlatform();
  const { addToast } = useToast();
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("all");
  const [selectedDelivery, setSelectedDelivery] = useState<WebhookDelivery | null>(null);
  const [replaying, setReplaying] = useState(false);

  useEffect(() => {
    fetchDeliveries();
  }, [selectedPlatformId, activeFilter]);

  async function fetchDeliveries() {
    setLoading(true);
    try {
      const params: Parameters<typeof api.listWebhookDeliveries>[0] = {
        limit: 100,
      };
      if (selectedPlatformId) params.platform_id = selectedPlatformId;
      if (activeFilter !== "all") params.status = activeFilter;
      const data = await api.listWebhookDeliveries(params);
      setDeliveries(data);
    } catch (err) {
      addToast({
        variant: "error",
        title: "Failed to load deliveries",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleReplay(deliveryId: string) {
    setReplaying(true);
    try {
      const result = await api.replayWebhookDelivery(deliveryId);
      addToast({
        variant: "success",
        title: "Webhook replayed",
        message: `New delivery ${result.new_delivery_id.slice(0, 8)}… created`,
      });
      setSelectedDelivery(null);
      fetchDeliveries();
    } catch (err) {
      addToast({
        variant: "error",
        title: "Replay failed",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setReplaying(false);
    }
  }

  const counts = {
    all: deliveries.length,
    completed: deliveries.filter((d) => d.status === "completed").length,
    failed: deliveries.filter((d) => d.status === "failed").length,
    dead_letter: deliveries.filter((d) => d.status === "dead_letter").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-ink)] tracking-tight">Webhook Deliveries</h1>
          <p className="text-[13px] text-[var(--color-ink-muted)] mt-1">
            Track, inspect, and replay incoming webhook notifications
          </p>
        </div>
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={`px-3 py-1.5 text-[13px] font-medium rounded-full border transition-all duration-150 btn-press ${
              activeFilter === f
                ? "bg-[var(--color-primary-light)] text-[var(--color-primary)] ring-1 ring-[var(--color-primary)]"
                : "bg-[var(--color-surface)] text-[var(--color-ink-secondary)] border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]"
            }`}
          >
            {f === "all" ? "All" : f.replace("_", " ")}
            {counts[f as keyof typeof counts] !== undefined && (
              <span className="ml-1.5 text-[11px] opacity-60">{counts[f as keyof typeof counts]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-hidden">
          <table className="w-full">
            <tbody>
              {Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-[var(--color-border-subtle)]">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-[var(--color-canvas)] rounded animate-shimmer" style={{ width: `${60 + Math.random() * 40}%` }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : deliveries.length === 0 ? (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-12 text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-[var(--color-info-bg)] flex items-center justify-center mb-4 animate-float">
            <svg className="w-6 h-6 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <h3 className="text-[15px] font-semibold text-[var(--color-ink)]">No webhook deliveries yet</h3>
          <p className="text-[13px] text-[var(--color-ink-muted)] mt-1.5 max-w-sm mx-auto">
            Send a payment webhook to your gateway endpoint and deliveries will appear here.
          </p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border-subtle)] text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">External Ref</th>
                <th className="px-4 py-3 text-left">Platform</th>
                <th className="px-4 py-3 text-left">Attempts</th>
                <th className="px-4 py-3 text-left">Source IP</th>
                <th className="px-4 py-3 text-left">Received</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d, i) => (
                <tr
                  key={d.id}
                  onClick={() => setSelectedDelivery(d)}
                  className="border-b border-[var(--color-border-subtle)] last:border-0 cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors animate-card-enter"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <td className="px-4 py-3">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="px-4 py-3 text-[13px] font-mono text-[var(--color-ink)]">
                    {d.external_ref.length > 24 ? d.external_ref.slice(0, 24) + "…" : d.external_ref}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[var(--color-ink-secondary)]">
                    {d.platform_id.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[var(--color-ink-secondary)]">
                    {d.attempts}/{d.max_attempts}
                  </td>
                  <td className="px-4 py-3 text-[13px] font-mono text-[var(--color-ink-secondary)]">
                    {d.source_ip || "—"}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[var(--color-ink-muted)]">
                    {timeAgo(d.received_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {(d.status === "failed" || d.status === "dead_letter") && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleReplay(d.id); }}
                        disabled={replaying}
                        className="px-3 py-1 text-[12px] font-semibold rounded-md bg-[var(--color-primary-light)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white transition-all duration-150 btn-press"
                      >
                        Replay
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {selectedDelivery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] max-w-2xl w-full mx-4 border border-[var(--color-border)] animate-card-enter max-h-[85vh] flex flex-col">
            <div className="px-6 py-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-[15px] font-bold text-[var(--color-ink)]">Webhook Delivery Details</h2>
                <p className="text-[12px] text-[var(--color-ink-muted)] mt-0.5 font-mono">{selectedDelivery.id}</p>
              </div>
              <button
                onClick={() => setSelectedDelivery(null)}
                className="p-1.5 rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-ink-muted)] btn-press"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
              {/* Metadata */}
              <div className="grid grid-cols-2 gap-3">
                <div className="px-3 py-2 bg-[var(--color-canvas)] rounded-lg">
                  <p className="text-[10px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">Status</p>
                  <div className="mt-1"><StatusBadge status={selectedDelivery.status} /></div>
                </div>
                <div className="px-3 py-2 bg-[var(--color-canvas)] rounded-lg">
                  <p className="text-[10px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">Attempts</p>
                  <p className="mt-1 text-[13px] font-medium text-[var(--color-ink)]">{selectedDelivery.attempts} / {selectedDelivery.max_attempts}</p>
                </div>
                <div className="px-3 py-2 bg-[var(--color-canvas)] rounded-lg">
                  <p className="text-[10px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">Source IP</p>
                  <p className="mt-1 text-[13px] font-mono text-[var(--color-ink)]">{selectedDelivery.source_ip || "—"}</p>
                </div>
                <div className="px-3 py-2 bg-[var(--color-canvas)] rounded-lg">
                  <p className="text-[10px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">Received</p>
                  <p className="mt-1 text-[13px] text-[var(--color-ink)]">{timeAgo(selectedDelivery.received_at)}</p>
                </div>
                {selectedDelivery.error_message && (
                  <div className="col-span-2 px-3 py-2 bg-[var(--color-danger-bg)] rounded-lg">
                    <p className="text-[10px] font-semibold text-[var(--color-danger)] uppercase tracking-wider">Error</p>
                    <p className="mt-1 text-[13px] text-[var(--color-danger)]">{selectedDelivery.error_message}</p>
                  </div>
                )}
              </div>

              {/* Request Body */}
              <div>
                <h3 className="text-[12px] font-semibold text-[var(--color-ink-secondary)] uppercase tracking-wider mb-2">Request Body</h3>
                <pre className="px-4 py-3 bg-[var(--color-canvas)] rounded-lg text-[12px] font-mono text-[var(--color-ink)] overflow-x-auto border border-[var(--color-border-subtle)] max-h-48 overflow-y-auto">
                  {JSON.stringify(selectedDelivery.request_body, null, 2)}
                </pre>
              </div>

              {/* Response Body */}
              {selectedDelivery.response_body && (
                <div>
                  <h3 className="text-[12px] font-semibold text-[var(--color-ink-secondary)] uppercase tracking-wider mb-2">Response Body</h3>
                  <pre className="px-4 py-3 bg-[var(--color-canvas)] rounded-lg text-[12px] font-mono text-[var(--color-ink)] overflow-x-auto border border-[var(--color-border-subtle)] max-h-48 overflow-y-auto">
                    {JSON.stringify(selectedDelivery.response_body, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-[var(--color-border-subtle)] flex gap-3 shrink-0">
              <button
                onClick={() => setSelectedDelivery(null)}
                className="flex-1 px-4 py-2.5 text-[13px] font-semibold rounded-[var(--radius-md)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors btn-press"
              >
                Close
              </button>
              {(selectedDelivery.status === "failed" || selectedDelivery.status === "dead_letter") && (
                <button
                  onClick={() => handleReplay(selectedDelivery.id)}
                  disabled={replaying}
                  className="flex-1 px-4 py-2.5 text-[13px] font-semibold rounded-[var(--radius-md)] bg-gradient-to-r from-[var(--color-primary)] to-indigo-600 text-white hover:from-[var(--color-primary-hover)] hover:to-indigo-700 disabled:opacity-50 transition-all duration-200 shadow-sm btn-press"
                >
                  {replaying ? "Replaying…" : "Replay Webhook"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
