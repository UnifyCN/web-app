import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface Crumb {
  label: string;
  href?: string;
}

/** Simple breadcrumb trail — the last item is the current page. */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className="flex items-center gap-1 text-sm" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span key={item.label} className="flex items-center gap-1">
          {index > 0 && (
            <ChevronRight
              className="h-3.5 w-3.5 text-ink-placeholder"
              aria-hidden
            />
          )}
          {item.href ? (
            <Link
              href={item.href}
              className="text-ink-muted transition-colors hover:text-primary"
            >
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-ink-secondary">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
