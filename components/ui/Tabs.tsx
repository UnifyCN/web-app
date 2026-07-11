"use client";

import { cn } from "@/lib/utils";

interface TabsProps {
  tabs: string[];
  activeTab: string;
  /** Called with the clicked label and its index — callers keeping stable ids
   *  behind translated labels should map back via the index, not the label. */
  onChange: (tab: string, index: number) => void;
  className?: string;
}

/** Underline tab bar — active tab carries an orange underline + label. */
export function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
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
              "relative -mb-px cursor-pointer border-b-2 px-5 py-3",
              "text-sm transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              isActive
                ? "border-primary font-semibold text-primary"
                : "border-transparent font-medium text-ink-inactive hover:text-ink",
            )}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}
