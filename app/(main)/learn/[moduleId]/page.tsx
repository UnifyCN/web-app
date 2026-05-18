import Image from "next/image";
import Link from "next/link";
import { Breadcrumb } from "@/components/learn/Breadcrumb";
import { LessonRow } from "@/components/learn/LessonRow";
import { getModuleById } from "@/lib/mock/modules";

export default async function ModuleDetailPage({
  params,
}: {
  params: Promise<{ moduleId: string }>;
}) {
  const { moduleId } = await params;
  const mod = getModuleById(moduleId);

  if (!mod) {
    return (
      <div className="mx-auto max-w-[860px] px-6 py-16 text-center">
        <p className="text-sm text-ink-muted">
          This module could not be found.
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

  const total = mod.lessons.length;
  const done = mod.lessons.filter((lesson) => lesson.isCompleted).length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-[860px] px-6 py-6">
      <Breadcrumb
        items={[{ label: "Learn", href: "/learn" }, { label: mod.title }]}
      />

      <div className="mt-4 gap-6 sm:flex sm:items-center">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-ink-secondary">
            {mod.title}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            {mod.description}
          </p>
          <p className="mt-3 text-xs font-medium text-ink-tertiary">
            Progress: {done}/{total} lessons completed
          </p>
          <div className="mt-1.5 h-2 w-full max-w-xs overflow-hidden rounded-full bg-surface-input">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        <div className="relative mt-4 aspect-[16/10] w-full overflow-hidden rounded-card sm:mt-0 sm:w-64 sm:shrink-0">
          <Image
            src={mod.bannerUrl}
            alt=""
            fill
            className="object-cover"
            sizes="256px"
          />
        </div>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-bold text-ink-secondary">
        Lessons
      </h2>
      <div className="space-y-8">
        {mod.lessons.map((lesson) => (
          <LessonRow key={lesson.id} moduleId={mod.id} lesson={lesson} />
        ))}
      </div>
    </div>
  );
}
