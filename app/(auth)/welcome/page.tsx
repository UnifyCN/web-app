"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { UnifyLogo } from "@/components/UnifyLogo";
import { AuthButton } from "@/components/auth/AuthButton";
import { LanguagePicker } from "@/components/LanguagePicker";
import {
  ChecklistGraphic,
  CommunityGraphic,
  CompanionGraphic,
  LearnGraphic,
} from "@/components/auth/welcome/SlideGraphics";
import { cn } from "@/lib/utils";

const SLIDES = [
  { graphic: <CommunityGraphic />, titleKey: "welcomeCarousel.slide1Title", bodyKey: "welcomeCarousel.slide1Body" },
  { graphic: <ChecklistGraphic />, titleKey: "welcomeCarousel.slide2Title", bodyKey: "welcomeCarousel.slide2Body" },
  { graphic: <CompanionGraphic />, titleKey: "welcomeCarousel.slide3Title", bodyKey: "welcomeCarousel.slide3Body" },
  { graphic: <LearnGraphic />, titleKey: "welcomeCarousel.slide4Title", bodyKey: "welcomeCarousel.slide4Body" },
];

const slideVariants: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 32 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -32 }),
};

/** Pre-login carousel (4 slides) culminating in the welcome CTA — the entry the
 *  proxy routes signed-out visitors to. `?step=4` jumps straight to the CTA (so
 *  Back from /signup and /login lands there). */
function WelcomeScreen() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const { t } = useTranslation();
  const params = useSearchParams();
  const requested = Number(params.get("step"));
  const initialStep =
    Number.isInteger(requested) && requested >= 0 && requested <= SLIDES.length
      ? requested
      : 0;
  const [step, setStep] = useState(initialStep);
  const [direction, setDirection] = useState(0);
  const isCta = step === SLIDES.length;

  const go = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };
  const goNext = () => go(Math.min(step + 1, SLIDES.length));
  const goBack = () => go(Math.max(step - 1, 0));

  // Under reduced motion, fade only (no horizontal travel).
  const motionDir = reduce ? 0 : direction;

  return (
    <main className="flex min-h-[100dvh] flex-col bg-surface px-6 pb-[calc(2.5rem_+_env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="flex h-16 shrink-0 items-center justify-between">
          {step > 0 ? (
            <button
              type="button"
              onClick={goBack}
              aria-label={t("common.back")}
              className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-secondary transition-all hover:-translate-x-0.5 hover:bg-surface-gray motion-reduce:transition-none motion-reduce:hover:translate-x-0"
            >
              <ChevronLeft className="h-6 w-6" aria-hidden />
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-1">
            {!isCta && (
              <button
                type="button"
                onClick={() => go(SLIDES.length)}
                className="flex min-h-11 items-center px-2 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
              >
                {t("common.skip")}
              </button>
            )}
            <LanguagePicker />
          </div>
        </div>

        <AnimatePresence mode="wait" custom={motionDir} initial={false}>
          <motion.div
            key={step}
            custom={motionDir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="flex flex-1 flex-col"
          >
            {isCta ? (
              <>
                <div className="flex flex-1 flex-col items-center justify-center text-center">
                  <UnifyLogo variant="mark" size={120} priority />
                  <h1 className="mt-10 text-3xl font-bold text-ink">
                    {t("auth.welcome.title")}
                  </h1>
                  <p className="mt-4 text-base leading-relaxed text-ink-muted">
                    {t("auth.welcome.subtitle")}
                  </p>
                </div>
                <div className="space-y-3">
                  <AuthButton onClick={() => router.push("/signup")}>
                    {t("auth.welcome.createAccount")}
                  </AuthButton>
                  <Link
                    href="/login"
                    className="flex h-14 w-full items-center justify-center rounded-full border border-border-card bg-surface text-base font-semibold text-ink transition-colors hover:bg-surface-gray"
                  >
                    {t("auth.welcome.logIn")}
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-1 items-center justify-center py-4">
                  {SLIDES[step].graphic}
                </div>
                <div className="text-center">
                  <h1 className="text-3xl font-bold text-ink">
                    {t(SLIDES[step].titleKey)}
                  </h1>
                  <p className="mx-auto mt-4 max-w-sm text-base leading-relaxed text-ink-muted">
                    {t(SLIDES[step].bodyKey)}
                  </p>
                </div>
                <div className="mt-8 space-y-6">
                  <AuthButton onClick={goNext}>{t("common.continue")}</AuthButton>
                  <div className="flex items-center justify-center gap-2">
                    {SLIDES.map((slide, i) => (
                      <span
                        key={slide.titleKey}
                        className={cn(
                          "h-2 rounded-full transition-all",
                          i === step ? "w-6 bg-ink" : "w-2 bg-border-card",
                        )}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  );
}

export default function WelcomePage() {
  return (
    <Suspense>
      <WelcomeScreen />
    </Suspense>
  );
}
