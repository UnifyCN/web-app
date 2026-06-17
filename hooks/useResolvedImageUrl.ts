import { useQuery } from "@tanstack/react-query";
import {
  DEFAULT_TTL_MS,
  REFRESH_BUFFER_MS,
  resolveImageUrl,
} from "@/lib/supabase/imageStorage";

/**
 * Resolve a stored image reference (a `users/<uid>/…` key, or a pass-through
 * full URL) to a renderable signed URL, cached + deduped via React Query.
 * Mirrors the mobile app's `useResolvedAvatarUrl`. Disabled (no fetch) when
 * there's no source, so the caller renders its fallback immediately.
 */
export function useResolvedImageUrl(ref?: string | null) {
  const source = ref?.trim() || undefined;

  const query = useQuery({
    queryKey: ["resolved-image-url", source],
    enabled: !!source,
    queryFn: () => resolveImageUrl(source),
    // A resolved URL stays fresh for almost the whole signed-URL lifetime (TTL
    // minus the re-sign buffer), so navigation doesn't re-resolve avatars / post
    // images every 30s (the in-module urlCache re-signs precisely
    // REFRESH_BUFFER_MS before the real X-Amz-Expires). But resolveImageUrl
    // RESOLVES to null on a transient failure (it catches and returns null), so
    // give null a staleTime of 0 — otherwise a blank would be cached for 3+ min;
    // this way the next mount retries immediately.
    staleTime: (query) =>
      query.state.data ? DEFAULT_TTL_MS - REFRESH_BUFFER_MS : 0,
    retry: 1,
  });

  return {
    url: query.data,
    hasSource: !!source,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
