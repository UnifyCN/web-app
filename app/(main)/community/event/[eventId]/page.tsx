import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  User,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { getEventById } from "@/lib/mock/events";
import type { EventType } from "@/types";

const EVENT_TYPE_LABEL: Record<EventType, string> = {
  "in-person": "In person",
  online: "Online",
  hybrid: "Hybrid",
};

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const parsedId = Number(eventId);
  const event = Number.isFinite(parsedId) && parsedId > 0
    ? getEventById(parsedId)
    : undefined;

  if (!event) {
    return (
      <div className="mx-auto max-w-[680px] px-6 py-16 text-center">
        <p className="text-sm text-ink-muted">
          This event could not be found.
        </p>
        <Link
          href="/community"
          className="mt-3 inline-block text-sm font-semibold text-primary"
        >
          Back to Community
        </Link>
      </div>
    );
  }

  const date = new Date(event.eventDatetime);
  const dateLabel = date.toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const time = date.toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="mx-auto max-w-[680px] px-6 py-6">
      <Link
        href="/community"
        className="mb-4 inline-flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Community
      </Link>

      <h1 className="text-xl font-semibold text-ink-secondary">
        {event.title}
      </h1>

      {event.coverPhotoUrl && (
        <div className="relative mt-4 aspect-[16/9] w-full overflow-hidden rounded-card border border-border-card">
          <Image
            src={event.coverPhotoUrl}
            alt=""
            fill
            className="object-cover"
            sizes="680px"
          />
        </div>
      )}

      <div className="mt-4">
        <Badge variant="primary">{EVENT_TYPE_LABEL[event.eventType]}</Badge>
      </div>

      <div className="mt-3 space-y-2">
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Calendar className="h-4 w-4 shrink-0 text-ink-placeholder" aria-hidden />
          {dateLabel} · {time}
        </p>
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <MapPin className="h-4 w-4 shrink-0 text-ink-placeholder" aria-hidden />
          {event.location}
        </p>
        {event.hostedBy && (
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <User className="h-4 w-4 shrink-0 text-ink-placeholder" aria-hidden />
            Hosted by{" "}
            <span className="font-medium text-ink-secondary">
              {event.hostedBy}
            </span>
          </p>
        )}
      </div>

      {event.externalLink && (
        <a
          href={event.externalLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          View Event Details
          <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      )}

      <h2 className="mt-7 text-base font-semibold text-ink-secondary">
        About Event
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        {event.description}
      </p>
    </div>
  );
}
