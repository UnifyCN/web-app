"use client";

import { useState } from "react";
import { ArrowBigUp, Eye, EyeOff } from "lucide-react";
import { cn, moveCaretToEnd } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Leading glyph (e.g. <Mail />, <Lock />), rendered muted on the left. */
  leftIcon?: React.ReactNode;
  /** Red error ring. */
  error?: boolean;
  /** React 19 prop-style ref forwarded to the underlying <input>. */
  ref?: React.Ref<HTMLInputElement>;
}

/**
 * Brand text field — a light-grey rounded pill matching the mobile auth designs.
 * For `type="password"`: a show/hide eye toggle, and a subtle amber Caps-Lock
 * indicator while the field is focused and Caps Lock is on.
 */
export function Input({
  leftIcon,
  error = false,
  type = "text",
  className,
  ref,
  onKeyDown,
  onKeyUp,
  onBlur,
  onFocus,
  ...props
}: InputProps) {
  const isPassword = type === "password";
  const [show, setShow] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const resolvedType = isPassword ? (show ? "text" : "password") : type;

  const syncCaps = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof event.getModifierState === "function") {
      setCapsLock(event.getModifierState("CapsLock"));
    }
  };

  return (
    <div
      className={cn(
        "relative flex items-center rounded-xl bg-surface-gray transition-shadow",
        "focus-within:ring-2 focus-within:ring-primary/40",
        error && "ring-2 ring-destructive/60",
        className,
      )}
    >
      {leftIcon && (
        <span
          className="pointer-events-none absolute left-4 flex text-ink-placeholder"
          aria-hidden
        >
          {leftIcon}
        </span>
      )}
      <input
        ref={ref}
        type={resolvedType}
        onKeyDown={(event) => {
          if (isPassword) syncCaps(event);
          onKeyDown?.(event);
        }}
        onKeyUp={(event) => {
          if (isPassword) syncCaps(event);
          onKeyUp?.(event);
        }}
        onBlur={(event) => {
          setCapsLock(false);
          onBlur?.(event);
        }}
        onFocus={(event) => {
          // Pre-filled fields (e.g. an edited email) should land the caret at the
          // end, not the start. moveCaretToEnd guards the type="email" case.
          moveCaretToEnd(event);
          onFocus?.(event);
        }}
        className={cn(
          "h-14 w-full rounded-xl bg-transparent text-base text-ink-secondary outline-none placeholder:text-ink-placeholder",
          leftIcon ? "pl-12" : "pl-4",
          isPassword ? "pr-16" : "pr-4",
        )}
        {...props}
      />
      {isPassword && capsLock && (
        <span
          className="pointer-events-none absolute right-11 flex text-warning"
          role="img"
          aria-label="Caps Lock is on"
          title="Caps Lock is on"
        >
          <ArrowBigUp className="h-4 w-4" aria-hidden />
        </span>
      )}
      {isPassword && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((s) => !s)}
          className="absolute right-4 flex text-ink-placeholder transition-colors hover:text-ink-muted"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? (
            <EyeOff className="h-5 w-5" aria-hidden />
          ) : (
            <Eye className="h-5 w-5" aria-hidden />
          )}
        </button>
      )}
    </div>
  );
}
