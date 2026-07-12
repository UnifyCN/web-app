"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Blob } from "./Blob";
import { CarouselDots } from "./CarouselDots";
import { FavouriteButton } from "./FavouriteButton";
import { ModuleIcon } from "./ModuleIcon";

export interface ResumeEntry {
  moduleId: string;
  submoduleId: string;
  lessonId: string;
  moduleTitle: string;
  submoduleTitle: string;
  moduleIcon: string | null | undefined;
  colorHex: string;
  sectionNumber: number;
  totalSections: number;
  isFavourite: boolean;
}

interface ResumeHeroCarouselProps {
  entries: ResumeEntry[];
}

export function ResumeHeroCarousel({ entries }: ResumeHeroCarouselProps) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    slideRefs.current = slideRefs.current.slice(0, entries.length);
  }, [entries.length]);

  useEffect(() => {
    const root = trackRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (records) => {
        const visible = records
          .filter((r) => r.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const index = slideRefs.current.findIndex((el) => el === visible.target);
        if (index >= 0) setActive(index);
      },
      { root, threshold: [0.5, 0.75, 1] },
    );
    slideRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [entries]);

  function scrollTo(index: number) {
    const slide = slideRefs.current[index];
    if (!slide) return;
    slide.scrollIntoView({
      behavior: "smooth",
      inline: "start",
      block: "nearest",
    });
  }

  if (entries.length === 0) return null;

  return (
    <section aria-label={t("learnWeb.home.resumeLearningAria")}>
      <div
        ref={trackRef}
        className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto"
      >
        {entries.map((entry, i) => (
          <div
            key={entry.moduleId}
            ref={(el) => {
              slideRefs.current[i] = el;
            }}
            className="w-full shrink-0 snap-start"
          >
            <ResumeCard entry={entry} />
          </div>
        ))}
      </div>
      <CarouselDots
        count={entries.length}
        active={active}
        onSelect={scrollTo}
        className="mt-3"
      />
    </section>
  );
}

function ResumeCard({ entry }: { entry: ResumeEntry }) {
  const { t } = useTranslation();
  return (
    <div className="relative overflow-hidden rounded-card border border-border-card bg-surface p-5 shadow-sm">
      <Blob
        variant="blob-8"
        color={entry.colorHex}
        opacity={0.3}
        className="absolute -right-10 -top-16 z-0 h-64 aspect-[175/247]"
      />
      <div className="relative flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <ModuleIcon
              icon={entry.moduleIcon}
              className="h-9 w-9"
              style={{ color: entry.colorHex }}
              strokeWidth={1.75}
            />
            <FavouriteButton
              moduleId={entry.moduleId}
              isFavourite={entry.isFavourite}
              style={{ color: entry.colorHex }}
              size={20}
            />
          </div>
          <Link
            href={`/learn/${entry.moduleId}/${entry.submoduleId}/${entry.lessonId}`}
            className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-md px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: entry.colorHex }}
          >
            {t("common.continue")}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <div>
          <p className="text-xs text-ink-muted">
            {t("learnWeb.home.sectionOf", {
              module: entry.moduleTitle,
              current: entry.sectionNumber,
              total: entry.totalSections,
            })}
          </p>
          <h3 className="mt-1 text-lg font-bold leading-tight text-ink-secondary">
            {entry.submoduleTitle}
          </h3>
        </div>
      </div>
    </div>
  );
}
