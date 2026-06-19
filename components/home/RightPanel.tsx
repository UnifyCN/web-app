import { cn } from "@/lib/utils";
import { LearningProgressWidget } from "./LearningProgressWidget";
import { NationalNewsWidget } from "./NationalNewsWidget";

/**
 * Home right-hand widget column. Sits beside the feed on desktop and stacks
 * above it below the `lg` breakpoint (matches the tablet mockup).
 *
 * On phones the home page splits Feed / News / Learning into tabs (the stacked
 * column buried the feed). `mobileSection` selects which widget shows below the
 * `md` breakpoint; both are always visible at `md+`. When the prop is omitted the
 * column behaves exactly as before (both widgets, all breakpoints).
 */
export function RightPanel({ mobileSection }: { mobileSection?: string }) {
  const asideMobile = mobileSection === "Feed" ? "hidden" : "block";
  const learningMobile = mobileSection && mobileSection !== "Learning" ? "hidden" : "block";
  const newsMobile = mobileSection && mobileSection !== "News" ? "hidden" : "block";

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
