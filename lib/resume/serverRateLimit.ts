/**
 * Server-side daily message backstop for the resume builder.
 *
 * The user-facing cap lives in localStorage (services/resume.ts), which a caller
 * could clear or bypass by hitting /api/resume directly. This module adds a
 * server-enforced per-user daily counter so a single authenticated user can't
 * spend the shared OpenRouter budget without bound.
 *
 * PROTOTYPE SCOPE: the counter is process-local (a module-level Map). It is not
 * shared across serverless instances and resets on cold start, so it's a soft
 * backstop against runaway usage — not a hard, cluster-wide guarantee. The
 * production form is a Supabase quota RPC keyed by user + date (mirroring the
 * chatbot's check_and_increment_chatbot_usage), landed alongside the real
 * resume_drafts table — see app/api/resume/route.ts + the resume-chat edge fn.
 */

import { RESUME_DAILY_MESSAGE_LIMIT } from "./schema";

interface Counter {
  /** Local calendar date "YYYY-MM-DD". */
  date: string;
  count: number;
}

const counters = new Map<string, Counter>();

function localDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Atomically check + increment the caller's daily count. Returns false when the
 * limit is already reached (the caller should respond 429 without generating).
 * Node route handlers are single-threaded per event-loop tick, so the
 * read-modify-write here is effectively atomic within an instance.
 */
export function checkAndIncrementResumeUsage(userId: string): boolean {
  const date = localDate();
  const current = counters.get(userId);
  if (!current || current.date !== date) {
    counters.set(userId, { date, count: 1 });
    return true;
  }
  if (current.count >= RESUME_DAILY_MESSAGE_LIMIT) return false;
  current.count += 1;
  return true;
}
