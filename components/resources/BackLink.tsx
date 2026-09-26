import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn, RTL_FLIP } from "@/lib/utils";

/** "‹ Resources" back nav from the Resources frames (14/semibold, #686464). */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-[5px] self-start py-0.5 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
    >
      <ChevronLeft className={cn("h-[17px] w-[17px]", RTL_FLIP)} aria-hidden />
      {label}
    </Link>
  );
}
