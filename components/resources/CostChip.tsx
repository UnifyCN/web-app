import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { COST_LABEL_KEYS } from "@/lib/resources/categories";
import type { Cost } from "@/types";

/** Mobile COST_CHIP colours: free = teal, mixed = amber, paid = neutral. */
const COST_CHIP_CLASS: Record<Cost, string> = {
  free: "bg-res-free-bg text-res-link",
  mixed: "bg-res-mixed-bg text-res-mixed-text",
  paid: "bg-res-search text-res-secondary",
};

export function CostChip({ cost, className }: { cost: Cost; className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-[9px] py-1 text-[11px] leading-none font-medium",
        COST_CHIP_CLASS[cost],
        className,
      )}
    >
      {t(COST_LABEL_KEYS[cost])}
    </span>
  );
}
