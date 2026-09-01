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
  accent?: boolean; // First card gets the gradient treatment
}

export default function StatCard({ label, value, change, trend = "neutral", icon, sparklineData, sparklineColor, accent }: StatCardProps) {
  const trendColor = trend === "up"
    ? "text-emerald-600"
    : trend === "down"
    ? "text-red-500"
    : "text-[var(--color-ink-muted)]";

  const trendIcon = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";

  return (
    <div className={`relative overflow-hidden rounded-[var(--radius-lg)] border p-5 card-hover group animate-card-enter ${
      accent
        ? "bg-gradient-to-br from-[var(--color-primary)] via-indigo-500 to-violet-600 border-transparent text-white shadow-lg shadow-indigo-200/50"
        : "bg-[var(--color-surface)] border-[var(--color-border)]"
    }`}>
      {/* Subtle background pattern on accent card */}
      {accent && (
        <div className="absolute inset-0 opacity-[0.07]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
          backgroundSize: '24px 24px',
        }} />
      )}

      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <p className={`text-[12px] font-semibold uppercase tracking-wider ${accent ? "text-white/70" : "text-[var(--color-ink-muted)]"}`}>{label}</p>
          {icon && (
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-transform duration-200 group-hover:scale-110 ${
              accent ? "bg-white/15 text-white/90" : "bg-[var(--color-primary-light)] text-[var(--color-primary)]"
            }`}>
              {icon}
            </div>
          )}
        </div>

        <p className={`text-2xl font-bold tracking-tight tabular-nums animate-count-in ${
          accent ? "text-white" : "text-[var(--color-ink)]"
        }`}>{value}</p>

        <div className="flex items-center justify-between mt-2">
          {change && (
            <p className={`text-[12px] font-medium flex items-center gap-1 ${
              accent ? "text-white/80" : trendColor
            }`}>
              <span className="inline-block transition-transform duration-200" style={{ transform: trend === "up" ? "rotate(-45deg)" : trend === "down" ? "rotate(45deg)" : "none" }}>
                {trendIcon}
              </span>
              {change}
            </p>
          )}
          {sparklineData && sparklineData.length >= 2 && (
            <div className={`opacity-50 group-hover:opacity-100 transition-opacity duration-300 ${accent ? "" : ""}`}>
              <Sparkline data={sparklineData} color={accent ? "rgba(255,255,255,0.8)" : sparklineColor || "#4F46E5"} width={80} height={24} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
