"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { UnifyLogo } from "@/components/UnifyLogo";
import { AuthButton } from "@/components/auth/AuthButton";
import {
  ChecklistGraphic,
  CommunityGraphic,
  CompanionGraphic,
  LearnGraphic,
} from "@/components/auth/welcome/SlideGraphics";
import { cn } from "@/lib/utils";

const SLIDES = [
  {
    graphic: <CommunityGraphic />,
    title: "Belonging Starts Here",
    body: "Join city-based and topic-based groups, discover events, and connect with people going through similar experiences.",
  },
  {
    graphic: <ChecklistGraphic />,
    title: "Know What to Do Next",
    body: "Get a personalized settlement checklist for your situation, and move forward step-by-step with more clarity and less stress.",
  },
  {
    graphic: <CompanionGraphic />,
    title: "Get Answers You Can Trust",
    body: "Ask questions in the moment and get personalized, practical guidance grounded in trusted Canadian sources.",
  },
  {
    graphic: <LearnGraphic />,
    title: "Settle In With Confidence",
    body: "Explore Unify's simple lessons and trusted resources on immigration, housing, finances, work, and everyday life in Canada.",
  },
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
    <main className="flex min-h-screen flex-col bg-surface px-6 pb-10">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="flex h-16 shrink-0 items-center justify-between">
          {step > 0 ? (
            <button
              type="button"
              onClick={goBack}
              aria-label="Back"
              className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-ink-secondary transition-all hover:-translate-x-0.5 hover:bg-surface-gray motion-reduce:transition-none motion-reduce:hover:translate-x-0"
            >
              <ChevronLeft className="h-6 w-6" aria-hidden />
            </button>
          ) : (
            <span />
          )}
          {!isCta && (
            <button
              type="button"
              onClick={() => go(SLIDES.length)}
              className="text-sm font-medium text-ink-muted transition-colors hover:text-ink"
            >
              Skip
            </button>
          )}
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
                    Start Building Your Life in Canada
                  </h1>
                  <p className="mt-4 text-base leading-relaxed text-ink-muted">
                    Connect with fellow newcomers, learn essential skills, and
                    build your community — all in one place.
                  </p>
                </div>
                <div className="space-y-3">
                  <AuthButton onClick={() => router.push("/signup")}>
                    Create My Account
                  </AuthButton>
                  <Link
                    href="/login"
                    className="flex h-14 w-full items-center justify-center rounded-full border border-border-card bg-surface text-base font-semibold text-ink transition-colors hover:bg-surface-gray"
                  >
                    Log In
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
                    {SLIDES[step].title}
                  </h1>
                  <p className="mx-auto mt-4 max-w-sm text-base leading-relaxed text-ink-muted">
                    {SLIDES[step].body}
                  </p>
                </div>
                <div className="mt-8 space-y-6">
                  <AuthButton onClick={goNext}>Continue</AuthButton>
                  <div className="flex items-center justify-center gap-2">
                    {SLIDES.map((slide, i) => (
                      <span
                        key={slide.title}
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
