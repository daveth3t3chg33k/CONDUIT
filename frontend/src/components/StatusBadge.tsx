"use client";

interface StatusBadgeProps {
  status: string;
}

const statusStyles: Record<string, string> = {
  received: "bg-blue-100 text-blue-800",
  split_computed: "bg-yellow-100 text-yellow-800",
  paid_out: "bg-green-100 text-green-800",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  queued: "bg-gray-100 text-gray-800",
  dispatching: "bg-purple-100 text-purple-800",
  manual_review: "bg-orange-100 text-orange-800",
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const style = statusStyles[status] || "bg-gray-100 text-gray-600";
  const label = status.replace(/_/g, " ");

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style}`}
    >
      {label}
    </span>
  );
}
