import { createJobPostingHandler } from "@/lib/jobPosting/handler";
import { RESUME_DAILY_MESSAGE_LIMIT } from "@/lib/resume/schema";

/**
 * Job-posting import for the Resume Builder. Soft-gated on the resume quota
 * (`resume_usage`); the fetch/extraction lives in lib/jobPosting/handler.ts.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

export const POST = createJobPostingHandler({
  usageTable: "resume_usage",
  dailyLimit: RESUME_DAILY_MESSAGE_LIMIT,
  limitMessage: "Daily resume-builder limit reached.",
});
