import {
  PortableText,
  type PortableTextComponents,
  type PortableTextTypeComponentProps,
} from "@portabletext/react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { sanityImageUrl } from "@/lib/sanity";
import type { SanityBlock, SanityImage } from "@/types";

/**
 * Branded renderer for Sanity Portable Text. Handles standard blocks plus the
 * custom lesson content types (callout boxes, dropdowns, images, checklist
 * items) — see the `types` map below.
 */

const SAFE_PROTOCOL = /^https?:\/\//i;

/** Grey callout box with an uppercase label (example / tip / note). */
function CalloutBox({
  label,
  content,
}: {
  label: string;
  content?: SanityBlock[];
}) {
  return (
    <div className="rounded-card border border-border-card bg-surface-gray p-5">
      <p className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-secondary">
        {label}
      </p>
      <PortableTextRenderer value={content} />
    </div>
  );
}

/** Collapsible disclosure (native <details>). */
function DropdownBlock({
  label,
  content,
}: {
  label?: string;
  content?: SanityBlock[];
}) {
  return (
    <details className="rounded-card border border-border-card bg-surface-gray">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-ink-secondary">
        {label ?? "Details"}
      </summary>
      <div className="px-4 pb-4">
        <PortableTextRenderer value={content} />
      </div>
    </details>
  );
}

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
      // No colour — inherit from the surrounding context so bold links stay blue
      // (a hard colour here would override the link mark on bold-link text).
      <strong className="font-semibold">{children}</strong>
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
          className="font-semibold text-blue-600 underline underline-offset-2 hover:text-blue-800"
        >
          {children}
        </a>
      );
    },
  },
  types: {
    example_box: ({
      value,
    }: PortableTextTypeComponentProps<{ content?: SanityBlock[] }>) => (
      <CalloutBox label="Example" content={value.content} />
    ),
    tip_box: ({
      value,
    }: PortableTextTypeComponentProps<{ content?: SanityBlock[] }>) => (
      <CalloutBox label="Tip" content={value.content} />
    ),
    note_box: ({
      value,
    }: PortableTextTypeComponentProps<{ content?: SanityBlock[] }>) => (
      <CalloutBox label="Note" content={value.content} />
    ),
    dropdown: ({
      value,
    }: PortableTextTypeComponentProps<{
      label?: string;
      content?: SanityBlock[];
    }>) => <DropdownBlock label={value.label} content={value.content} />,
    image: ({
      value,
    }: PortableTextTypeComponentProps<SanityImage & { alt?: string }>) => {
      const url = sanityImageUrl(value, { width: 1200 });
      if (!url) return null;
      return (
        <Image
          src={url}
          alt={value.alt ?? ""}
          width={1200}
          height={800}
          className="h-auto w-full rounded-card"
        />
      );
    },
    checklist_checkbox: ({
      value,
    }: PortableTextTypeComponentProps<{ label?: string }>) => (
      <label className="flex items-start gap-2 text-sm leading-relaxed text-ink-secondary">
        <input
          type="checkbox"
          disabled
          className="mt-1 h-4 w-4 rounded border-border"
        />
        <span>{value.label}</span>
      </label>
    ),
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
    <div className={cn("space-y-3", className)}>
      <PortableText value={value} components={components} />
    </div>
  );
}
