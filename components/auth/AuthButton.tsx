"use client";

import { Loader2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface AuthButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
}

/**
 * Primary auth CTA — the full-width black pill from the mobile designs (Sign Up,
 * Login, Continue, Verify, Create My Account). When `loading`, a spinner scales +
 * fades in (reduced-motion → instant). Distinct from the orange brand `Button`.
 */
export function AuthButton({
  loading = false,
  disabled,
  className,
  children,
  ...props
}: AuthButtonProps) {
  const reduce = useReducedMotion();
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading}
      className={cn(
        "flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-ink px-6 text-base font-semibold text-white",
        "transition-colors hover:bg-ink-secondary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:bg-ink-inactive disabled:hover:bg-ink-inactive",
        className,
      )}
      {...props}
    >
      <AnimatePresence initial={false}>
        {loading && (
          <motion.span
            key="spinner"
            className="inline-flex"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          </motion.span>
        )}
      </AnimatePresence>
      {children}
    </button>
  );
}
