import { cn } from "@/lib/utils";
import { LearningProgressWidget } from "./LearningProgressWidget";
import { NationalNewsWidget } from "./NationalNewsWidget";

/** Stable ids for the phone-width Feed / News / Learning section tabs on the
 *  home page. Owned here (not the page) so both sides share one type. */
export const MOBILE_SECTIONS = ["feed", "news", "learning"] as const;
export type MobileSection = (typeof MOBILE_SECTIONS)[number];

/**
 * Home right-hand widget column. Sits beside the feed on desktop and stacks
 * above it below the `lg` breakpoint (matches the tablet mockup).
 *
 * On phones the home page splits Feed / News / Learning into tabs (the stacked
 * column buried the feed). `mobileSection` is the stable section id from the
 * home page ("feed" | "news" | "learning" — never a translated label) and
 * selects which widget shows below the `md` breakpoint; both are always visible
 * at `md+`. When the prop is omitted the column behaves exactly as before
 * (both widgets, all breakpoints).
 */
export function RightPanel({
  mobileSection,
}: {
  mobileSection?: MobileSection;
}) {
  const asideMobile = mobileSection === "feed" ? "hidden" : "block";
  const learningMobile = mobileSection && mobileSection !== "learning" ? "hidden" : "block";
  const newsMobile = mobileSection && mobileSection !== "news" ? "hidden" : "block";

  return (
    <aside
      className={cn(
        "order-1 w-full space-y-4 md:block lg:order-2 lg:w-80",
        asideMobile,
      )}
    >
      <div className={cn("md:block", learningMobile)}>
        <LearningProgressWidget />
      </div>
      <div className={cn("md:block", newsMobile)}>
        <NationalNewsWidget />
      </div>
    </aside>
  );
}
