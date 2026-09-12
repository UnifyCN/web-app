/**
 * Shared chat bubble for the document builders (Resume Builder + Cover Letter
 * Generator). Both features use a structurally identical message shape, so the
 * bubble is generic over anything satisfying {@link DocumentChatMessage}.
 *
 * User turns are right-aligned orange bubbles; assistant turns are left-aligned
 * bordered cards. Extracted verbatim from the per-feature chat columns — the
 * classNames and DOM structure must stay byte-identical.
 */

/** The minimal message shape both document chat columns share. */
export interface DocumentChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggestions?: string[];
  createdAt: string;
}

export function Bubble({ message }: { message: DocumentChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="mt-4 flex animate-message-in justify-end">
        <div className="max-w-[85%] rounded-2xl bg-primary-light px-4 py-2.5 text-sm leading-relaxed text-white">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-4 flex animate-message-in justify-start">
      <div className="w-full rounded-2xl border border-border-card bg-surface px-4 py-3 shadow-sm">
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-secondary">
          {message.content}
        </p>
      </div>
    </div>
  );
}
