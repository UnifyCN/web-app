"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";

/**
 * Lightweight, on-brand toast system (no third-party UI dependency). A single
 * provider mounted in the (main) shell exposes `useToast()`. Mount/unmount are
 * animated via framer-motion's AnimatePresence (slide up + fade), disabled under
 * `prefers-reduced-motion`; toasts auto-dismiss after ~2.5s and are announced
 * politely for screen readers.
 */

type ToastVariant = "success" | "info";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastApi {
  show: (message: string, variant?: ToastVariant) => void;
  success: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const AUTO_DISMISS_MS = 2500;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const reduce = useReducedMotion();

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, variant: ToastVariant = "success") => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, variant }]);
      window.setTimeout(() => remove(id), AUTO_DISMISS_MS);
    },
    [remove],
  );

  const success = useCallback(
    (message: string) => show(message, "success"),
    [show],
  );

  return (
    <ToastContext.Provider value={{ show, success }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex flex-col items-center gap-2 px-4"
        aria-live="polite"
        role="status"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={
                reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }
              }
              animate={
                reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }
              }
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
              transition={{ duration: reduce ? 0 : 0.18, ease: "easeOut" }}
              className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-border-card bg-surface-card px-4 py-2.5 shadow-lg"
            >
              {t.variant === "success" && (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                </span>
              )}
              <span className="text-sm font-semibold text-ink-secondary">
                {t.message}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Access the toast API. Safe no-op if the provider isn't mounted (e.g. unit
 * rendering a component in isolation) so callers never crash.
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (ctx) return ctx;
  return { show: () => {}, success: () => {} };
}
