/** Learn home personalisation card — greeting header. Search + filter
 * chips are hidden until the wiring lands (see BACKLOG ## Learn). */
export function WelcomeCard() {
  return (
    <div className="rounded-card border border-border-card bg-surface p-5">
      <p className="text-xs text-ink-placeholder">Welcome</p>
      <h2 className="text-lg font-bold text-ink-secondary">Your Name</h2>
    </div>
  );
}
