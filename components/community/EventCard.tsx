"use client";

import Image from "next/image";
import Link from "next/link";
import { Calendar, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/Badge";
import type { CommunityEvent, EventType } from "@/types";

const EVENT_TYPE_LABEL_KEY: Record<EventType, string> = {
  "in-person": "events.typeInPerson",
  online: "events.typeOnline",
  hybrid: "events.typeHybrid",
};

/** Community event card — links through to the event detail page. */
export function EventCard({ event }: { event: CommunityEvent }) {
  const { t, i18n } = useTranslation();
  // Events are BC-based; render in Pacific so the time is correct and stable
  // across server/client (the stored datetime is the exact UTC instant).
  const TZ = "America/Vancouver";
  const date = new Date(event.eventDatetime);
  const day = date.toLocaleDateString(i18n.language, {
    day: "numeric",
    timeZone: TZ,
  });
  const month = date.toLocaleDateString(i18n.language, {
    month: "short",
    timeZone: TZ,
  });
  const time = date.toLocaleTimeString(i18n.language, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TZ,
  });

  return (
    <Link
      href={`/community/event/${event.id}`}
      className="flex flex-col overflow-hidden rounded-card border border-border-card bg-surface transition-shadow duration-200 hover:shadow-md"
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
        <div className="absolute start-3 top-3 flex flex-col items-center rounded-lg bg-surface px-2.5 py-1 shadow-sm">
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
          <Badge variant="primary">
            {t(EVENT_TYPE_LABEL_KEY[event.eventType])}
          </Badge>
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
