/**
 * Shared "assistant is typing" indicator for the document builders (Resume
 * Builder + Cover Letter Generator). Three pulsing dots in a bordered bubble.
 * Extracted verbatim from the per-feature chat columns — keep the classNames
 * and the staggered animation delays byte-identical.
 */
export function TypingIndicator() {
  return (
    <div className="mt-4 flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl border border-border-card bg-surface px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-ink-inactive"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
