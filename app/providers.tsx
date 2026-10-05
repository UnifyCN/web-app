"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { type SupportedLanguage } from "@/lib/i18n/config";
import { useIsFirstLoad } from "@/hooks/useIsFirstLoad";

/**
 * App-wide client providers: TanStack Query + i18n. `initialLocale` is resolved
 * server-side in the root layout so the first client render matches the SSR HTML.
 * MotionConfig makes every Framer Motion animation drop movement and scale
 * (keeping fades) for people who ask their device to reduce motion.
 */
export function Providers({
  initialLocale,
  children,
}: {
  initialLocale: SupportedLanguage;
  children: React.ReactNode;
}) {
  // Mounted on every page, so this marks the end of the first load for the
  // whole app: entrance animations that skip the landing page play afterwards.
  useIsFirstLoad();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60_000, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <I18nProvider initialLocale={initialLocale}>{children}</I18nProvider>
      </MotionConfig>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
