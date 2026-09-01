"use client";

import { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  change?: string;
  icon?: ReactNode;
}

export default function StatCard({ label, value, change, icon }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        {icon && <div className="text-gray-400">{icon}</div>}
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      {change && (
        <p className="mt-1 text-sm text-gray-500">{change}</p>
      )}
    </div>
  );
}
