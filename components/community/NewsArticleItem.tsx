import { Badge } from "@/components/ui/Badge";
import { externalHref, formatRelativeTime } from "@/lib/utils";
import type { NewsItem } from "@/types";

/**
 * A single article row for the Community → News tab. There's no in-app news
 * detail page, so when the item has a source URL the whole row links out.
 */
export function NewsArticleItem({ item }: { item: NewsItem }) {
  const href = externalHref(item.link);

  const body = (
    <>
      {item.imageLink && (
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg sm:h-24 sm:w-24">
          {/* eslint-disable-next-line @next/next/no-img-element -- crawled news images come from arbitrary publisher hosts (not in the next.config allowlist) */}
          <img
            src={item.imageLink}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {item.category && <Badge variant="neutral">{item.category}</Badge>}
          <span className="text-xs text-ink-placeholder">
            {formatRelativeTime(item.date)}
          </span>
        </div>
        <h3 className="mt-1.5 text-sm font-semibold text-ink-secondary transition-colors group-hover:text-primary">
          {item.title}
        </h3>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-muted">
          {item.description}
        </p>
        {item.author && (
          <p className="mt-1.5 text-xs text-ink-placeholder">By {item.author}</p>
        )}
      </div>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="group -mx-3 flex gap-4 rounded-lg px-3 py-4 transition-colors duration-200 hover:bg-surface-card"
      >
        {body}
      </a>
    );
  }

  return <article className="flex gap-4 py-4">{body}</article>;
}
