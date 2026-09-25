"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  EMPTY_FILTERS,
  filtersToParams,
  parseFilters,
  toggleFilter,
  type FilterGroup,
  type ResourceFilters,
} from "@/lib/resources/filters";

/**
 * Resources search + filter state, stored in the URL (`q`, `format`, `loc`,
 * `elig`, `lang`, `cost`) so a filtered view is shareable and survives a
 * refresh. Updates use `router.replace` so typing/toggling doesn't flood the
 * history stack — Back leaves the page rather than stepping through every pill.
 */
export function useResourceFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters = useMemo(
    () => parseFilters(new URLSearchParams(params.toString())),
    [params],
  );
  const query = params.get("q") ?? "";

  const write = useCallback(
    (next: ResourceFilters, q?: string) => {
      const search = filtersToParams(
        new URLSearchParams(params.toString()),
        next,
        q,
      ).toString();
      router.replace(search ? `${pathname}?${search}` : pathname, {
        scroll: false,
      });
    },
    [params, pathname, router],
  );

  return {
    filters,
    query,
    setQuery: useCallback((q: string) => write(filters, q), [write, filters]),
    toggle: useCallback(
      (group: FilterGroup, value: string) =>
        write(toggleFilter(filters, group, value)),
      [write, filters],
    ),
    clearFilters: useCallback(() => write(EMPTY_FILTERS), [write]),
  };
}
