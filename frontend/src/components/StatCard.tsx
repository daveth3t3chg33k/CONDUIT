"use client";

import { ReactNode } from "react";
import Sparkline from "./Sparkline";

interface StatCardProps {
  label: string;
  value: string | number;
  change?: string;
  trend?: "up" | "down" | "neutral";
  icon?: ReactNode;
  sparklineData?: number[];
  sparklineColor?: string;
}

export default function StatCard({ label, value, change, trend = "neutral", icon, sparklineData, sparklineColor }: StatCardProps) {
  const trendColor = trend === "up"
    ? "text-emerald-600"
    : trend === "down"
    ? "text-red-500"
    : "text-[var(--color-ink-muted)]";

  return (
    <div className="bg-white rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5 hover:shadow-[var(--shadow-md)] transition-shadow duration-200 group">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] font-medium text-[var(--color-ink-secondary)]">{label}</p>
        {icon && <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-light)] flex items-center justify-center text-[var(--color-primary)]">{icon}</div>}
      </div>
      <p className="text-2xl font-bold tracking-tight text-[var(--color-ink)] tabular-nums">{value}</p>
      <div className="flex items-center justify-between mt-1.5">
        {change && (
          <p className={`text-[12px] font-medium ${trendColor}`}>{change}</p>
        )}
        {sparklineData && sparklineData.length >= 2 && (
          <div className="opacity-70 group-hover:opacity-100 transition-opacity duration-200">
            <Sparkline data={sparklineData} color={sparklineColor || "#4F46E5"} width={80} height={24} />
          </div>
        )}
      </div>
    </div>
  );
}
