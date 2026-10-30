"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import { cn } from "@/lib/utils";

/**
 * Province gate for every module route (module, submodule, lesson, practice),
 * as on mobile (PR #347): a module for another province sends the user back
 * to Learn. Pages render underneath while the check runs, so their data still
 * loads in parallel, but stay hidden until the module is known to be allowed.
 */
export default function ModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { moduleId } = useParams<{ moduleId: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { access, lookupFailed, retry } = useModuleAccess(moduleId);

  useEffect(() => {
    if (access === "denied") router.replace("/learn");
  }, [access, router]);

  const allowed = access === "allowed";
  return (
    <>
      <div
        className={cn(!allowed && "invisible")}
        inert={!allowed}
        aria-hidden={!allowed || undefined}
      >
        {children}
      </div>
      {lookupFailed && (
        <div
          role="alert"
          className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-surface p-6 text-center"
        >
          <p className="text-sm text-ink-secondary">{t("common.errorGeneric")}</p>
          <button
            type="button"
            onClick={retry}
            className="press min-h-11 px-3 text-sm font-semibold text-ink"
          >
            {t("common.retry")}
          </button>
          <button
            type="button"
            onClick={() => router.replace("/learn")}
            className="press min-h-11 px-3 text-sm font-medium text-primary"
          >
            {t("common.goBackToLearn")}
          </button>
        </div>
      )}
    </>
  );
}
