"use client";

import { useTranslation } from "react-i18next";
import { passwordStrength, type StrengthLevel } from "@/lib/passwordStrength";
import { cn } from "@/lib/utils";

const META: Record<
  StrengthLevel,
  { labelKey: string; text: string; bar: string }
> = {
  "very-weak": {
    labelKey: "authWeb.strengthVeryWeak",
    text: "text-destructive-label",
    bar: "bg-destructive",
  },
  weak: {
    labelKey: "authWeb.strengthWeak",
    text: "text-destructive-label",
    bar: "bg-destructive",
  },
  fair: { labelKey: "authWeb.strengthFair", text: "text-warning", bar: "bg-warning" },
  strong: {
    labelKey: "authWeb.strengthStrong",
    text: "text-success-label",
    bar: "bg-success-bright",
  },
  "very-strong": {
    labelKey: "authWeb.strengthVeryStrong",
    text: "text-success-label",
    bar: "bg-success-bright",
  },
};

/** Five-segment password-strength meter shown under the signup password field. */
export function PasswordStrengthBar({ password }: { password: string }) {
  const { t } = useTranslation();
  if (!password) return null;
  const { level, filled } = passwordStrength(password);
  const meta = META[level];
  return (
    <div className="mt-2">
      <div className="flex gap-1.5" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
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
        {t(meta.labelKey)}
      </p>
    </div>
  );
}
