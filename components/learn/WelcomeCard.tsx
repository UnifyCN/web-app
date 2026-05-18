"use client";

import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";

interface WelcomeCardProps {
  search: string;
  onSearchChange: (value: string) => void;
}

/** Learn home personalisation card — name, search, removable topic chips. */
export function WelcomeCard({ search, onSearchChange }: WelcomeCardProps) {
  const [chips, setChips] = useState(["Housing", "Finance"]);

  return (
    <div className="rounded-card border border-border-card bg-surface p-5">
      <p className="text-xs text-ink-placeholder">Welcome</p>
      <h2 className="text-lg font-bold text-ink-secondary">Your Name</h2>

      <div className="relative mt-3">
        <Search
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-placeholder"
          aria-hidden
        />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search"
          aria-label="Search lessons"
          className="h-10 w-full rounded-full border border-border-card bg-surface pl-9 pr-9 text-sm text-ink-muted placeholder:text-ink-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <SlidersHorizontal
          className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-placeholder"
          aria-hidden
        />
      </div>

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span
              key={chip}
              className="inline-flex items-center gap-1 rounded-full bg-mention-blue px-2.5 py-1 text-xs font-medium text-white"
            >
              {chip}
              <button
                type="button"
                onClick={() =>
                  setChips((current) => current.filter((c) => c !== chip))
                }
                aria-label={`Remove ${chip}`}
                className="cursor-pointer"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
