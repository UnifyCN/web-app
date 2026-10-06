"use client";

import { useId } from "react";
import { motion } from "framer-motion";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface TabsProps {
  tabs: string[];
  activeTab: string;
  /** Called with the clicked label and its index — callers keeping stable ids
   *  behind translated labels should map back via the index, not the label. */
  onChange: (tab: string, index: number) => void;
  className?: string;
}

/** Underline tab bar — active tab carries an orange underline + label. The
 *  underline is one element that slides to the active tab (Framer `layoutId`,
 *  so it follows the tab in RTL too and jumps under reduced motion). */
export function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
  const underlineId = useId();
  return (
    <div
      role="tablist"
      className={cn(
        "flex items-center gap-1 border-b border-border-card",
        className,
      )}
    >
      {tabs.map((tab, index) => {
        const isActive = tab === activeTab;

        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab, index)}
            className={cn(
              "relative -mb-px cursor-pointer border-b-2 border-transparent px-5 py-3",
              "press-dim text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              isActive
                ? "font-semibold text-primary"
                : "font-medium text-ink-inactive hover:text-ink",
            )}
          >
            {tab}
            {isActive && (
              <motion.span
                layoutId={underlineId}
                transition={SPRING}
                // Sits over the button's transparent bottom border.
                className="absolute inset-x-0 -bottom-0.5 h-0.5 bg-primary"
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
