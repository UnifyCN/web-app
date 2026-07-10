"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Full-screen scaffold for the auth screens (sign in / sign up / verify / reset /
 * consent). White background, centered single-column content, with an optional
 * back chevron in the top-left.
 */
export function AuthShell({
  backHref,
  children,
}: {
  backHref?: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-[100dvh] flex-col bg-surface px-6 pb-[calc(2.5rem_+_env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="flex h-16 shrink-0 items-center">
          {backHref && (
            <Link
              href={backHref}
              aria-label={t("common.goBack")}
              className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-ink-secondary transition-all hover:-translate-x-0.5 hover:bg-surface-gray motion-reduce:transition-none motion-reduce:hover:translate-x-0"
            >
              <ChevronLeft className="h-6 w-6" aria-hidden />
            </Link>
          )}
        </div>
        <div className="flex flex-1 flex-col justify-center">
          {children}
        </div>
      </div>
    </main>
  );
}
