import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types";

interface MessageBubbleProps {
  message: ChatMessage;
  groupedWithPrev: boolean;
  groupedWithNext: boolean;
}

/** A single chat message — user (right) or AI (left), with grouped radii. */
export function MessageBubble({
  message,
  groupedWithPrev,
  groupedWithNext,
}: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex animate-message-in",
        isUser ? "justify-end" : "justify-start",
        groupedWithPrev ? "mt-1" : "mt-4",
      )}
    >
      <div className="max-w-[80%]">
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isUser
              ? "bg-primary-light text-white"
              : "bg-surface-chatbot text-ink-secondary",
            isUser && groupedWithPrev && "rounded-tr-md",
            isUser && groupedWithNext && "rounded-br-md",
            !isUser && groupedWithPrev && "rounded-tl-md",
            !isUser && groupedWithNext && "rounded-bl-md",
          )}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>

        {message.sources && message.sources.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {message.sources.map((source) => (
              <a
                key={`${source.url}-${source.title}`}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-surface-gray px-2 py-0.5 text-xs text-ink-muted transition-colors hover:text-primary"
              >
                <ExternalLink className="h-3 w-3" aria-hidden />
                {source.title}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
