"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { externalHref, formatRelativeTime } from "@/lib/utils";
import { handleNewsImageError } from "@/lib/news/fallbackImage";
import { useNews } from "@/hooks/useCommunity";
import type { NewsItem } from "@/types";

/**
 * Right-panel widget — a short list of national newcomer news. Reads the same
 * `news_details`-backed source as the Community → News tab (shared `useNews()`
 * query key), so the weekly crawler keeps both surfaces in sync. Shows the 5 most
 * recent items; the mock fallback (local-dev / no Supabase env) lives inside
 * `getNews()`.
 */
export function NationalNewsWidget() {
  const { data, isLoading, error } = useNews();

  // Show one article per category — the most recent from each of up to 5 distinct
  // categories — so the widget stays varied no matter what's publishing today
  // (instead of e.g. 5 Immigration items). `data` is already date-desc (getNews
  // orders by date), so the first row seen for a category is its most recent; a null
  // category (the mock fallback) never collapses into one bucket.
  const items = useMemo(() => {
    const seen = new Map<string, NewsItem>();
    for (const it of data ?? []) {
      const key = it.category ?? `__uncat_${it.id}`;
      if (!seen.has(key)) seen.set(key, it);
    }
    return [...seen.values()]
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, 5);
  }, [data]);

  return (
    <Card className="p-0">
      <h3 className="border-b border-border-card px-4 py-3 text-sm font-semibold text-ink-secondary">
        National News
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
            Couldn&apos;t load news.
          </p>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-ink-placeholder">
            No news yet.
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
