"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { MoreHorizontal } from "lucide-react";
import { useIsRtl } from "@/hooks/useDirection";
import { cn } from "@/lib/utils";

export interface DropdownMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
}

/**
 * Kebab ("…") overflow menu. The trigger is an icon button; the menu is portaled
 * to <body> with fixed positioning so a card's overflow/rounded corners can't
 * clip it. Closes on outside-click, Escape, scroll/resize, or after an item is
 * chosen. Brand tokens only, motion kept minimal.
 */
export function DropdownMenu({
  items,
  ariaLabel,
  align = "end",
  className,
  triggerClassName,
  triggerContent,
}: {
  items: DropdownMenuItem[];
  ariaLabel?: string;
  /** Which trigger edge the menu aligns to. */
  align?: "start" | "end";
  className?: string;
  /** Replace the default kebab trigger styling entirely (e.g. a labelled pill). */
  triggerClassName?: string;
  /** Replace the default "…" icon content of the trigger. */
  triggerContent?: ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const isRtl = useIsRtl();

  // Whether the menu's right edge pins to the trigger's right edge (vs its left
  // edge to the trigger's left). `align="end"` targets the trigger's *end* side —
  // right in LTR, left in RTL — so the physical right-alignment is (end XOR rtl).
  const rightAlign = (align === "end") !== isRtl;

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCoords({ top: r.bottom + 4, left: rightAlign ? r.right : r.left });
  }, [rightAlign]);

  // Position on open, then keep in sync with scroll/resize.
  useEffect(() => {
    if (!open) return;
    reposition();
    const onMove = () => reposition();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, reposition]);

  // Close on outside-click + Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel ?? t("ui.moreOptionsAria")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          triggerClassName ??
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-placeholder transition-colors hover:bg-surface-gray hover:text-ink",
          // The default kebab's active tint only applies when using default styling.
          !triggerClassName && open && "bg-surface-gray text-ink",
          className,
        )}
      >
        {triggerContent ?? <MoreHorizontal className="h-4 w-4" aria-hidden />}
      </button>

      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            className="fixed z-[60] min-w-44 overflow-hidden rounded-card border border-border-card bg-surface py-1 shadow-lg"
            style={{
              top: coords.top,
              left: coords.left,
              transform: rightAlign ? "translateX(-100%)" : undefined,
            }}
          >
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3.5 py-2 text-start text-sm transition-colors hover:bg-surface-gray",
                  item.destructive ? "text-destructive" : "text-ink-secondary",
                )}
              >
                {item.icon && (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {item.icon}
                  </span>
                )}
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
