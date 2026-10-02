"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  EMPTY_FILTERS,
  filtersToParams,
  parseFilters,
  toggleFilter,
  type FilterGroup,
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

  // Updates build on the last query string this hook wrote, not on the render's
  // snapshot: while a `router.replace` is still pending, a second toggle would
  // otherwise start from the old URL and drop the first change.
  const latestParams = useRef(params.toString());
  useEffect(() => {
    latestParams.current = params.toString();
  }, [params]);

  const write = useCallback(
    (update: (base: URLSearchParams) => URLSearchParams) => {
      const search = update(new URLSearchParams(latestParams.current)).toString();
      latestParams.current = search;
      router.replace(search ? `${pathname}?${search}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router],
  );

  return {
    filters,
    query,
    setQuery: useCallback(
      (q: string) => write((base) => filtersToParams(base, parseFilters(base), q)),
      [write],
    ),
    toggle: useCallback(
      (group: FilterGroup, value: string) =>
        write((base) =>
          filtersToParams(base, toggleFilter(parseFilters(base), group, value)),
        ),
      [write],
    ),
    clearFilters: useCallback(
      () => write((base) => filtersToParams(base, EMPTY_FILTERS)),
      [write],
    ),
  };
}
