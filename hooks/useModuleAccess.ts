import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getModuleProvince } from "@/services/learn";
import { useCurrentUser } from "@/hooks/useProfile";
import { MODULES_KEY } from "@/hooks/useLearn";
import { isVisibleForProvince, resolveUserProvince } from "@/lib/province";
import type { SanityModule } from "@/types";

export type ModuleAccess = "unknown" | "allowed" | "denied";

type ModuleProvince = Awaited<ReturnType<typeof getModuleProvince>>;

/** The module's province tag from any cached module list or module detail. */
function cachedModuleProvince(
  lists: [unknown, SanityModule[] | SanityModule | undefined][],
  moduleId: string,
): ModuleProvince | undefined {
  for (const [, data] of lists) {
    const found = Array.isArray(data)
      ? data.find((m) => m._id === moduleId)
      : data?._id === moduleId
        ? data
        : undefined;
    if (found) return { found: true, province: found.province ?? null };
  }
  return undefined;
}

/**
 * Whether the signed-in user may open a Learn module (mirrors mobile's
 * `useModuleAccess`, mobile PR #347).
 *
 * `access` is `unknown` while the profile or the module's tag is loading,
 * `denied` for a module tagged with another province, `allowed` otherwise. A
 * module that does not exist is `allowed`: the page keeps its own not-found
 * state. When the tag lookup fails, `access` stays `unknown` (unknown content
 * is never allowed) and `lookupFailed` is true until `retry()` runs.
 */
export function useModuleAccess(moduleId: string | undefined): {
  access: ModuleAccess;
  lookupFailed: boolean;
  retry: () => void;
} {
  const queryClient = useQueryClient();
  const { data: user, isPending: userPending } = useCurrentUser();

  const { data, isError, isFetching, refetch } = useQuery<ModuleProvince>({
    queryKey: ["module-province", moduleId],
    queryFn: () => getModuleProvince(moduleId!),
    enabled: !!moduleId,
    staleTime: 5 * 60_000,
    // A module opened from Learn is already in the cached list, so it needs
    // no extra request.
    initialData: () =>
      moduleId
        ? cachedModuleProvince(
            queryClient.getQueriesData<SanityModule[] | SanityModule>({
              queryKey: MODULES_KEY,
            }),
            moduleId,
          )
        : undefined,
  });

  const retry = () => {
    void refetch();
  };
  const lookupFailed = !!moduleId && !data && isError && !isFetching;

  let access: ModuleAccess;
  if (!moduleId) access = "allowed";
  else if (userPending || !data) access = "unknown";
  else if (!data.found) access = "allowed";
  else
    access = isVisibleForProvince(
      data.province,
      resolveUserProvince(user?.onboarding?.province),
    )
      ? "allowed"
      : "denied";
  return { access, lookupFailed, retry };
}
