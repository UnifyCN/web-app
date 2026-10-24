// Prompt rules for facts that change: draw cutoffs, processing times, fees,
// deadlines, program openings and recent events. One wording per situation, so
// every prompt (with or without knowledge base context, and each query type)
// states the same rule. No staleness cutoff is applied: the model reports the
// date it is given and the user decides whether it is recent enough.

const TIME_SENSITIVE =
  'draw cutoffs and CRS scores, processing times, fees, deadlines, program openings or closures, and recent policy changes or news';

// The answer format for dates. Knowledge base entries and the profile already
// show their dates in this form, so the model can copy them as written.
const DATE_FORMAT =
  'Write every date in your answer as "Month D, YYYY" (for example "October 21, 2026"); never write a date as 2026-10-21. Copy a date as it is given to you: do not shift, guess or invent one.';

/** The prompt has knowledge base entries, each marked with its source date. */
export const CURRENT_FACTS_WITH_CONTEXT = `**CURRENT FACTS NEED A DATE**: Every knowledge base entry above is marked "(as of <date>)", the date of its source, or "(source date unknown)". For any time-sensitive fact (${TIME_SENSITIVE}), write the fact with "as of <date>", using the date of the entry you took it from. Never state such a fact without its date. An entry marked "(source date unknown)" cannot give an "as of" date: say its date is unknown. If no entry above supports a current number or a recent event the user asks about, say that current data is not available to you and point to the official source page. Never supply the number from memory. ${DATE_FORMAT}`;

/** The prompt has no knowledge base entries (no hits, or a mode without them). */
export const CURRENT_FACTS_WITHOUT_CONTEXT = `**CURRENT FACTS NEED A SOURCE**: You have no knowledge base entry with a source date for this answer. For any time-sensitive fact (${TIME_SENSITIVE}), do not give a number or an event from memory. Say that current data is not available to you, and point to the official source page (for example canada.ca/ircc, or the province's own immigration site). Stable public facts (rules that do not change month to month) can still be answered. ${DATE_FORMAT}`;

/** Lanes that answer without retrieval. */
export const CURRENT_FACTS_GENERAL = `If the user asks for a current immigration number or a recent event (${TIME_SENSITIVE}), do not answer from memory: say that current data is not available to you, and point to the official source page on canada.ca/ircc. ${DATE_FORMAT}`;
