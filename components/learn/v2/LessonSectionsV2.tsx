"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import {
  knownSections,
  lessonPresentation,
} from "@/lib/learn/v2/contentBlocks";
import type { LessonSection } from "@/types/lessonSections";
import type { SanityBlock } from "@/types";
import { cn } from "@/lib/utils";
import { PortableTextRenderer } from "@/components/learn/PortableTextRenderer";

const LABELS = {
  lessonConcept: "concept",
  lessonExample: "example",
  lessonVisual: "visual",
  lessonQuickCheck: "quickCheck",
  lessonFaq: "faq",
  lessonCitations: "citations",
} as const;

/**
 * A lesson step's sections, v2 (Figma 160:889; mobile `StructuredLesson`):
 * section pills that jump to each section (Quick check is not in the pills, as
 * on mobile), then numbered sections. Example has Theory / In practice tabs,
 * FAQs start closed with one open at a time. Rich text goes through
 * `renderRich` so highlights and Ask AI keep working.
 */
export function LessonSectionsV2({
  sections: raw,
  renderRich,
}: {
  sections: LessonSection[];
  renderRich: (blocks: SanityBlock[]) => ReactNode;
}) {
  const { t } = useTranslation();
  const { sections, citationContent } = useMemo(
    () => lessonPresentation(knownSections(raw)),
    [raw],
  );
  const pills = useMemo(
    () => sections.filter((s) => s._type !== "lessonQuickCheck"),
    [sections],
  );
  const [active, setActive] = useState<string | undefined>(pills[0]?._key);
  const label = (s: LessonSection) =>
    s.title || t(`learn.structured.${LABELS[s._type]}`);

  // Highlight the pill of the section being read.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible[0])
          setActive(visible[0].target.getAttribute("data-key") ?? undefined);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    for (const s of pills) {
      const el = document.getElementById(`section-${s._key}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [pills]);

  return (
    <div className="min-w-0">
      {pills.length > 1 && (
        <nav
          aria-label={t("learn.structured.sections")}
          className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0"
        >
          {pills.map((s) => (
            <a
              key={s._key}
              href={`#section-${s._key}`}
              onClick={() => setActive(s._key)}
              aria-current={active === s._key || undefined}
              className={cn(
                "press inline-flex min-h-9 shrink-0 items-center rounded-full px-4 text-xs font-semibold md:min-w-28 md:justify-center",
                active === s._key
                  ? "bg-primary text-white"
                  : "bg-surface-gray text-ink-tertiary hover:text-ink",
              )}
            >
              {label(s)}
            </a>
          ))}
        </nav>
      )}
      <div className="flex flex-col gap-8">
        {sections.map((section, index) => (
          <section
            key={section._key}
            id={`section-${section._key}`}
            data-key={section._key}
            className="scroll-mt-24"
            aria-labelledby={
              section._type === "lessonQuickCheck"
                ? undefined
                : `section-title-${section._key}`
            }
          >
            {section._type !== "lessonQuickCheck" && (
              <h2
                id={`section-title-${section._key}`}
                className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-tertiary"
              >
                <span className="flex size-6 items-center justify-center rounded-md bg-ink-secondary text-xs text-surface">
                  {index +
                    1 -
                    sections
                      .slice(0, index)
                      .filter((s) => s._type === "lessonQuickCheck").length}
                </span>
                {label(section)}
              </h2>
            )}
            <SectionBody
              section={section}
              renderRich={renderRich}
              citationContent={
                section._type === "lessonCitations" ? citationContent : []
              }
            />
          </section>
        ))}
      </div>
    </div>
  );
}

function SectionBody({
  section,
  renderRich,
  citationContent,
}: {
  section: LessonSection;
  renderRich: (blocks: SanityBlock[]) => ReactNode;
  citationContent: SanityBlock[];
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"theory" | "practice">("theory");
  const [answer, setAnswer] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  switch (section._type) {
    case "lessonConcept":
      return (
        <div className="text-sm leading-6 text-ink-secondary">
          {renderRich(section.content)}
        </div>
      );
    case "lessonExample":
      return (
        <div className="flex max-w-xl flex-col gap-3">
          <div className="flex rounded-lg bg-surface-gray p-1" role="tablist">
            {(["theory", "practice"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={cn(
                  "min-h-9 flex-1 rounded-md px-4 text-xs",
                  tab === value
                    ? "bg-surface font-semibold text-ink-secondary shadow-sm"
                    : "text-ink-muted",
                )}
              >
                {t(`learn.structured.${value}`)}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            className="min-h-24 rounded-lg bg-surface-card p-4 text-sm leading-6"
          >
            {renderRich(section[tab] ?? [])}
          </div>
        </div>
      );
    case "lessonVisual":
      return (
        <div className="flex max-w-xl flex-col gap-3 rounded-lg bg-surface-card p-4">
          {section.content?.length ? renderRich(section.content) : null}
          {section.image?.asset ? (
            <PortableTextRenderer
              value={[section.image as unknown as SanityBlock]}
            />
          ) : null}
          {section.caption ? (
            <p className="rounded-md bg-surface px-3 py-2 text-sm text-ink-muted">
              {section.caption}
            </p>
          ) : null}
        </div>
      );
    case "lessonQuickCheck": {
      const chosen = section.options.find((o) => o._key === answer);
      return (
        <fieldset className="flex min-w-0 flex-col gap-2 rounded-lg border border-border-card p-4">
          <legend className="contents">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
              {section.title || t("learn.structured.quickCheck")}
            </span>
            <span className="mb-2 block text-sm font-semibold text-ink-secondary">
              {section.question}
            </span>
          </legend>
          {section.options.map((option) => (
            <label
              key={option._key}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm",
                answer === option._key
                  ? option.correct
                    ? "border-priority-optional bg-priority-optional-bg"
                    : "border-destructive bg-priority-do-now-bg"
                  : "border-border-card hover:bg-surface-card",
              )}
            >
              <input
                type="radio"
                className="accent-primary"
                name={`check-${section._key}`}
                checked={answer === option._key}
                onChange={() => setAnswer(option._key)}
              />
              {option.text}
            </label>
          ))}
          {chosen && (
            <div role="status" className="pt-1 text-sm">
              <p className="font-semibold text-ink-secondary">
                {t(
                  chosen.correct
                    ? "learn.structured.correct"
                    : "learn.structured.tryAgain",
                )}
              </p>
              {section.explanation && (
                <p className="mt-1 text-ink-muted">{section.explanation}</p>
              )}
            </div>
          )}
        </fieldset>
      );
    }
    case "lessonFaq":
      return (
        <div className="flex max-w-xl flex-col gap-2">
          {section.items.map((item) => {
            const open = openFaq === item._key;
            return (
              <div
                key={item._key}
                className={cn(
                  "rounded-lg border",
                  open ? "border-ink-secondary" : "border-border-card",
                )}
              >
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenFaq(open ? null : item._key)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-start text-sm font-semibold text-ink-secondary"
                >
                  {item.question}
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 transition-transform duration-150",
                      open && "rotate-180",
                    )}
                    aria-hidden
                  />
                </button>
                {open && (
                  <div className="px-4 pb-4 text-sm leading-6">
                    {renderRich(item.answer ?? [])}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    case "lessonCitations":
      return (
        <div className="flex flex-col gap-3 text-xs">
          {citationContent.length > 0 && renderRich(citationContent)}
          <ol className="flex flex-col gap-2">
            {section.sources.map((source, index) => (
              <li key={source._key} className="flex gap-3">
                <span className="text-ink-muted">[{index + 1}]</span>
                <span>
                  {source.publisher && (
                    <span className="block text-ink-secondary">
                      {source.publisher}
                    </span>
                  )}
                  {/^https?:\/\//i.test(source.url ?? "") ? (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-mention-blue underline underline-offset-2"
                    >
                      {source.title}
                    </a>
                  ) : (
                    <span>{source.title}</span>
                  )}
                  {source.year && (
                    <span className="text-ink-muted"> ({source.year})</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>
      );
    default:
      return null;
  }
}
