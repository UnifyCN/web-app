"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";

/**
 * Search field (Figma "Search" — #F4F2EE fill, 13px radius). Keeps its own
 * draft so typing stays instant, and commits to the URL after a short pause.
 */
export function ResourcesSearch({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (q: string) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  const committed = useRef(value);

  // Follow external changes (e.g. Back/Forward) without clobbering typing.
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setDraft(value);
    }
  }, [value]);

  useEffect(() => {
    if (draft === committed.current) return;
    const id = setTimeout(() => {
      committed.current = draft;
      onCommit(draft);
    }, 250);
    return () => clearTimeout(id);
  }, [draft, onCommit]);

  return (
    <div className="flex w-full items-center gap-2.5 rounded-[13px] bg-res-search px-3.5 py-[11px] focus-within:ring-2 focus-within:ring-res-link/40">
      <Search className="h-5 w-5 shrink-0 text-res-placeholder" aria-hidden />
      <input
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t("resources.searchPlaceholder")}
        aria-label={t("resources.searchLabel")}
        className="min-w-0 flex-1 bg-transparent text-sm text-res-card-text placeholder:text-res-placeholder focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {draft && (
        <button
          type="button"
          onClick={() => {
            setDraft("");
            committed.current = "";
            onCommit("");
          }}
          aria-label={t("resources.clearSearch")}
          className="-my-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-res-placeholder transition-colors hover:bg-res-border hover:text-res-card-text"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
