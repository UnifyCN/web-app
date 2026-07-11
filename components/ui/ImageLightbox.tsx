"use client";

import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { StorageImage } from "@/components/ui/StorageImage";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface ImageLightboxProps {
  open: boolean;
  images: string[];
  /** Index of the image currently shown (controlled by the parent). */
  index: number;
  /** Called with the new index when the user navigates prev/next. */
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** Used to build descriptive alt text (e.g. the post title). */
  alt?: string;
}

/**
 * Full-screen image viewer. Modeled on ConfirmModal's overlay pattern (fixed
 * inset, backdrop-click + ESC to dismiss, body scroll lock). For multi-image
 * posts it adds prev/next controls, ←/→ keyboard nav, and a position counter.
 * Fully controlled — the parent owns the active index — so there's no derived
 * state to sync.
 */
export function ImageLightbox({
  open,
  images,
  index,
  onIndexChange,
  onClose,
  alt,
}: ImageLightboxProps) {
  const { t } = useTranslation();
  const count = images.length;
  const multi = count > 1;

  const goPrev = useCallback(() => {
    onIndexChange((index - 1 + count) % count);
  }, [index, count, onIndexChange]);
  const goNext = useCallback(() => {
    onIndexChange((index + 1) % count);
  }, [index, count, onIndexChange]);

  // ESC closes; arrows navigate; body scroll locked while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (multi && event.key === "ArrowLeft") goPrev();
      else if (multi && event.key === "ArrowRight") goNext();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, multi, goPrev, goNext, onClose]);

  if (!open || count === 0) return null;

  const safeIndex = ((index % count) + count) % count;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4"
      onClick={onClose}
      role="presentation"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label={t("ui.closeImageViewerAria")}
        className="absolute right-4 top-4 z-10 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-ink/40 text-white transition-colors hover:bg-ink/60"
      >
        <X className="h-5 w-5" aria-hidden />
      </button>

      <div
        className="relative h-[85vh] w-[90vw] max-w-5xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={alt ?? t("ui.imageViewerAria")}
      >
        <StorageImage
          src={images[safeIndex]}
          alt={
            alt
              ? t("ui.imageOfAltTitled", {
                  title: alt,
                  number: safeIndex + 1,
                  count,
                })
              : t("ui.imageOfAlt", { number: safeIndex + 1, count })
          }
          className="absolute inset-0 h-full w-full object-contain"
        />

        {multi && (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label={t("ui.previousImageAria")}
              className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-ink/40 text-white transition-colors hover:bg-ink/60"
            >
              <ChevronLeft className="h-6 w-6" aria-hidden />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label={t("ui.nextImageAria")}
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-ink/40 text-white transition-colors hover:bg-ink/60"
            >
              <ChevronRight className="h-6 w-6" aria-hidden />
            </button>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-ink/50 px-3 py-1 text-xs font-medium text-white">
              {safeIndex + 1} / {count}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
