import Image from "next/image";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatRelativeTime } from "@/lib/utils";
import { newsItems } from "@/lib/mock/news";

/** Right-panel widget — a short list of national newcomer news. */
export function NationalNewsWidget() {
  return (
    <Card className="p-0">
      <h3 className="border-b border-border-card px-4 py-3 text-sm font-semibold text-ink-secondary">
        National News
      </h3>
      <ul className="divide-y divide-border-card">
        {newsItems.map((item) => (
          <li key={item.id} className="flex gap-3 px-4 py-3">
            {item.imageLink && (
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md">
                <Image
                  src={item.imageLink}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="56px"
                />
              </div>
            )}
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-medium text-ink-secondary">
                {item.title}
              </p>
              <div className="mt-1 flex items-center gap-2">
                {item.category && <Badge variant="neutral">{item.category}</Badge>}
                <span className="text-xs text-ink-placeholder">
                  {formatRelativeTime(item.date)}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
