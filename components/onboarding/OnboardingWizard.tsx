"use client";

import { useRouter } from "next/navigation";
import { UnifyLogo } from "@/components/UnifyLogo";
import { OnboardingFlow } from "./OnboardingFlow";

/**
 * First-run onboarding screen — full-screen, no sidebar (the proxy gates new
 * users here). On completion the proxy sets the `unify_onboarded` cookie on the
 * next request; `router.refresh()` re-runs it so the redirect resolves cleanly.
 */
export function OnboardingWizard() {
  const router = useRouter();

  const onComplete = () => {
    router.replace("/home");
    router.refresh();
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-primary-bg px-4 py-8">
      <div className="flex w-full max-w-xl flex-col">
        <div className="mb-5 flex justify-center">
          <UnifyLogo variant="lockup" size={40} priority />
        </div>
        <div className="flex max-h-[85vh] flex-col rounded-card border border-border-card bg-surface p-6 shadow-lg sm:p-8">
          <OnboardingFlow mode="onboard" onComplete={onComplete} />
        </div>
      </div>
    </main>
  );
}
