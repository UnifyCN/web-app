import type { LearnModuleView } from "@/types";
import {
  completionPercent,
  isResumable,
  lessonResumeHref,
  type LessonProgressRow,
} from "./progress";

/**
 * Derived data for the v2 Learn home. Pure, so it is tested without React.
 * `courses` is the province-filtered list from `getModules`, so anything for
 * another province (rows, resume cards) drops out here too, as on mobile.
 */

export interface CourseSummary {
  course: LearnModuleView;
  moduleCount: number;
  lessonCount: number;
  /** Completed lessons / all lessons in the course (Figma percentage). */
  percent: number;
  /** The user has opened or finished at least one lesson, or the course has a
   * `learn_progress` status. Drives the "Started" filter. */
  started: boolean;
}

export function courseSummaries(
  courses: readonly LearnModuleView[],
  rows: readonly LessonProgressRow[],
): CourseSummary[] {
  const completed = new Set(
    rows.filter((r) => r.is_completed).map((r) => r.sanity_lesson_id),
  );
  const touched = new Set(
    rows
      .filter(
        (r) =>
          r.is_completed || r.is_in_progress || (r.completed_pages ?? 0) > 0,
      )
      .map((r) => r.sanity_lesson_id),
  );
  return courses.map((course) => {
    const lessonIds = (course.submodules ?? []).flatMap((s) =>
      (s.lessons ?? []).map((l) => l._id),
    );
    return {
      course,
      moduleCount: course.submodules?.length ?? 0,
      lessonCount: lessonIds.length,
      percent: completionPercent(lessonIds, completed),
      started:
        (course.status ?? "not_started") !== "not_started" ||
        lessonIds.some((id) => touched.has(id)),
    };
  });
}

export interface ResumeEntry {
  lessonId: string;
  lessonTitle: string;
  courseId: string;
  courseTitle: string;
  courseIcon?: string | null;
  submoduleId: string;
  /** 1-based position of the module in its course. */
  moduleNumber: number;
  /** 1-based position of the lesson in its module, and the module's size. */
  lessonNumber: number;
  lessonCount: number;
  /** The lesson's own progress, from the row. */
  percent: number;
  href: string;
}

/** Started, unfinished lessons, most recently opened first. */
export function resumeEntries(
  courses: readonly LearnModuleView[],
  rows: readonly LessonProgressRow[],
  limit = 3,
): ResumeEntry[] {
  const where = new Map<
    string,
    {
      course: LearnModuleView;
      submoduleId: string;
      moduleNumber: number;
      lessonNumber: number;
      lessonCount: number;
      lessonTitle: string;
    }
  >();
  for (const course of courses) {
    (course.submodules ?? []).forEach((sub, subIndex) => {
      const lessons = sub.lessons ?? [];
      lessons.forEach((lesson, lessonIndex) => {
        where.set(lesson._id, {
          course,
          submoduleId: sub._id,
          moduleNumber: subIndex + 1,
          lessonNumber: lessonIndex + 1,
          lessonCount: lessons.length,
          lessonTitle: lesson.title,
        });
      });
    });
  }
  return rows
    .filter(isResumable)
    .filter((r) => where.has(r.sanity_lesson_id))
    .sort((a, b) =>
      (b.last_accessed_at ?? "").localeCompare(a.last_accessed_at ?? ""),
    )
    .slice(0, limit)
    .map((row) => {
      const at = where.get(row.sanity_lesson_id)!;
      return {
        lessonId: row.sanity_lesson_id,
        lessonTitle: at.lessonTitle,
        courseId: at.course._id,
        courseTitle: at.course.title,
        courseIcon: at.course.icon,
        submoduleId: at.submoduleId,
        moduleNumber: at.moduleNumber,
        lessonNumber: at.lessonNumber,
        lessonCount: at.lessonCount,
        percent: Math.round(row.progress_percent ?? 0),
        href: lessonResumeHref(
          {
            lessonId: row.sanity_lesson_id,
            submoduleId: at.submoduleId,
            moduleId: at.course._id,
          },
          row,
        ),
      };
    });
}
