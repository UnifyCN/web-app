import type { TFunction } from "i18next";
import type { Persona, SanityModule, Stage } from "@/types";

/**
 * Module relevance scoring — ported from the mobile `personalize` edge function
 * (`scoreModule`). Modules carry `personas[]` + `interests[]` in Sanity; a
 * user's onboarding (`persona`, `learningInterests`) is matched against them.
 *
 *   score = (interest match ? 0.7 : 0) + (persona match ? 0.3 : 0)
 *
 * Interest weight dominates, matching mobile. `whyTag` produces the
 * human-readable "Recommended for …" string mobile shows on the module header.
 */

export interface RecommendProfile {
  persona: Persona | null;
  learningInterests: string[];
  stage?: Stage | null;
}

/** Only the bits of a module needed to score it. */
type ScorableModule = Pick<SanityModule, "personas" | "interests">;

/** Interest slugs with a learnWeb.recommend.interests.* display key. */
const KNOWN_INTERESTS = new Set([
  "documents",
  "employment",
  "finance",
  "housing",
  "pr_immigration",
  "healthcare",
  "family_kids",
  "transit",
]);

/**
 * Heuristic stage → relevant interests map. Sanity modules have NO `stage`
 * field, so the sidebar stage filter narrows by the interests typically most
 * relevant at each settlement stage. Tune freely — this is a product judgement,
 * not backed by content metadata.
 *  0 not arrived · 1 0–3mo · 2 3–12mo · 3 1–3yr · 4 3+yr
 */
export const STAGE_INTEREST_MAP: Record<Stage, string[]> = {
  0: ["documents", "pr_immigration", "housing"],
  1: ["documents", "housing", "finance", "healthcare", "transit"],
  2: ["employment", "finance", "healthcare", "transit"],
  3: ["employment", "pr_immigration", "family_kids", "finance"],
  4: ["pr_immigration", "family_kids", "employment"],
};

function interestMatch(module: ScorableModule, profile: RecommendProfile) {
  const interests = module.interests ?? [];
  return (
    interests.length > 0 &&
    profile.learningInterests.some((i) => interests.includes(i))
  );
}

function personaMatch(module: ScorableModule, profile: RecommendProfile) {
  const personas = module.personas ?? [];
  return (
    personas.length > 0 && !!profile.persona && personas.includes(profile.persona)
  );
}

/** 0–1 relevance score for a module against the user's onboarding profile. */
export function scoreModule(
  module: ScorableModule,
  profile: RecommendProfile,
): number {
  return (
    (interestMatch(module, profile) ? 0.7 : 0) +
    (personaMatch(module, profile) ? 0.3 : 0)
  );
}

/** Human-readable reason a module is recommended, or "" when no signal matches. */
export function whyTag(
  module: ScorableModule,
  profile: RecommendProfile,
  t: TFunction,
): string {
  const hasInterest = interestMatch(module, profile);
  const hasPersona = personaMatch(module, profile);

  const matchedInterest = hasInterest
    ? profile.learningInterests.find((i) =>
        (module.interests ?? []).includes(i),
      )
    : undefined;
  const interestLabel = matchedInterest
    ? KNOWN_INTERESTS.has(matchedInterest)
      ? t(`learnWeb.recommend.interests.${matchedInterest}`)
      : matchedInterest.replace(/_/g, " ")
    : "";
  const personaLabel =
    hasPersona && profile.persona
      ? t(`learnWeb.recommend.personas.${profile.persona}`)
      : "";

  if (hasInterest && hasPersona) {
    return t("learnWeb.recommend.forBoth", {
      persona: personaLabel,
      interest: interestLabel,
    });
  }
  if (hasInterest)
    return t("learnWeb.recommend.forInterest", { interest: interestLabel });
  if (hasPersona)
    return t("learnWeb.recommend.forPersona", { persona: personaLabel });
  return "";
}

/**
 * Whether a module is relevant to the user's stage. A module with no interest
 * metadata can't be judged, so it's kept (returns true) rather than hidden.
 */
export function matchesStage(
  module: ScorableModule,
  stage: Stage | null | undefined,
): boolean {
  if (stage == null) return true;
  const interests = module.interests ?? [];
  if (interests.length === 0) return true;
  const stageInterests = STAGE_INTEREST_MAP[stage] ?? [];
  return interests.some((i) => stageInterests.includes(i));
}
