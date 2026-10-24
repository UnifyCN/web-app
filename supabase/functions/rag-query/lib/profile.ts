// The USER PROFILE CONTEXT block of the answer prompt. Persona, goals and
// interests personalise the ANSWER; only province (see retrieval.ts) affects
// which sources are retrieved.
import {
  compareUtcDates,
  formatLongDate,
  parseUtcDate,
  utcDateOf,
} from './dates.ts';
import { canonicalProvince } from './province.ts';

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function words(values: unknown): string[] {
  return Array.isArray(values)
    ? values.filter((v): v is string => typeof v === 'string')
    : [];
}

/**
 * The persona and location sentence. Arrival wording depends on the UTC date
 * against `now`: a later date "plans to arrive", today or earlier "arrived".
 * A null or invalid date leaves the arrival out of the sentence altogether.
 * Every part is optional and none depends on another: without a persona the
 * subject is "a user" (no persona is invented), and a province that is not one
 * of the 13 canonical names counts as no province. Dates are Month D, YYYY.
 * Null when nothing about the person, place or arrival is known.
 */
function personaSentence(
  profile: Record<string, unknown>,
  now: Date
): string | null {
  const persona = text(profile.persona)?.replace(/_/g, ' ') ?? null;
  const city = text(profile.city);
  const province = canonicalProvince(profile.province);
  const arrival = parseUtcDate(profile.arrival_date);

  if (!persona && !city && !province && !arrival) return null;
  const who = `You are speaking with a ${persona ?? 'user'}`;

  if (arrival && compareUtcDates(arrival, utcDateOf(now)) > 0) {
    const where = `${who} who plans to arrive in ${city ?? 'Canada'} on ${formatLongDate(arrival)}.`;
    return province ? `${where} Their destination province is ${province}.` : where;
  }

  const day = arrival ? formatLongDate(arrival) : null;
  if (city && province) {
    return day
      ? `${who} who arrived in ${city}, ${province} on ${day}.`
      : `${who} in ${city}, ${province}.`;
  }
  const place = city ?? province;
  if (place) {
    return `${who} in ${place}${day ? `, who arrived on ${day}` : ''}.`;
  }
  return `${who} in Canada${day ? `, who arrived on ${day}` : ''}.`;
}

export function buildUserProfileContext(
  profile: Record<string, unknown>,
  now: Date = new Date()
): string {
  const city = text(profile.city);
  const goals = words(profile.goals);
  const learningInterests = words(profile.learning_interests);

  const parts: string[] = [];

  const sentence = personaSentence(profile, now);
  if (sentence) parts.push(sentence);

  if (goals.length > 0) {
    parts.push(`Their goals: ${goals.map(g => g.replace(/_/g, ' ')).join(', ')}.`);
  }

  if (learningInterests.length > 0) {
    parts.push(
      `Their interests: ${learningInterests.map(i => i.replace(/_/g, ' ')).join(', ')}.`
    );
  }

  if (parts.length === 0) return '';

  parts.push(
    `Tailor your responses to their specific situation, location, and goals.`
  );

  if (city) {
    parts.push(`Refer to local resources in ${city} when relevant.`);
  }

  // Bias guard - research (EMNLP 2025, "Reading Between the Prompts") shows
  // LLMs implicitly stereotype based on persona cues. Explicitly forbid
  // extrapolating beyond stated facts.
  parts.push(
    `Do NOT assume cultural traits, religion, language fluency, family situation, education level, or financial status beyond what is stated above.`
  );

  return `\nUSER PROFILE CONTEXT:\n${parts.join(' ')}`;
}
