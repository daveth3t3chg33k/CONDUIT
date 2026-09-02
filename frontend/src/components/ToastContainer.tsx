"use client";

import { useToast, Toast as ToastType } from "@/lib/ToastContext";

const VARIANTS: Record<
  ToastType["variant"],
  { bg: string; border: string; icon: React.ReactNode; dot: string }
> = {
  success: {
    bg: "bg-[var(--color-success-bg)]",
    border: "border-[var(--color-success)]/20",
    dot: "bg-[var(--color-success)]",
    icon: (
      <svg className="w-4 h-4 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  error: {
    bg: "bg-[var(--color-danger-bg)]",
    border: "border-[var(--color-danger)]/20",
    dot: "bg-[var(--color-danger)]",
    icon: (
      <svg className="w-4 h-4 text-[var(--color-danger)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
    ),
  },
  warning: {
    bg: "bg-[var(--color-warning-bg)]",
    border: "border-[var(--color-warning)]/20",
    dot: "bg-[var(--color-warning)]",
    icon: (
      <svg className="w-4 h-4 text-[var(--color-warning)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
    ),
  },
  info: {
    bg: "bg-[var(--color-info-bg)]",
    border: "border-[var(--color-info)]/20",
    dot: "bg-[var(--color-info)]",
    icon: (
      <svg className="w-4 h-4 text-[var(--color-info)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
};

function SingleToast({ toast }: { toast: ToastType }) {
  const { dismiss, pauseTimer, resumeTimer } = useToast();
  const v = VARIANTS[toast.variant];

  const duration = toast.duration ?? (toast.variant === "error" ? 8000 : 5000);

  async function handleUndo() {
    if (toast.undo) {
      await toast.undo();
    }
    dismiss(toast.id);
  }

  return (
    <div
      onMouseEnter={() => pauseTimer(toast.id)}
      onMouseLeave={() => resumeTimer(toast.id)}
      className={`
        toast-enter toast-exit
        flex items-start gap-3 w-[360px] max-w-[calc(100vw-2rem)]
        px-4 py-3 rounded-[var(--radius-lg)]
        border ${v.bg} ${v.border}
        shadow-[var(--shadow-lg)]
        backdrop-blur-sm
        group relative overflow-hidden
      `}
    >
      {/* Animated progress bar */}
      <div
        className={`absolute bottom-0 left-0 h-[2px] ${v.dot} toast-progress`}
        style={{
          animationDuration: `${duration}ms`,
        }}
      />

      {/* Icon */}
      <div className="mt-0.5 shrink-0">{v.icon}</div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-[var(--color-ink)] leading-tight">
          {toast.title}
        </p>
        {toast.message && (
          <p className="text-[12px] text-[var(--color-ink-secondary)] mt-0.5 leading-relaxed">
            {toast.message}
          </p>
        )}
        {/* Undo button */}
        {toast.undo && (
          <button
            onClick={handleUndo}
            className="mt-2 px-3 py-1 text-[12px] font-bold text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] bg-[var(--color-primary-light)] hover:bg-[var(--color-primary-light)]/70 rounded-full transition-all duration-150 btn-press"
          >
            {toast.undoLabel || "Undo"}
          </button>
        )}
      </div>

      {/* Dismiss */}
      <button
        onClick={() => dismiss(toast.id)}
        className="mt-0.5 shrink-0 p-0.5 rounded hover:bg-black/5 transition-colors opacity-0 group-hover:opacity-100"
        aria-label="Dismiss"
      >
        <svg className="w-3.5 h-3.5 text-[var(--color-ink-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const { toasts } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-[100] flex flex-col-reverse gap-2 items-end pointer-events-none"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <SingleToast toast={toast} />
        </div>
      ))}
    </div>
  );
}
