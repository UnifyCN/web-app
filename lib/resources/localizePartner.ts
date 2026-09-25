import type { TFunction } from "i18next";
import type {
  LocalizedPartner,
  LocalizedPartnerProgram,
  Partner,
  PartnerProgram,
} from "@/types";

/*
 * Resolves a partner's display copy for the active language. Ported from
 * mobile utils/localizePartner.ts (main @ ce38ba1), with the key root
 * re-namespaced from `learn.resources.partners` to `resources.partners`.
 *
 * `lib/resources/partners.ts` holds structure only; every string a person
 * reads lives in the locale files under `resources.partners.<slug>`, so the
 * directory follows the app language. Keys derive from ids, so a record can't
 * drift from its copy; `partnerCopy.test.ts` asserts both sides match.
 *
 * `t` is a parameter, not an import, so this stays testable without a running
 * i18next instance.
 */

/** Root of the partner copy tree in every locale file. */
export const PARTNER_COPY_ROOT = "resources.partners";

/** Key holding one of a partner's own copy fields. */
export function partnerCopyKey(slug: string, field: string): string {
  return `${PARTNER_COPY_ROOT}.${slug}.${field}`;
}

/**
 * The program's key segment: its id with the parent slug stripped
 * (`diversecity-linc` → `linc`). The raw id is the fallback, so a malformed id
 * degrades to a missing key rather than a wrong one.
 */
export function programKeySegment(slug: string, programId: string): string {
  const prefix = `${slug}-`;
  return programId.startsWith(prefix)
    ? programId.slice(prefix.length)
    : programId;
}

/** Key holding one of a program's copy fields. */
export function programCopyKey(
  slug: string,
  programId: string,
  field: string,
): string {
  return `${PARTNER_COPY_ROOT}.${slug}.programs.${programKeySegment(
    slug,
    programId,
  )}.${field}`;
}

/** A required string; '' when the key is missing (never the raw key). */
function text(t: TFunction, key: string): string {
  const value = t(key, { defaultValue: "" });
  return typeof value === "string" ? value : "";
}

/** An optional string: a missing or blank key comes back `undefined`. */
function optionalText(t: TFunction, key: string): string | undefined {
  const value = text(t, key);
  return value.length > 0 ? value : undefined;
}

/** A required list, e.g. highlights. Empty when the key is absent. */
function list(t: TFunction, key: string): string[] {
  const value: unknown = t(key, { returnObjects: true, defaultValue: [] });
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** An optional list, e.g. languages of service. */
function optionalList(t: TFunction, key: string): string[] | undefined {
  const value = list(t, key);
  return value.length > 0 ? value : undefined;
}

function localizeProgram(
  slug: string,
  program: PartnerProgram,
  t: TFunction,
): LocalizedPartnerProgram {
  const key = (field: string) => programCopyKey(slug, program.id, field);
  return {
    ...program,
    name: text(t, key("name")),
    description: text(t, key("description")),
    eligibility: optionalText(t, key("eligibility")),
  };
}

/** One partner with its copy resolved for the language `t` is bound to. */
export function localizePartner(
  partner: Partner,
  t: TFunction,
): LocalizedPartner {
  const key = (field: string) => partnerCopyKey(partner.slug, field);
  return {
    ...partner,
    tagline: text(t, key("tagline")),
    description: text(t, key("description")),
    highlights: list(t, key("highlights")),
    serviceArea: text(t, key("serviceArea")),
    eligibility: optionalText(t, key("eligibility")),
    howToStart: optionalText(t, key("howToStart")),
    hours: optionalText(t, key("hours")),
    languages: optionalList(t, key("languages")),
    programs: partner.programs?.map((program) =>
      localizeProgram(partner.slug, program, t),
    ),
  };
}
