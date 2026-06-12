import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  id?: string;
  /** Accessible name when no visible <label> is wired to the control. */
  "aria-label"?: string;
}

/**
 * Accessible on/off toggle. `role="switch"` + `aria-checked` keep it correct for
 * screen readers; the knob slides in ≤200ms to match the project's subtle-motion
 * taste. Controlled — drive `checked` from state and flip it in `onChange`.
 */
export function Switch({
  checked,
  onChange,
  disabled,
  id,
  "aria-label": ariaLabel,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full",
        "transition-colors duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-60",
        checked ? "bg-primary" : "bg-surface-gray",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow-sm",
          "transition-transform duration-200 ease-out",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
