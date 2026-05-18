import Image from "next/image";
import Link from "next/link";
import { Calendar, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { CommunityEvent, EventType } from "@/types";

const EVENT_TYPE_LABEL: Record<EventType, string> = {
  "in-person": "In person",
  online: "Online",
  hybrid: "Hybrid",
};

/** Community event card — links through to the event detail page. */
export function EventCard({ event }: { event: CommunityEvent }) {
  const date = new Date(event.eventDatetime);
  const day = date.toLocaleDateString("en-CA", { day: "numeric" });
  const month = date.toLocaleDateString("en-CA", { month: "short" });
  const time = date.toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Link
      href={`/community/event/${event.id}`}
      className="flex flex-col overflow-hidden rounded-card border border-border-card bg-surface transition-shadow duration-150 hover:shadow-md"
    >
      <div className="relative aspect-[16/9] w-full">
        {event.coverPhotoUrl && (
          <Image
            src={event.coverPhotoUrl}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 340px"
          />
        )}
        <div className="absolute left-3 top-3 flex flex-col items-center rounded-lg bg-surface px-2.5 py-1 shadow-sm">
          <span className="text-base font-bold leading-none text-primary">
            {day}
          </span>
          <span className="text-[10px] font-medium uppercase tracking-wide text-ink-placeholder">
            {month}
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-sm font-semibold text-ink-secondary">
          {event.title}
        </h3>
        <div className="mt-1.5">
          <Badge variant="primary">{EVENT_TYPE_LABEL[event.eventType]}</Badge>
        </div>
        <div className="mt-2.5 space-y-1.5">
          <p className="flex items-center gap-2 text-xs text-ink-muted">
            <Calendar className="h-4 w-4 shrink-0 text-ink-placeholder" aria-hidden />
            {month} {day} · {time}
          </p>
          <p className="flex items-center gap-2 text-xs text-ink-muted">
            <MapPin className="h-4 w-4 shrink-0 text-ink-placeholder" aria-hidden />
            <span className="truncate">{event.location}</span>
          </p>
        </div>
      </div>
    </Link>
  );
}
