/**
 * The Companion topic labels (spec UnifyCN/mobile-app#314; list approved by
 * Savar 2026-10-21). The one source of truth: rag-query's classifier
 * (rag-query/lib/topic.ts) and the web client (lib/companionAnalytics.ts)
 * both import it.
 *
 * Keep this file free of imports and runtime APIs so both Deno and the
 * Next.js build can compile it.
 */
export const TOPICS = [
  'immigration',
  'work',
  'housing',
  'money',
  'taxes',
  'health',
  'education',
  'transportation',
  'settling_in',
  'other',
] as const;

export type Topic = (typeof TOPICS)[number];
