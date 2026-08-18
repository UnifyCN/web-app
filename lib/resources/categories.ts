import {
  Users,
  Briefcase,
  Stamp,
  BookOpen,
  HeartHandshake,
  Network,
  GraduationCap,
  ShieldCheck,
  Landmark,
  type LucideIcon,
} from "lucide-react";
import type { PartnerCategory, Cost } from "@/types";

/*
 * Category taxonomy for the Resources (Trusted Services) directory. Ported from
 * the mobile app (UnifyCN/mobile-app feat/resources-tab @ b7b5134 —
 * types/partner.ts), with two web adaptations:
 *   - i18n keys re-namespaced from `learn.resources.*` (mobile nests it under
 *     Learn) to top-level `resources.*` (web ships it as its own tab).
 *   - the MaterialCommunityIcons name map is replaced by a lucide-react
 *     component map.
 */

/** Fixed display order for the category grid. */
export const CATEGORY_ORDER: PartnerCategory[] = [
  "gettingSettled",
  "findWork",
  "immigrationHelp",
  "librariesLearning",
  "communityBelonging",
  "networksPlanning",
  "internationalStudents",
  "insurance",
  "money",
];

/** i18n keys — resolve with `t()` at render time, never render these directly. */
export const PARTNER_CATEGORY_LABEL_KEYS: Record<PartnerCategory, string> = {
  gettingSettled: "resources.category.gettingSettled.label",
  findWork: "resources.category.findWork.label",
  immigrationHelp: "resources.category.immigrationHelp.label",
  librariesLearning: "resources.category.librariesLearning.label",
  communityBelonging: "resources.category.communityBelonging.label",
  networksPlanning: "resources.category.networksPlanning.label",
  internationalStudents: "resources.category.internationalStudents.label",
  insurance: "resources.category.insurance.label",
  money: "resources.category.money.label",
};

/** i18n keys — resolve with `t()` at render time, never render these directly. */
export const PARTNER_CATEGORY_DESCRIPTION_KEYS: Record<PartnerCategory, string> =
  {
    gettingSettled: "resources.category.gettingSettled.description",
    findWork: "resources.category.findWork.description",
    immigrationHelp: "resources.category.immigrationHelp.description",
    librariesLearning: "resources.category.librariesLearning.description",
    communityBelonging: "resources.category.communityBelonging.description",
    networksPlanning: "resources.category.networksPlanning.description",
    internationalStudents:
      "resources.category.internationalStudents.description",
    insurance: "resources.category.insurance.description",
    money: "resources.category.money.description",
  };

/** lucide-react icon per category (web equivalent of mobile's MCI names). */
export const PARTNER_CATEGORY_ICONS: Record<PartnerCategory, LucideIcon> = {
  gettingSettled: Users,
  findWork: Briefcase,
  immigrationHelp: Stamp,
  librariesLearning: BookOpen,
  communityBelonging: HeartHandshake,
  networksPlanning: Network,
  internationalStudents: GraduationCap,
  insurance: ShieldCheck,
  money: Landmark,
};

/**
 * Accent color per category (tiles, monograms, pills, highlight checks).
 * Ported verbatim from mobile so the two apps read as one system.
 */
export const PARTNER_CATEGORY_COLORS: Record<PartnerCategory, string> = {
  gettingSettled: "#2DB39A",
  findWork: "#3B82C4",
  immigrationHelp: "#E5685A",
  librariesLearning: "#7C6CD6",
  communityBelonging: "#F68B26",
  networksPlanning: "#5B6B8A",
  internationalStudents: "#C25D8F",
  insurance: "#3E9B63",
  money: "#C8941F",
};

/** Soft tint per category (pill backgrounds, gradient fallback). */
export const PARTNER_CATEGORY_TINTS: Record<PartnerCategory, string> = {
  gettingSettled: "#EAF7F0",
  findWork: "#EAF1FA",
  immigrationHelp: "#FCEDEB",
  librariesLearning: "#EFEDFB",
  communityBelonging: "#FDF1E4",
  networksPlanning: "#EDEFF4",
  internationalStudents: "#FAEDF3",
  insurance: "#EAF6EF",
  money: "#FBF3E3",
};

/** i18n keys — resolve with `t()` at render time. */
export const COST_LABEL_KEYS: Record<Cost, string> = {
  free: "resources.cost.free",
  paid: "resources.cost.paid",
  mixed: "resources.cost.mixed",
};
