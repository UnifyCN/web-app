"use client";

import { use } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  User,
  ExternalLink,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn, RTL_FLIP } from "@/lib/utils";
import { getPreviousPathname } from "@/lib/navigation";
import { Badge } from "@/components/ui/Badge";
import { useEvent } from "@/hooks/useCommunity";
import type { EventType } from "@/types";

const EVENT_TYPE_LABEL_KEY: Record<EventType, string> = {
  "in-person": "events.typeInPerson",
  online: "events.typeOnline",
  hybrid: "events.typeHybrid",
};

export default function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { eventId } = use(params);
  const parsedId = Number(eventId);
  const { data: event, isLoading, isError, refetch } = useEvent(parsedId);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[680px] px-6 py-6">
        <div className="h-4 w-24 animate-pulse rounded bg-surface-gray" />
        <div className="mt-4 h-7 w-3/4 animate-pulse rounded bg-surface-gray" />
        <div className="mt-4 aspect-[16/9] w-full animate-pulse rounded-card bg-surface-gray" />
        <div className="mt-4 h-5 w-28 animate-pulse rounded bg-surface-gray" />
      </div>
    );
  }

  // A failed query returns `undefined` data too, so this must come BEFORE the
  // not-found branch — otherwise a network/RLS failure reads as "no such event".
  if (isError) {
    return (
      <div className="mx-auto max-w-[680px] px-6 py-16 text-center">
        <p className="text-sm text-ink-muted">
          {t("events.loadEventError")}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-3 inline-block cursor-pointer text-sm font-semibold text-primary"
        >
          {t("common.retry")}
        </button>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="mx-auto max-w-[680px] px-6 py-16 text-center">
        <p className="text-sm text-ink-muted">
          {t("events.eventNotFound")}
        </p>
        <Link
          href="/community?tab=events"
          className="mt-3 inline-block text-sm font-semibold text-primary"
        >
          {t("circles.backToCommunity")}
        </Link>
      </div>
    );
  }

  // Events are BC-based; render in Pacific so the time is correct
  // (the stored datetime is the exact UTC instant).
  const TZ = "America/Vancouver";
  const date = new Date(event.eventDatetime);
  const dateLabel = date.toLocaleDateString(i18n.language, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: TZ,
  });
  const time = date.toLocaleTimeString(i18n.language, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TZ,
  });

  // Descriptions carry \n breaks (restored from the source); render each
  // non-empty chunk as its own paragraph.
  const paragraphs = event.description
    .split("\n")
    .map((para) => para.trim())
    .filter(Boolean);

  return (
    <div className="mx-auto max-w-[680px] px-6 py-6">
      {/* Pops history when the user actually came from /community, so this inherits the
          browser's native scroll restoration and returns them to where they were in the
          list. A plain <Link> is a forward navigation — it pushes an entry, so the list
          reloads at the top, which is the bug this fixes.

          The href stays real and is the fallback: on a deep link, a shared URL or a hard
          refresh there is no in-app entry to pop, and `?tab=events` still lands on the
          right tab. Keeping it an anchor also means no hydration branch on client-only
          state, and middle-click / ctrl-click keep working. The previous route must be
          exactly /community — coming from another event would otherwise pop sideways to
          that event rather than to the list this link names. */}
      <Link
        href="/community?tab=events"
        onClick={(e) => {
          // Let the browser own modified clicks (new tab/window, download).
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          if (getPreviousPathname() !== "/community") return;
          e.preventDefault();
          router.back();
        }}
        className="mb-4 inline-flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className={cn("h-4 w-4", RTL_FLIP)} aria-hidden />
        {t("tabs.community")}
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

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <Badge variant="primary">
          {t(EVENT_TYPE_LABEL_KEY[event.eventType])}
        </Badge>
        {/* Uncategorized is the untagged fallback, not a topic — nothing to show. */}
        {event.genre !== "Uncategorized" && (
          <Badge variant="neutral">
            {t(`events.genre.${event.genre.toLowerCase()}`)}
          </Badge>
        )}
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
            {t("events.hostedBy")}{" "}
            <span className="font-medium text-ink-secondary">
              {event.hostedBy}
            </span>
          </p>
        )}
      </div>

      {(() => {
        const safeExternalLink =
          event.externalLink &&
          (event.externalLink.startsWith("https://") ||
            event.externalLink.startsWith("http://"))
            ? event.externalLink
            : null;
        return (
          safeExternalLink && (
            <a
              href={safeExternalLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {t("events.viewDetails")}
              <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          )
        );
      })()}

      {paragraphs.length > 0 && (
        <>
          <h2 className="mt-7 text-base font-semibold text-ink-secondary">
            {t("events.aboutEvent")}
          </h2>
          <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink-muted">
            {paragraphs.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
