/**
 * Pure, immutable edit operations on CoverLetterData for inline editing. Each
 * takes the current letter and returns a new one; the editable CoverLetterPaper
 * calls these and hands the result to the update mutation. Kept pure (no
 * persistence) so they stay trivially testable. Mirrors lib/resume/editOps.ts.
 */

import type { ResumeContact } from "@/types/resume";
import type { CoverLetterData, CoverLetterRecipient } from "@/types/coverLetter";

/**
 * A functional update on the letter. Manual edits are threaded as updaters (not
 * precomputed values) so each op applies to the *freshest* letter at commit time
 * rather than a possibly-stale render closure — the key to keeping rapid inline
 * edits from clobbering one another. See `useUpdateCoverLetterData`.
 */
export type CoverLetterUpdater = (prev: CoverLetterData) => CoverLetterData;

export function setContactField(
  data: CoverLetterData,
  field: keyof ResumeContact,
  value: string,
): CoverLetterData {
  return { ...data, contact: { ...data.contact, [field]: value } };
}

export function setDate(data: CoverLetterData, value: string): CoverLetterData {
  return { ...data, date: value };
}

export function setRecipientField(
  data: CoverLetterData,
  field: keyof CoverLetterRecipient,
  value: string,
): CoverLetterData {
  return { ...data, recipient: { ...data.recipient, [field]: value } };
}

export function setGreeting(
  data: CoverLetterData,
  value: string,
): CoverLetterData {
  return { ...data, greeting: value };
}

export function setClosing(
  data: CoverLetterData,
  value: string,
): CoverLetterData {
  return { ...data, closing: value };
}

export function setSignature(
  data: CoverLetterData,
  value: string,
): CoverLetterData {
  return { ...data, signature: value };
}

/* ----- body paragraphs --------------------------------------------------- */

/** Max paragraphs (mirrors normalizeCoverLetterData's MAX_PARAGRAPHS). */
export const MAX_PARAGRAPHS = 8;

export function setParagraph(
  data: CoverLetterData,
  index: number,
  value: string,
): CoverLetterData {
  return {
    ...data,
    body: data.body.map((p, i) => (i === index ? value : p)),
  };
}

export function addParagraph(data: CoverLetterData): CoverLetterData {
  if (data.body.length >= MAX_PARAGRAPHS) return data;
  return { ...data, body: [...data.body, ""] };
}

export function removeParagraph(
  data: CoverLetterData,
  index: number,
): CoverLetterData {
  return { ...data, body: data.body.filter((_, i) => i !== index) };
}
