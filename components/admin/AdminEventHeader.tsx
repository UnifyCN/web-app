"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase/client";

/** Back link, title, and subtitle at the top of the add and edit event pages. */
export function AdminEventHeader({
  title,
  subtitle,
  eyebrow,
}: {
  title: string;
  subtitle?: React.ReactNode;
  /** A small label above the title (e.g. a "From partners" badge). */
  eyebrow?: React.ReactNode;
}) {
  return (
    <>
      <Link
        href="/admin/events"
        className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-ink-muted transition-colors duration-200 hover:text-ink focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Events admin
      </Link>

      <header className="mt-3">
        {eyebrow && <div className="mb-2">{eyebrow}</div>}
        <h1 className="text-xl font-semibold break-words text-ink-secondary">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </header>

      {!isSupabaseConfigured() && (
        <p className="mt-4 rounded-lg border border-border-card bg-surface-card px-4 py-3 text-xs text-ink-muted">
          Supabase is not configured in this environment, so events cannot be
          loaded or saved.
        </p>
      )}
    </>
  );
}
