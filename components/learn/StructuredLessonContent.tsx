"use client";

import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { LessonSection } from "@/types/lessonSections";
import type { SanityBlock } from "@/types";
import { PortableTextRenderer } from "./PortableTextRenderer";

const labels = {
  lessonConcept: "concept",
  lessonExample: "example",
  lessonVisual: "visual",
  lessonQuickCheck: "quickCheck",
  lessonFaq: "faq",
  lessonCitations: "citations",
} as const;

// Sanity omits empty arrays and may carry section types this reader predates,
// so skip unknown types rather than render a blank, unlabelled section.
function isKnownSection(section: LessonSection): boolean {
  return section._type in labels;
}

/** True when at least one section can render; otherwise the page should use
 * its legacy `content` projection instead of showing an empty reader. */
export function hasRenderableSections(
  sections: LessonSection[] | undefined,
): sections is LessonSection[] {
  return (sections ?? []).some(isKnownSection);
}

export function StructuredLessonContent({
  sections,
  renderRich,
}: {
  sections: LessonSection[];
  renderRich: (blocks: SanityBlock[]) => ReactNode;
}) {
  const { t } = useTranslation();
  const known = sections.filter(isKnownSection);
  return (
    <div className="min-w-0 space-y-8">
      <nav
        aria-label={t("learn.structured.sections")}
        className="flex gap-2 overflow-x-auto py-2"
      >
        {known.map((section) => (
          <a
            key={section._key}
            href={`#section-${section._key}`}
            className="shrink-0 rounded-full bg-surface-gray px-4 py-3 text-sm text-ink-secondary focus-visible:outline-2 focus-visible:outline-primary"
          >
            {section.title || t(`learn.structured.${labels[section._type]}`)}
          </a>
        ))}
      </nav>
      {known.map((section, index) => (
        <section
          key={section._key}
          id={`section-${section._key}`}
          className="scroll-mt-24 space-y-3"
        >
          <h3 className="flex items-center gap-3 text-sm font-semibold text-ink-tertiary">
            <span className="flex size-6 items-center justify-center rounded-md bg-ink-secondary text-surface">
              {index + 1}
            </span>
            {section.title || t(`learn.structured.${labels[section._type]}`)}
          </h3>
          <SectionBody section={section} renderRich={renderRich} />
        </section>
      ))}
    </div>
  );
}

function SectionBody({
  section,
  renderRich,
}: {
  section: LessonSection;
  renderRich: (blocks: SanityBlock[]) => ReactNode;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"theory" | "practice">("theory");
  const [answer, setAnswer] = useState<string | null>(null);
  switch (section._type) {
    case "lessonConcept":
      return renderRich(section.content ?? []);
    case "lessonExample":
      return (
        <div className="space-y-3">
          <div className="flex rounded-xl bg-surface-gray p-1">
            {(["theory", "practice"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={tab === value}
                onClick={() => setTab(value)}
                className={`min-h-11 flex-1 rounded-lg px-4 text-sm ${tab === value ? "bg-surface" : ""}`}
              >
                {t(`learn.structured.${value}`)}
              </button>
            ))}
          </div>
          <div className="rounded-2xl bg-surface-card p-4">
            {renderRich(section[tab] ?? [])}
          </div>
        </div>
      );
    case "lessonVisual":
      return (
        <div className="space-y-3 rounded-2xl bg-surface-card p-4">
          {section.content?.length ? renderRich(section.content) : null}
          {section.image?.asset ? (
            <PortableTextRenderer
              value={[section.image as unknown as SanityBlock]}
            />
          ) : null}
          {section.caption ? (
            <p className="text-sm text-ink-muted">{section.caption}</p>
          ) : null}
        </div>
      );
    case "lessonQuickCheck": {
      const options = section.options ?? [];
      return (
        <fieldset className="min-w-0 space-y-3 rounded-2xl border border-border-card p-4">
          <legend className="max-w-full px-1 font-semibold text-ink-secondary">
            {section.question}
          </legend>
          {options.map((option) => (
            <label
              key={option._key}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border-card p-3 text-sm"
            >
              <input
                type="radio"
                name={`check-${section._key}`}
                checked={answer === option._key}
                onChange={() => setAnswer(option._key)}
              />
              {option.text}
            </label>
          ))}
          {answer ? (
            <div role="status">
              <p className="font-semibold">
                {t(
                  options.find((option) => option._key === answer)
                    ?.correct
                    ? "learn.structured.correct"
                    : "learn.structured.tryAgain",
                )}
              </p>
              <p className="mt-2 text-sm text-ink-muted">
                {section.explanation}
              </p>
            </div>
          ) : null}
        </fieldset>
      );
    }
    case "lessonFaq":
      return (
        <div className="space-y-3">
          {(section.items ?? []).map((item, index) => (
            <details
              key={item._key}
              open={index === 0 ? true : undefined}
              className="rounded-2xl border border-border-card p-4"
            >
              <summary className="min-h-11 cursor-pointer font-semibold text-ink-secondary">
                {item.question}
              </summary>
              <div className="pt-3">{renderRich(item.answer ?? [])}</div>
            </details>
          ))}
        </div>
      );
    case "lessonCitations":
      return (
        <ol className="space-y-3">
          {(section.sources ?? []).map((source, index) => (
            <li key={source._key} className="flex gap-3 text-sm">
              <span className="text-ink-muted">[{index + 1}]</span>
              <div>
                <p className="text-ink-muted">
                  {[source.publisher, source.year].filter(Boolean).join(" · ")}
                </p>
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
              </div>
            </li>
          ))}
        </ol>
      );
    default:
      return null;
  }
}
