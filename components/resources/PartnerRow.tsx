"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn, RTL_FLIP } from "@/lib/utils";
import { OrgMonogram } from "./OrgMonogram";
import { PARTNER_CATEGORY_COLORS } from "@/lib/resources/categories";
import type { Partner } from "@/types";

/** A single org row inside a category — links through to the partner detail.
 *  The `resources_partner_opened` event fires on the detail mount (covering
 *  deep links too), so this row doesn't track the click itself. */
export function PartnerRow({ partner }: { partner: Partner }) {
  const color = PARTNER_CATEGORY_COLORS[partner.category];

  return (
    <Link
      href={`/resources/${partner.slug}`}
      className="group flex items-center gap-3 rounded-lg px-3 py-3 transition-colors duration-200 hover:bg-surface-card"
    >
      <OrgMonogram
        name={partner.name}
        color={color}
        logo={partner.logo}
        size={44}
      />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold text-ink-secondary transition-colors group-hover:text-primary">
          {partner.name}
        </h2>
        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-muted">
          {partner.tagline}
        </p>
      </div>
      <ChevronRight
        className={cn("h-4 w-4 shrink-0 text-ink-placeholder", RTL_FLIP)}
        aria-hidden
      />
    </Link>
  );
}
