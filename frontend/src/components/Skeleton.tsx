"use client";

import { ReactNode } from "react";

/* ---------------------------------------------------------------------------
   Skeleton — shimmer placeholders that match the final layout shape.
   
   Each exported component renders the exact same dimensions and spacing
   as the real content it replaces, so there's zero layout shift when
   data arrives. The shimmer animation sweeps left-to-right to signal
   "something is loading" without being distracting.
   --------------------------------------------------------------------------- */

/** Generic shimmer bar — used for text lines, table cells, badges */
export function SkeletonBar({ className = "", width }: { className?: string; width?: string }) {
  return (
    <div
      className={`skeleton h-3.5 ${className}`}
      style={width ? { width } : undefined}
    />
  );
}

/** Stat card skeleton — matches StatCard layout exactly */
export function StatCardSkeleton({ accent }: { accent?: boolean }) {
  return (
    <div className={`rounded-[var(--radius-lg)] border p-5 ${
      accent
        ? "bg-gradient-to-br from-[var(--color-primary)]/20 via-indigo-500/10 to-violet-600/10 border-[var(--color-primary)]/20"
        : "bg-[var(--color-surface)] border-[var(--color-border)]"
    }`}>
      <div className="flex items-center justify-between mb-3">
        <SkeletonBar className={accent ? "bg-white/20" : ""} width="80px" />
        <div className={`w-8 h-8 rounded-lg ${accent ? "bg-white/10" : "bg-[var(--color-border-subtle)]"}`} />
      </div>
      <SkeletonBar className={`h-7 rounded-md mb-2 ${accent ? "bg-white/25" : ""}`} width="120px" />
      <div className="flex items-center justify-between">
        <SkeletonBar className={accent ? "bg-white/15" : ""} width="100px" />
        <div className={`w-20 h-6 rounded ${accent ? "bg-white/10" : "bg-[var(--color-border-subtle)]"}`} />
      </div>
    </div>
  );
}

/** Table row skeleton — N rows of cells matching the real table layout */
export function TableRowSkeleton({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr
          key={i}
          className="border-b border-[var(--color-border-subtle)] last:border-0"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          {Array.from({ length: columns }).map((_, j) => (
            <td key={j} className="px-6 py-3.5">
              <SkeletonBar
                className={`${j === columns - 1 ? "ml-auto" : ""}`}
                width={
                  j === 0 ? "100px" :
                  j === columns - 1 ? "80px" :
                  "60px"
                }
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Full table skeleton with header */
export function TableSkeleton({ columns, columnNames, rows = 5 }: { columns: number; columnNames: string[]; rows?: number }) {
  return (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] shadow-[var(--shadow-xs)] overflow-hidden">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-[var(--color-border-subtle)] text-left">
            {columnNames.map((name, i) => (
              <th key={i} className={`px-6 py-3 font-semibold text-[var(--color-ink-muted)] text-[11px] uppercase tracking-wider ${i === columnNames.length - 1 ? "text-right" : ""}`}>
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <TableRowSkeleton columns={columns} rows={rows} />
        </tbody>
      </table>
    </div>
  );
}

/** Summary stat cards skeleton — for payout jobs page */
export function SummaryCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="px-4 py-3 bg-[var(--color-surface)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
          <SkeletonBar className="h-2.5 mb-2" width="60px" />
          <SkeletonBar className="h-6 rounded-md" width="48px" />
        </div>
      ))}
    </div>
  );
}

/** Dashboard transactions skeleton — matches the real table */
export function DashboardTableSkeleton() {
  return (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] shadow-[var(--shadow-xs)] animate-card-enter">
      <div className="px-6 py-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between">
        <div>
          <SkeletonBar className="h-4 mb-1.5" width="120px" />
          <SkeletonBar className="h-3" width="180px" />
        </div>
        <SkeletonBar className="h-3" width="70px" />
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-[var(--color-border-subtle)] text-left">
            <th className="px-6 py-3 font-semibold text-[11px] uppercase tracking-wider text-[var(--color-ink-muted)]">Reference</th>
            <th className="px-6 py-3 font-semibold text-[11px] uppercase tracking-wider text-[var(--color-ink-muted)] text-right">Amount</th>
            <th className="px-6 py-3 font-semibold text-[11px] uppercase tracking-wider text-[var(--color-ink-muted)]">Status</th>
            <th className="px-6 py-3 font-semibold text-[11px] uppercase tracking-wider text-[var(--color-ink-muted)]">When</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className="border-b border-[var(--color-border-subtle)] last:border-0" style={{ animationDelay: `${i * 60}ms` }}>
              <td className="px-6 py-3.5">
                <div className="inline-flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-ink-faint)]" />
                  <SkeletonBar width="110px" />
                </div>
              </td>
              <td className="px-6 py-3.5 text-right"><SkeletonBar className="ml-auto" width="70px" /></td>
              <td className="px-6 py-3.5"><SkeletonBar className="h-6 rounded-full" width="90px" /></td>
              <td className="px-6 py-3.5"><SkeletonBar width="50px" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Filter pills skeleton */
export function FilterPillsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton h-8 rounded-full" style={{ width: `${60 + i * 8}px` }} />
      ))}
    </div>
  );
}

/** Page header skeleton */
export function PageHeaderSkeleton() {
  return (
    <div className="mb-6">
      <SkeletonBar className="h-7 rounded-md mb-2" width="200px" />
      <SkeletonBar className="h-4" width="320px" />
    </div>
  );
}
