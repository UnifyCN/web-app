import Image from "next/image";
import { Badge } from "@/components/ui/Badge";
import { formatRelativeTime } from "@/lib/utils";
import type { NewsItem } from "@/types";

/** A single article row for the Community → News tab. */
export function NewsArticleItem({ item }: { item: NewsItem }) {
  return (
    <article className="flex gap-4 py-4">
      {item.imageLink && (
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg sm:h-24 sm:w-24">
          <Image
            src={item.imageLink}
            alt=""
            fill
            className="object-cover"
            sizes="96px"
          />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge variant="neutral">{item.category}</Badge>
          <span className="text-xs text-ink-placeholder">
            {formatRelativeTime(item.date)}
          </span>
        </div>
        <h3 className="mt-1.5 text-sm font-semibold text-ink-secondary">
          {item.title}
        </h3>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-muted">
          {item.description}
        </p>
        <p className="mt-1.5 text-xs text-ink-placeholder">By {item.author}</p>
      </div>
    </article>
  );
}
