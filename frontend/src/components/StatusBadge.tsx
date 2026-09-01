"use client";

interface StatusBadgeProps {
  status: string;
}

const statusStyles: Record<string, { bg: string; text: string; dot: string }> = {
  received: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  split_computed: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  paid_out: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  completed: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  failed: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  queued: { bg: "bg-slate-50", text: "text-slate-600", dot: "bg-slate-400" },
  dispatching: { bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" },
  manual_review: { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500" },
};

const fallback = { bg: "bg-slate-50", text: "text-slate-600", dot: "bg-slate-400" };

export default function StatusBadge({ status }: StatusBadgeProps) {
  const style = statusStyles[status] || fallback;
  const label = status.replace(/_/g, " ");

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold ${style.bg} ${style.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {label}
    </span>
  );
}
