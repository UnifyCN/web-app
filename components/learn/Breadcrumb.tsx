import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn, RTL_FLIP } from "@/lib/utils";

interface Crumb {
  label: string;
  href?: string;
}

/** Simple breadcrumb trail — the last item is the current page. */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  const { t } = useTranslation();
  return (
    <nav
      className="flex items-center gap-1 text-sm"
      aria-label={t("learnWeb.module.breadcrumbAria")}
    >
      {items.map((item, index) => (
        <span key={item.label} className="flex items-center gap-1">
          {index > 0 && (
            <ChevronRight
              className={cn("h-3.5 w-3.5 text-ink-placeholder", RTL_FLIP)}
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
