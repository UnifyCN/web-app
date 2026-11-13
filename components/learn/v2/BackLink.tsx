import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn, RTL_FLIP } from "@/lib/utils";

/** "‹ Parent" link at the top of the v2 course and module pages. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="press-dim inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold text-ink-tertiary hover:text-ink"
    >
      <ChevronLeft className={cn("size-4", RTL_FLIP)} aria-hidden />
      <span className="line-clamp-1">{label}</span>
    </Link>
  );
}

/** Thin progress bar (course module cards, module header). */
export function ProgressBar({
  percent,
  label,
  className,
}: {
  percent: number;
  label: string;
  className?: string;
}) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-surface-gray",
        className,
      )}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}
