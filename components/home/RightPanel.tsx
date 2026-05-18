import { LearningProgressWidget } from "./LearningProgressWidget";
import { NationalNewsWidget } from "./NationalNewsWidget";

/**
 * Home right-hand widget column. Sits beside the feed on desktop and stacks
 * above it below the `lg` breakpoint (matches the tablet mockup).
 */
export function RightPanel() {
  return (
    <aside className="order-1 w-full space-y-4 lg:order-2 lg:w-80">
      <LearningProgressWidget />
      <NationalNewsWidget />
    </aside>
  );
}
