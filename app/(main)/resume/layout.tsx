/**
 * Route-level wrapper for the Resume Builder. `ph-no-capture` stops PostHog
 * autocapture from collecting element text (resume content, chat turns) anywhere
 * under /resume, including components added later. `contents` keeps the wrapper
 * out of layout. Portaled UI (modals, menus) escapes this node, so lib/posthog.ts
 * also drops autocapture events on these routes in `before_send`.
 */
export default function ResumeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="ph-no-capture contents">{children}</div>;
}
