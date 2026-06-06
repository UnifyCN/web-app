import type { Persona, Stage } from "@/types";

/* ------------------------------------------------------------------ *
 * Onboarding option sets + label maps.
 *
 * `goals` / `learning_interests` are stored in Supabase as enum *slugs*
 * (text[]) for parity with the mobile app and forward-compat with future
 * Learn/Circle filtering; the UI strings live only in the label maps below.
 * ------------------------------------------------------------------ */

/* ----- Persona ---------------------------------------------------- */

/** Compact badge label — shared by PersonaBadge and the onboarding review. */
export const PERSONA_LABEL: Record<Persona, string> = {
  international_student: "International Student",
  skilled_worker: "Skilled Worker",
  refugee: "Refugee",
  other: "Newcomer",
};

/** Descriptive wizard cards (richer than the compact badge label). */
export const PERSONA_OPTIONS: ReadonlyArray<{
  value: Persona;
  label: string;
  description: string;
}> = [
  {
    value: "international_student",
    label: "International student",
    description: "Studying, or planning to study, in Canada",
  },
  {
    value: "skilled_worker",
    label: "Skilled worker, PR, or immigrant",
    description: "Working or settling as a permanent resident",
  },
  {
    value: "refugee",
    label: "Refugee or protected person",
    description: "Resettling in Canada under protection",
  },
  {
    value: "other",
    label: "Something else",
    description: "None of these describe me exactly",
  },
];

/* ----- Stage ------------------------------------------------------ */

/** Time-in-Canada label — shared by StageIndicator and the onboarding review. */
export const STAGE_LABEL: Record<Stage, string> = {
  0: "Not arrived yet",
  1: "0–3 months in Canada",
  2: "3–12 months in Canada",
  3: "1–3 years in Canada",
  4: "3+ years in Canada",
};

/* ----- Goals ------------------------------------------------------ */

export const GOAL_OPTIONS = [
  { value: "learn_something", label: "Learn something new" },
  { value: "build_community", label: "Build community & friends" },
  { value: "quick_answers", label: "Get quick answers" },
  { value: "something_else", label: "Something else" },
] as const;

export type Goal = (typeof GOAL_OPTIONS)[number]["value"];

export const GOAL_LABEL = Object.fromEntries(
  GOAL_OPTIONS.map((o) => [o.value, o.label]),
) as Record<Goal, string>;

/* ----- Learning interests ----------------------------------------- */

export const INTEREST_OPTIONS = [
  { value: "documents", label: "Documents & IDs" },
  { value: "employment", label: "Jobs & career" },
  { value: "finance", label: "Money & banking" },
  { value: "housing", label: "Housing" },
  { value: "pr_immigration", label: "PR & immigration" },
  { value: "healthcare", label: "Healthcare" },
  { value: "family_kids", label: "Family & kids" },
  { value: "transit", label: "Transit" },
  { value: "other", label: "Other" },
] as const;

export type LearningInterest = (typeof INTEREST_OPTIONS)[number]["value"];

export const INTEREST_LABEL = Object.fromEntries(
  INTEREST_OPTIONS.map((o) => [o.value, o.label]),
) as Record<LearningInterest, string>;

/* ----- Referral source (how did you hear about Unify) ------------- */

export const REFERRAL_OPTIONS = [
  { value: "facebook_instagram", label: "Facebook / Instagram" },
  { value: "google_search", label: "Google Search" },
  { value: "app_store", label: "App Store" },
  { value: "friends_family", label: "Friends / family" },
  { value: "news_article", label: "News / article / blog" },
  { value: "tiktok", label: "TikTok" },
  { value: "other", label: "Other" },
] as const;

export type ReferralSource = (typeof REFERRAL_OPTIONS)[number]["value"];

export const REFERRAL_LABEL = Object.fromEntries(
  REFERRAL_OPTIONS.map((o) => [o.value, o.label]),
) as Record<ReferralSource, string>;

/* ----- Hobbies ---------------------------------------------------- */

export const HOBBY_OPTIONS = [
  { value: "career_growth", label: "Career growth" },
  { value: "explore_canada", label: "Explore Canada" },
  { value: "wellness_growth", label: "Wellness & growth" },
  { value: "tech_digital", label: "Tech & digital" },
  { value: "music_arts", label: "Music & arts" },
  { value: "fitness_sports", label: "Fitness & sports" },
  { value: "personal_finance", label: "Personal finance" },
  { value: "family_parenting", label: "Family & parenting" },
  { value: "education_learning", label: "Education & learning" },
  { value: "food_cooking", label: "Food & cooking" },
  { value: "movies", label: "Movies" },
] as const;

export type Hobby = (typeof HOBBY_OPTIONS)[number]["value"];

export const HOBBY_LABEL = Object.fromEntries(
  HOBBY_OPTIONS.map((o) => [o.value, o.label]),
) as Record<Hobby, string>;

/* ----- Location --------------------------------------------------- */

/** All 13 provinces & territories. `code` is stored; `name` is shown. */
export const PROVINCES = [
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "NS", name: "Nova Scotia" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Quebec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "YT", name: "Yukon" },
] as const;

export type ProvinceCode = (typeof PROVINCES)[number]["code"];

export const PROVINCE_NAME = Object.fromEntries(
  PROVINCES.map((p) => [p.code, p.name]),
) as Record<ProvinceCode, string>;

/** The 20 most common landing cities for newcomers; "Other" is handled by the
 *  Location step as a free-text entry with a manual province pick. */
export const CITY_OPTIONS = [
  "Toronto",
  "Vancouver",
  "Montreal",
  "Calgary",
  "Edmonton",
  "Ottawa",
  "Winnipeg",
  "Quebec City",
  "Hamilton",
  "Halifax",
  "Victoria",
  "Saskatoon",
  "Regina",
  "St. John's",
  "Kelowna",
  "London",
  "Kitchener",
  "Windsor",
  "Oshawa",
  "Barrie",
] as const;

/** City → province code, used to auto-fill the province when a known city is
 *  picked. Cities not listed here fall through to a manual province choice. */
export const CITY_TO_PROVINCE: Record<string, ProvinceCode> = {
  Toronto: "ON",
  Vancouver: "BC",
  Montreal: "QC",
  Calgary: "AB",
  Edmonton: "AB",
  Ottawa: "ON",
  Winnipeg: "MB",
  "Quebec City": "QC",
  Hamilton: "ON",
  Halifax: "NS",
  Victoria: "BC",
  Saskatoon: "SK",
  Regina: "SK",
  "St. John's": "NL",
  Kelowna: "BC",
  London: "ON",
  Kitchener: "ON",
  Windsor: "ON",
  Oshawa: "ON",
  Barrie: "ON",
};
