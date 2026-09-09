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
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[12px] font-medium text-[var(--color-ink-muted)] uppercase tracking-wider">{label}</p>
        {icon && (
          <div className="w-7 h-7 rounded-[var(--radius-sm)] bg-[var(--color-canvas)] flex items-center justify-center text-[var(--color-ink-muted)]">
            {icon}
          </div>
        )}
      </div>

      <p className="text-[22px] font-semibold tracking-tight tabular-nums text-[var(--color-ink)]">{value}</p>

      <div className="flex items-center justify-between mt-3">
        {change && (
          <p className={`text-[12px] font-medium ${trendColor}`}>{change}</p>
        )}
        {sparklineData && sparklineData.length >= 2 && (
          <div className="opacity-40">
            <Sparkline data={sparklineData} color={sparklineColor || "var(--color-ink-muted)"} width={72} height={20} />
          </div>
        )}
      </div>
    </div>
  );
}
