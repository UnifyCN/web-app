import type { CSSProperties } from "react";
import {
  BadgeCheck,
  Book,
  BookOpen,
  BookOpenText,
  Brain,
  Briefcase,
  Building2,
  Calculator,
  Clock,
  FileText,
  FlaskConical,
  Gamepad2,
  GraduationCap,
  Home,
  Landmark,
  Languages,
  Laptop,
  type LucideIcon,
  Music,
  Palette,
  Plane,
} from "lucide-react";

/** Sanity stores module icons as snake_case Material icon names. Map them to
 * the closest lucide equivalent so the web mirrors the mobile glyphs. */
const ICON_MAP: Record<string, LucideIcon> = {
  account_balance: Landmark,
  assignment_ind: BadgeCheck,
  cottage: Home,
  article: FileText,
  passport: Plane,
  school: GraduationCap,
  book: Book,
  work: Briefcase,
  computer: Laptop,
  business: Building2,
  science: FlaskConical,
  language: Languages,
  history: Clock,
  psychology: Brain,
  menu_book: BookOpen,
  auto_stories: BookOpenText,
  calculate: Calculator,
  palette: Palette,
  music_note: Music,
  sports_esports: Gamepad2,
};

interface ModuleIconProps {
  icon: string | null | undefined;
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
}

export function ModuleIcon({
  icon,
  className,
  style,
  strokeWidth,
}: ModuleIconProps) {
  const Icon = (icon && ICON_MAP[icon]) || BookOpen;
  return (
    <Icon
      className={className}
      style={style}
      strokeWidth={strokeWidth}
      aria-hidden
    />
  );
}
