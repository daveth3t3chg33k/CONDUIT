"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from "react";

export type ToastVariant = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  message?: string;
  duration?: number;
  createdAt: number;
  undo?: () => void | Promise<void>;
  undoLabel?: string;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id" | "createdAt">) => void;
  dismiss: (id: string) => void;
  pauseTimer: (id: string) => void;
  resumeTimer: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const remaining = useRef<Map<string, number>>(new Map());
  const pausedAt = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    remaining.current.delete(id);
    pausedAt.current.delete(id);
  }, []);

  const pauseTimer = useCallback(
    (id: string) => {
      const startTime = pausedAt.current.has(id) ? pausedAt.current.get(id)! : Date.now();
      pausedAt.current.set(id, startTime);

      const timer = timers.current.get(id);
      if (timer) {
        clearTimeout(timer);
        timers.current.delete(id);
      }

      // Calculate remaining time
      const toast = toasts.find((t) => t.id === id);
      if (toast) {
        const totalDuration = toast.duration ?? (toast.variant === "error" ? 8000 : 5000);
        const elapsed = Date.now() - toast.createdAt;
        const rem = Math.max(0, totalDuration - elapsed);
        remaining.current.set(id, rem);
      }
    },
    [toasts]
  );

  const resumeTimer = useCallback(
    (id: string) => {
      const rem = remaining.current.get(id) ?? 2000;
      const timer = setTimeout(() => {
        dismiss(id);
      }, rem);
      timers.current.set(id, timer);
      pausedAt.current.delete(id);
      remaining.current.delete(id);
    },
    [dismiss]
  );

  const addToast = useCallback(
    (toast: Omit<Toast, "id" | "createdAt">) => {
      const id = `toast-${++counter}-${Date.now()}`;
      const newToast: Toast = {
        ...toast,
        id,
        createdAt: Date.now(),
      };

      setToasts((prev) => [...prev, newToast]);

      const duration = toast.duration ?? (toast.variant === "error" ? 8000 : 5000);
      const timer = setTimeout(() => {
        dismiss(id);
      }, duration);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, dismiss, pauseTimer, resumeTimer }}>
      {children}
    </ToastContext.Provider>
  );
}
