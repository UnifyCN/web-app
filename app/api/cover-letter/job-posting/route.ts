import { createJobPostingHandler } from "@/lib/jobPosting/handler";
import { COVER_LETTER_DAILY_MESSAGE_LIMIT } from "@/lib/coverLetter/schema";

/**
 * Job-posting import for the Cover Letter Generator. Soft-gated on the
 * cover-letter quota (`cover_letter_usage`), not the resume one; the
 * fetch/extraction lives in lib/jobPosting/handler.ts.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

export const POST = createJobPostingHandler({
  usageTable: "cover_letter_usage",
  dailyLimit: COVER_LETTER_DAILY_MESSAGE_LIMIT,
  limitMessage: "Daily cover-letter limit reached.",
});
