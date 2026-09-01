"use client";

import { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  change?: string;
  trend?: "up" | "down" | "neutral";
  icon?: ReactNode;
}

export default function StatCard({ label, value, change, trend = "neutral", icon }: StatCardProps) {
  const trendColor = trend === "up"
    ? "text-emerald-600"
    : trend === "down"
    ? "text-red-500"
    : "text-[var(--color-ink-muted)]";

  return (
    <div className="bg-white rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5 hover:shadow-[var(--shadow-md)] transition-shadow duration-200">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">{label}</p>
        {icon && <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-light)] flex items-center justify-center text-[var(--color-primary)]">{icon}</div>}
      </div>
      <p className="text-2xl font-bold tracking-tight text-[var(--color-ink)] tabular-nums">{value}</p>
      {change && (
        <p className={`mt-1.5 text-[12px] font-medium ${trendColor}`}>{change}</p>
      )}
    </div>
  );
}
