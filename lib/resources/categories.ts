import type { PartnerCategory, Cost } from "@/types";

/*
 * Category taxonomy for the Resources (Trusted Services) directory. Ported from
 * the mobile app (UnifyCN/mobile-app feat/resources-tab @ b7b5134 —
 * types/partner.ts), with two web adaptations:
 *   - i18n keys re-namespaced from `learn.resources.*` (mobile nests it under
 *     Learn) to top-level `resources.*` (web ships it as its own tab).
 *   - category glyphs are the Figma/mobile SVGs in public/resources/icons.
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

/**
 * Accent color per category (monograms, category pills, primary action button).
 * Mobile's AA-safe values (types/partner.ts PARTNER_CATEGORY_COLORS): white
 * button text on each clears 4.5:1.
 */
export const PARTNER_CATEGORY_COLORS: Record<PartnerCategory, string> = {
  gettingSettled: "#167A69",
  findWork: "#2563A5",
  immigrationHelp: "#B8463B",
  librariesLearning: "#6352B5",
  communityBelonging: "#A64F00",
  networksPlanning: "#465570",
  internationalStudents: "#963F6D",
  insurance: "#287447",
  money: "#7D5A0B",
};

/** Soft tint per category (category pill backgrounds). */
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

/**
 * Square chip behind each category glyph on the category grid (Figma 8681:503;
 * mobile PARTNER_CATEGORY_ICON_TINTS).
 */
export const PARTNER_CATEGORY_ICON_TINTS: Record<PartnerCategory, string> = {
  gettingSettled: "#B4E3D4",
  findWork: "#B5D9EC",
  immigrationHelp: "#F8CEC8",
  librariesLearning: "#D1C5EF",
  communityBelonging: "#F1D4BD",
  networksPlanning: "#CBD9ED",
  internationalStudents: "#EDC6DA",
  insurance: "#EEDEBD",
  money: "#B4E3B5",
};

/** Two-colour category glyph from Figma (same art as mobile assets/icons/resources). */
export const categoryIconSrc = (category: PartnerCategory): string =>
  `/resources/icons/${category}.svg`;

/** i18n keys — resolve with `t()` at render time. */
export const COST_LABEL_KEYS: Record<Cost, string> = {
  free: "resources.cost.free",
  paid: "resources.cost.paid",
  mixed: "resources.cost.mixed",
};
