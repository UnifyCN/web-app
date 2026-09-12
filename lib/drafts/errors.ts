/**
 * Shared error classes for the draft-backed document features (Resume Builder,
 * Cover Letter Generator). Kept in one place so both services — and the UI that
 * does `instanceof` checks on them — import the SAME class identity.
 *
 * The daily-limit / busy errors stay per-feature (ResumeLimitError,
 * CoverLetterLimitError, …) because the UI maps them to feature-specific copy;
 * only `JobPostingError`, which is genuinely shared (the job-posting endpoint is
 * feature-neutral), lives here.
 */

/**
 * Raised when fetching/extracting a job posting fails. `code` mirrors the route's
 * error contract (`invalid_url` | `blocked_url` | `fetch_failed` | `too_large` |
 * `extraction_failed` | `generic`) so the UI can show a specific, localized
 * message and steer the user to the paste-text fallback.
 */
export class JobPostingError extends Error {
  code: string;
  constructor(code: string) {
    super(`Job posting fetch failed: ${code}`);
    this.name = "JobPostingError";
    this.code = code;
  }
}
