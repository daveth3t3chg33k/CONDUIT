"use client";

interface StatusBadgeProps {
  status: string;
}

const statusStyles: Record<string, { bg: string; text: string; dot: string; pulse: boolean }> = {
  received: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500", pulse: true },
  split_computed: { bg: "bg-amber-50", text: "text-amber-600", dot: "bg-amber-500", pulse: true },
  paid_out: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", pulse: false },
  completed: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", pulse: false },
  failed: { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-500", pulse: false },
  queued: { bg: "bg-gray-50", text: "text-gray-600", dot: "bg-gray-400", pulse: false },
  dispatching: { bg: "bg-violet-50", text: "text-violet-600", dot: "bg-violet-500", pulse: true },
  manual_review: { bg: "bg-orange-50", text: "text-orange-600", dot: "bg-orange-500", pulse: false },
  processing: { bg: "bg-blue-50", text: "text-blue-600", dot: "bg-blue-500", pulse: true },
  dead_letter: { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-400", pulse: false },
};

const fallback = { bg: "bg-gray-50", text: "text-gray-600", dot: "bg-gray-400", pulse: false };

export default function StatusBadge({ status }: StatusBadgeProps) {
  const style = statusStyles[status] || fallback;
  const label = status.replace(/_/g, " ");

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[12px] font-medium ${style.bg} ${style.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot} ${style.pulse ? "animate-pulse-dot" : ""}`} />
      {label}
    </span>
  );
}
