import { useQuery } from "@tanstack/react-query";
import { resolveImageUrl } from "@/lib/supabase/imageStorage";

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
    staleTime: 30 * 1000,
    retry: 1,
  });

  return {
    url: query.data,
    hasSource: !!source,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
