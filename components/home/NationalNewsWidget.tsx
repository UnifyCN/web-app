"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { externalHref } from "@/lib/utils";
import { handleNewsImageError } from "@/lib/news/fallbackImage";
import { useNews } from "@/hooks/useCommunity";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import type { NewsItem } from "@/types";

/**
 * Right-panel widget — a short list of national newcomer news. Reads the same
 * `news_details`-backed source as the Community → News tab (shared `useNews()`
 * query key), so the weekly crawler keeps both surfaces in sync. Selection aims
 * for category coverage without going stale: one freshest item per category (only
 * if it's within the freshness window), then the remaining slots filled by pure
 * recency (see `items`). The mock fallback (local-dev / no Supabase env) lives
 * inside `getNews()`.
 */
export function NationalNewsWidget() {
  const { t } = useTranslation();
  const formatRelativeTime = useRelativeTime();
  const { data, isLoading, error } = useNews();
  // Captured once at mount (lazy initializer keeps the wall-clock read out of the
  // render path, which react-hooks/purity forbids). A 14-day freshness window does
  // not need sub-session precision.
  const [nowMs] = useState(() => Date.now());

  // Category coverage with a freshness guard, then recency fill. There are 6 news
  // categories (Immigration/Benefits/Health/Finance/Housing/Community) but only 5
  // slots, so rather than guarantee all of them (which pins weeks-old headlines from
  // quiet categories into the widget — the stale look we're avoiding):
  //   1. Seed one freshest item per category, but only if it's within
  //      FRESH_WINDOW_DAYS. A category quiet longer than that earns no guaranteed
  //      slot and yields it to fresher news.
  //   2. Fill the remaining slots by pure recency across everything (no freshness
  //      guard, no per-category cap), deduped by id.
  //   3. Sort the final set date-desc.
  // `data` is already date-desc (getNews orders by date), so the first row seen for a
  // category is its freshest. Null-category rows (the mock fallback) are skipped from
  // seeding and only compete in the recency fill, so local/mock mode still renders.
  const items = useMemo(() => {
    const FRESH_WINDOW_DAYS = 14;
    const MAX_ITEMS = 5;
    const rows = data ?? [];
    const freshCutoff = nowMs - FRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const isFresh = (it: NewsItem) => {
      const ms = new Date(it.date).getTime();
      return Number.isFinite(ms) && ms >= freshCutoff;
    };

    const picked: NewsItem[] = [];
    const pickedIds = new Set<number>();

    // 1. Seed: freshest item per category, only if within the freshness window.
    //    Mark the category as considered on first sighting (its freshest row), so a
    //    stale freshest row skips the category rather than seeding an even older one.
    const seededCategories = new Set<string>();
    for (const it of rows) {
      if (picked.length >= MAX_ITEMS) break;
      if (!it.category || seededCategories.has(it.category)) continue;
      seededCategories.add(it.category);
      if (!isFresh(it)) continue;
      picked.push(it);
      pickedIds.add(it.id);
    }

    // 2. Fill remaining slots by pure recency (no guard, no cap), skipping picks.
    for (const it of rows) {
      if (picked.length >= MAX_ITEMS) break;
      if (pickedIds.has(it.id)) continue;
      picked.push(it);
      pickedIds.add(it.id);
    }

    // 3. Final order: newest first.
    return picked.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [data, nowMs]);

  return (
    <Card className="p-0">
      <h3 className="border-b border-border-card px-4 py-3 text-sm font-semibold text-ink-secondary">
        {t("news.nationalNews")}
      </h3>

      {isLoading ? (
        <ul className="divide-y divide-border-card">
          {Array.from({ length: 3 }).map((_, i) => (
            <li
              key={i}
              className="flex animate-pulse gap-3 px-4 py-3"
              aria-hidden
            >
              <div className="h-14 w-14 shrink-0 rounded-md bg-surface-gray" />
              <div className="min-w-0 flex-1 space-y-2 py-1">
                <div className="h-3 w-full rounded bg-surface-gray" />
                <div className="h-3 w-2/3 rounded bg-surface-gray" />
              </div>
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        // Items take precedence over a (background) error: only fall back to the
        // error/empty placeholder when there's genuinely nothing to show, so a
        // failed refetch never blanks out already-loaded news. (CodeRabbit, PR #40.)
        error ? (
          <p
            role="alert"
            className="px-4 py-8 text-center text-sm text-destructive"
          >
            {t("news.loadError")}
          </p>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-ink-placeholder">
            {t("news.noNews")}
          </p>
        )
      ) : (
        <ul className="divide-y divide-border-card">
          {items.map((item) => {
            const href = externalHref(item.link);
            const body = (
              <>
                {item.imageLink && (
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md">
                    {/* eslint-disable-next-line @next/next/no-img-element -- crawled news images come from arbitrary publisher hosts (not in the next.config allowlist); a plain <img> lets the onError fallback work */}
                    <img
                      src={item.imageLink}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                      onError={(e) => handleNewsImageError(e, item.category)}
                    />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-medium text-ink-secondary transition-colors group-hover:text-primary">
                    {item.title}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    {item.category && (
                      <Badge variant="neutral">{item.category}</Badge>
                    )}
                    <span className="text-xs text-ink-placeholder">
                      {formatRelativeTime(item.date)}
                    </span>
                  </div>
                </div>
              </>
            );

            return (
              <li key={item.id}>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex gap-3 px-4 py-3 transition-colors hover:bg-surface-card"
                  >
                    {body}
                  </a>
                ) : (
                  <div className="flex gap-3 px-4 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
