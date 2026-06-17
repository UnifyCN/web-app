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
    // Hold the resolved URL fresh for almost the whole signed-URL lifetime
    // (TTL minus the re-sign buffer), so navigation doesn't re-resolve avatars /
    // post images every 30s. The in-module urlCache still re-signs precisely
    // REFRESH_BUFFER_MS before the real X-Amz-Expires.
    staleTime: DEFAULT_TTL_MS - REFRESH_BUFFER_MS,
    retry: 1,
  });

  return {
    url: query.data,
    hasSource: !!source,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
