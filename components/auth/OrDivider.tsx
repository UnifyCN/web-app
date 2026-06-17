/** "or" rule shown between the email form and the SSO buttons. */
export function OrDivider() {
  return (
    <div className="my-6 flex items-center gap-4">
      <div className="h-px flex-1 bg-border-card" />
      <span className="text-sm text-ink-placeholder">or</span>
      <div className="h-px flex-1 bg-border-card" />
    </div>
  );
}
