import { useQuery } from "@tanstack/react-query";
import { searchSocial } from "@/services/search";

/**
 * Social search results for a submitted term (posts / people / groups).
 * Disabled until there's a term. Cached for 2 min like mobile's search hooks,
 * so re-running the same search or switching tabs doesn't refetch.
 */
export function useSocialSearch(term: string) {
  return useQuery({
    queryKey: ["social-search", term],
    queryFn: () => searchSocial(term),
    enabled: term.length > 0,
    staleTime: 2 * 60_000,
    gcTime: 5 * 60_000,
  });
}
