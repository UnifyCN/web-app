"use client";

import { passwordStrength, type StrengthLevel } from "@/lib/passwordStrength";
import { cn } from "@/lib/utils";

const META: Record<
  StrengthLevel,
  { label: string; text: string; bar: string }
> = {
  weak: { label: "Weak", text: "text-[#E03B3B]", bar: "bg-[#E03B3B]" },
  medium: { label: "Medium", text: "text-[#C77B1F]", bar: "bg-[#F49E34]" },
  strong: { label: "Strong", text: "text-[#5E8651]", bar: "bg-[#5E8651]" },
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
