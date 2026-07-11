import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface CarouselDotsProps {
  count: number;
  active: number;
  onSelect?: (index: number) => void;
  className?: string;
}

export function CarouselDots({
  count,
  active,
  onSelect,
  className,
}: CarouselDotsProps) {
  const { t } = useTranslation();
  if (count <= 1) return null;
  return (
    <div className={cn("flex items-center justify-center gap-1.5", className)}>
      {Array.from({ length: count }).map((_, i) => {
        const isActive = i === active;
        const label = t("learnWeb.home.goToSlide", { number: i + 1 });
        return (
          <button
            key={i}
            type="button"
            aria-label={label}
            aria-current={isActive ? "true" : undefined}
            onClick={onSelect ? () => onSelect(i) : undefined}
            className={cn(
              "h-1.5 rounded-full transition-all duration-200",
              onSelect ? "cursor-pointer" : "cursor-default",
              isActive
                ? "w-6 bg-ink-tertiary"
                : "w-1.5 bg-ink-inactive hover:bg-ink-placeholder",
            )}
          />
        );
      })}
    </div>
  );
}
