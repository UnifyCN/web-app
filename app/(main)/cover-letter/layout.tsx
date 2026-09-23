/**
 * Route-level wrapper for the Cover Letter Generator. `ph-no-capture` stops
 * PostHog autocapture from collecting element text (letter content, chat turns)
 * anywhere under /cover-letter, including components added later. `contents`
 * keeps the wrapper out of layout. Portaled UI (modals, menus) escapes this node,
 * so lib/posthog.ts also drops autocapture events on these routes in `before_send`.
 */
export default function CoverLetterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="ph-no-capture contents">{children}</div>;
}
