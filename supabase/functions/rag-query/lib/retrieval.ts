// Arguments for the match_chunks RPC. The vector comes from the raw question
// only: persona, arrival date and the rest of the profile personalise the
// ANSWER prompt, never the query vector or the filter. Province is the one
// profile field that decides which sources may be returned.
import { canonicalProvince } from './province.ts';

export const MATCH_THRESHOLD = 0.3;
export const MATCH_COUNT = 10;

export type RetrievalArgs = {
  query_embedding: number[];
  match_threshold: number;
  match_count: number;
  /** One of the 13 canonical names, or an explicit null (national sources only). */
  filter_province: string | null;
};

export function buildRetrievalArgs(
  queryEmbedding: number[],
  profile: Record<string, unknown> | null
): RetrievalArgs {
  return {
    query_embedding: queryEmbedding,
    match_threshold: MATCH_THRESHOLD,
    match_count: MATCH_COUNT,
    filter_province: canonicalProvince(profile?.province),
  };
}
