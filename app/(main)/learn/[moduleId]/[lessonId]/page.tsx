import Image from "next/image";
import Link from "next/link";
import { Clock, ArrowRight } from "lucide-react";
import { Breadcrumb } from "@/components/learn/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { getModuleById } from "@/lib/mock/modules";

// TODO: replace with real data — Savar fills in the real lesson content.
const OBJECTIVES = [
  "Understand the key steps this lesson walks through.",
  "Know which documents and information to have ready.",
  "Feel confident taking the next action on your own.",
];

const KEY_TERMS = [
  {
    term: "Key term",
    definition: "A short, plain-language definition will go here.",
  },
  {
    term: "Second term",
    definition:
      "Definitions help newcomers learn the vocabulary they'll encounter.",
  },
  {
    term: "Third term",
    definition: "Savar will replace these with the lesson's real key terms.",
  },
];

export default async function LessonDetailPage({
  params,
}: {
  params: Promise<{ moduleId: string; lessonId: string }>;
}) {
  const { moduleId, lessonId } = await params;
  const mod = getModuleById(moduleId);
  const lesson = mod?.lessons.find((item) => item.id === lessonId);

  if (!mod || !lesson) {
    return (
      <div className="mx-auto max-w-[760px] px-6 py-16 text-center">
        <p className="text-sm text-ink-muted">
          This lesson could not be found.
        </p>
        <Link
          href="/learn"
          className="mt-3 inline-block text-sm font-semibold text-primary"
        >
          Back to Learn
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[760px] px-6 py-6">
      <Breadcrumb
        items={[
          { label: "Learn", href: "/learn" },
          { label: mod.title, href: `/learn/${mod.id}` },
          { label: lesson.title },
        ]}
      />

      <h1 className="mt-4 text-2xl font-bold text-ink-secondary">
        {lesson.title}
      </h1>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-placeholder">
        <Clock className="h-3.5 w-3.5" aria-hidden />
        45 min read
      </p>

      <div className="relative mt-4 aspect-[16/7] w-full overflow-hidden rounded-card">
        <Image
          src={lesson.imageUrl}
          alt=""
          fill
          priority
          className="object-cover"
          sizes="760px"
        />
      </div>

      <section className="mt-7">
        <h2 className="text-lg font-bold text-ink-secondary">
          By the end of this lesson, you should be able to:
        </h2>
        <ul className="mt-2 space-y-2">
          {OBJECTIVES.map((objective) => (
            <li
              key={objective}
              className="flex gap-2.5 text-sm leading-relaxed text-ink-muted"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              {objective}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-7">
        <h2 className="text-lg font-bold text-ink-secondary">Key Terms</h2>
        <dl className="mt-2 space-y-3">
          {KEY_TERMS.map((entry) => (
            <div key={entry.term}>
              <dt className="text-sm font-semibold text-ink-secondary">
                {entry.term}
              </dt>
              <dd className="mt-0.5 text-sm leading-relaxed text-ink-muted">
                {entry.definition}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* TODO: wire completion once lesson content is real. */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button type="button" variant="primary" size="lg">
          Mark as complete
        </Button>
        <Link
          href={`/learn/${mod.id}`}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-border-card bg-surface px-6 text-sm font-semibold text-ink-secondary transition-colors hover:bg-surface-gray focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Next
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
