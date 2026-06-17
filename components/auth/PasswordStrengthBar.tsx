"use client";

import { passwordStrength, type StrengthLevel } from "@/lib/passwordStrength";
import { cn } from "@/lib/utils";

const META: Record<
  StrengthLevel,
  { label: string; text: string; bar: string }
> = {
  weak: {
    label: "Weak",
    text: "text-priority-do-now",
    bar: "bg-priority-do-now",
  },
  medium: { label: "Medium", text: "text-warning", bar: "bg-priority-explore" },
  strong: {
    label: "Strong",
    text: "text-priority-optional",
    bar: "bg-priority-optional",
  },
};

/** Three-segment password-strength meter shown under the signup password field. */
export function PasswordStrengthBar({ password }: { password: string }) {
  if (!password) return null;
  const { level, filled } = passwordStrength(password);
  const meta = META[level];
  return (
    <div className="mt-2">
      <div className="flex gap-1.5" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i <= filled ? meta.bar : "bg-surface-input",
            )}
          />
        ))}
      </div>
      <p className={cn("mt-1 text-xs font-medium", meta.text)}>
        {meta.label} password
      </p>
    </div>
  );
}
