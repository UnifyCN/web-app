"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useStagger } from "@/components/auth/motion";
import { useIsRtl } from "@/hooks/useDirection";
import { cn } from "@/lib/utils";

interface OtpInputProps {
  /** Current code (0–`length` digits). */
  value: string;
  onChange: (next: string) => void;
  /** Fired when the last box is filled. */
  onComplete?: (code: string) => void;
  length?: number;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
}

/**
 * Six-box one-time-code input (mobile-parity). Auto-advances on entry, steps back
 * on backspace, and distributes a pasted code across the boxes. Numeric only.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled = false,
  error = false,
  autoFocus = false,
}: OtpInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const { container, item } = useStagger();
  const { t } = useTranslation();
  const isRtl = useIsRtl();

  const setDigit = (index: number, digit: string) => {
    const chars = value.split("");
    chars[index] = digit;
    const next = chars.join("").slice(0, length);
    onChange(next);
    return next;
  };

  const handleChange = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, "").slice(-1);
    if (!digit) return;
    const next = setDigit(index, digit);
    if (index < length - 1) refs.current[index + 1]?.focus();
    if (next.length === length && !next.includes("")) onComplete?.(next);
  };

  const handleKeyDown = (
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (value[index]) {
        setDigit(index, "");
      } else if (index > 0) {
        setDigit(index - 1, "");
        refs.current[index - 1]?.focus();
      }
    } else if (event.key === "ArrowLeft") {
      // Under RTL the boxes render right-to-left, so ArrowLeft advances (higher
      // index) and ArrowRight steps back — mirror of LessonPager/ImageLightbox.
      const target = isRtl ? index + 1 : index - 1;
      if (target >= 0 && target < length) refs.current[target]?.focus();
    } else if (event.key === "ArrowRight") {
      const target = isRtl ? index - 1 : index + 1;
      if (target >= 0 && target < length) refs.current[target]?.focus();
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const digits = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, length);
    if (!digits) return;
    onChange(digits);
    const focusIndex = Math.min(digits.length, length - 1);
    refs.current[focusIndex]?.focus();
    if (digits.length === length) onComplete?.(digits);
  };

  return (
    <motion.div
      {...container}
      className="flex items-center justify-center gap-2.5 sm:gap-3"
    >
      {Array.from({ length }).map((_, i) => (
        <motion.input
          key={i}
          {...item}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          autoFocus={autoFocus && i === 0}
          disabled={disabled}
          value={value[i] ?? ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          aria-label={t("authWeb.otpDigit", { number: i + 1 })}
          className={cn(
            "h-14 w-12 rounded-xl border bg-surface text-center text-xl font-semibold text-ink-secondary outline-none transition-colors sm:h-16 sm:w-14",
            "focus:border-primary focus:ring-2 focus:ring-primary/30",
            error ? "border-destructive" : "border-border-card",
            disabled && "opacity-60",
          )}
        />
      ))}
    </motion.div>
  );
}
