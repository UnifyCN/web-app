"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { type SupportedLanguage } from "@/lib/i18n/config";

/**
 * App-wide client providers: TanStack Query + i18n. `initialLocale` is resolved
 * server-side in the root layout so the first client render matches the SSR HTML.
 */
export function Providers({
  initialLocale,
  children,
}: {
  initialLocale: SupportedLanguage;
  children: React.ReactNode;
}) {
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
      <I18nProvider initialLocale={initialLocale}>{children}</I18nProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
