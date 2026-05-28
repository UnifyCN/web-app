import { PortableText, type PortableTextComponents } from "@portabletext/react";
import type { SanityBlock } from "@/types";

/**
 * Branded renderer for Sanity Portable Text. The Unify lesson content uses
 * standard blocks (paragraphs, bullets) today; custom block types (callouts,
 * images, dropdowns) can be added to `components` as content evolves.
 */

const SAFE_PROTOCOL = /^https?:\/\//i;

const components: PortableTextComponents = {
  block: {
    normal: ({ children }) => (
      <p className="text-sm leading-relaxed text-ink-secondary">{children}</p>
    ),
    h2: ({ children }) => (
      <h2 className="mt-6 text-lg font-semibold text-ink-secondary">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="mt-4 text-base font-semibold text-ink-secondary">
        {children}
      </h3>
    ),
    blockquote: ({ children }) => (
      <blockquote className="border-l-2 border-border-card pl-4 text-sm italic text-ink-muted">
        {children}
      </blockquote>
    ),
  },
  list: {
    bullet: ({ children }) => (
      <ul className="ml-5 list-disc space-y-1">{children}</ul>
    ),
    number: ({ children }) => (
      <ol className="ml-5 list-decimal space-y-1">{children}</ol>
    ),
  },
  listItem: {
    bullet: ({ children }) => (
      <li className="text-sm leading-relaxed text-ink-secondary">
        {children}
      </li>
    ),
    number: ({ children }) => (
      <li className="text-sm leading-relaxed text-ink-secondary">
        {children}
      </li>
    ),
  },
  marks: {
    strong: ({ children }) => (
      <strong className="font-semibold text-ink-secondary">{children}</strong>
    ),
    em: ({ children }) => <em className="italic">{children}</em>,
    code: ({ children }) => (
      <code className="rounded bg-surface-gray px-1 py-0.5 text-xs">
        {children}
      </code>
    ),
    link: ({ value, children }) => {
      const href = typeof value?.href === "string" ? value.href : "";
      // Reject non-http(s) URLs to prevent javascript:/data: links from CMS.
      if (!SAFE_PROTOCOL.test(href)) {
        return <span className="text-ink-muted">{children}</span>;
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:text-primary-dark"
        >
          {children}
        </a>
      );
    },
  },
  unknownType: ({ value }) => {
    if (process.env.NODE_ENV !== "production") {
      console.warn("PortableTextRenderer: unknown block type", value);
    }
    return null;
  },
};

interface PortableTextRendererProps {
  value: SanityBlock[] | undefined;
  className?: string;
}

export function PortableTextRenderer({
  value,
  className,
}: PortableTextRendererProps) {
  if (!value || value.length === 0) return null;
  return (
    <div className={className ?? "space-y-3"}>
      <PortableText value={value} components={components} />
    </div>
  );
}
