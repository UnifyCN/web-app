/**
 * Companion topic label (spec UnifyCN/mobile-app#314).
 *
 * Every question gets exactly one topic from a fixed list. rag-query puts it on
 * `$ai_generation` and returns it to the client, so the dashboards can show
 * what people ask about without ever storing question text.
 *
 * The label comes from the answer model itself, in the call rag-query already
 * makes: the system prompt asks it to end the reply with a `[TOPIC]: <label>`
 * line (TOPIC_INSTRUCTION). That works in every app language, because the
 * model reads the question, the earlier turns and the lesson context, and no
 * extra model call is made. rag-query removes the tag from the answer
 * (extractTopicTag) and, when streaming, never forwards it to the client
 * (createTopicTagFilter). An answer without a valid tag gets `other`; a
 * `[TOPIC]:` with an off-list label is not a tag and stays in the text.
 */

import { TOPICS, type Topic } from '../../_shared/topics.ts';

export { TOPICS };
export type { Topic };

export const FALLBACK_TOPIC: Topic = 'other';

/** Appended to every rag-query system prompt, after the response-language
 *  directive, so it also holds when the answer is not in English. */
export const TOPIC_INSTRUCTION = `

TOPIC LABEL:
After everything else (after the [SUGGESTIONS] line), write one last line: "[TOPIC]: " followed by exactly one label from this list, in English and spelled exactly as shown, whatever language you answered in:
immigration (visas, permits, PR, citizenship, refugee claims, sponsorship)
work (jobs, resumes, interviews, workplace rights, credentials for a job)
housing (renting, buying, tenancy, utilities)
money (banking, credit, budgeting, sending money, benefits payments)
taxes (tax returns, CRA, tax credits)
health (health coverage, doctors, insurance, mental health)
education (schools, college, university, language classes)
transportation (driving, licences, transit, cars)
settling_in (SIN, phone, ID, first steps, culture, community, daily life)
other (greetings, small talk, anything else)
Label the user's latest question; for a short follow-up, use the topic of the conversation or lesson it follows.
Example: [TOPIC]: housing`;

/**
 * The label a model wrote, mapped onto the topic list, or null when it is not
 * on the list. Tolerates case, markdown, quotes, spaces or hyphens in place of
 * the underscore, and trailing words ("housing (renting)").
 */
export function normalizeTopic(raw: unknown): Topic | null {
  if (typeof raw !== 'string') return null;
  const words = raw
    .toLowerCase()
    .replace(/[^a-z_\s-]/g, ' ')
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean);
  if (words.length === 0) return null;
  const candidates = [words.join('_'), words.slice(0, 2).join('_'), words[0]];
  for (const candidate of candidates) {
    if ((TOPICS as readonly string[]).includes(candidate)) {
      return candidate as Topic;
    }
  }
  return null;
}

/*
 * What counts as a tag (rule approved 2026-10-21, ticket #318 round 4):
 * `[TOPIC]` (any case), a colon, then a label on the topic list, with optional
 * emphasis marks / backticks / quotes around the pieces. Anything else that
 * contains `[TOPIC]` (no colon, an off-list or translated label, a word that
 * only starts like a label) is ordinary text and is kept as written.
 *
 * Removal:
 * - alone on its line (nothing but spaces and emphasis marks around it): the
 *   whole line goes, its newline included;
 * - after text on the same line: the tag goes with the spaces and marks
 *   touching it before; the rest of the line and its line break stay;
 * - at the start of a line with text after it: the tag and the spaces after it.
 * Two tags: both are removed and the first one sets the topic.
 */

/** Spaces and markdown marks that may sit around a tag. */
const DECOR = ' \t*_`~';

/** A tag, anchored at its `[`. Group 1 is the label: a topic from the list,
 *  "settling_in" also written with a space or hyphen. */
const TAG = new RegExp(
  String.raw`^\[topic\][*_${'`'}~]{0,4}[ \t]{0,2}:[*_${'`'}~"' \t]{0,8}` +
    `(${TOPICS.map(t => t.replace('_', '[ _-]')).join('|')})` +
    String.raw`(?![a-z])[*_${'`'}~"']{0,4}`,
  'i'
);

/** The longest a tag can be, plus room to see what follows it. A candidate
 *  is decided once its line ends, the stream ends, or this many characters
 *  of it have arrived. */
const DECIDE_AT = 64;

const OPEN = '[topic]';

/** Index of the first `[` that is, or could still grow into, `[topic]`. */
function findOpen(text: string): number {
  const lower = text.toLowerCase();
  for (let i = lower.indexOf('['); i !== -1; i = lower.indexOf('[', i + 1)) {
    const head = lower.slice(i, i + OPEN.length);
    if (head === OPEN || (i + OPEN.length > lower.length && OPEN.startsWith(head))) {
      return i;
    }
  }
  return -1;
}

/**
 * Streaming guard: forwards answer text as it arrives and removes `[TOPIC]`
 * tags (rules above), so the label never shows in the client's live bubble.
 * Text that could still turn into a tag is held until it is decided, then
 * either dropped (a tag) or forwarded unchanged. Call `flush` when the stream
 * ends to decide and release whatever is held. extractTopicTag runs this same
 * filter, so the saved answer is exactly the streamed text (trimmed).
 */
export function createTopicTagFilter(): {
  push: (delta: string) => string;
  flush: () => string;
  /** The label of every tag removed so far, in order. */
  labels: () => readonly string[];
} {
  let pending = '';
  /** Whether text has been forwarded since the last line break. */
  let lineHasText = false;
  /** After a tag that started a line: drop the spaces that follow it, even
   *  when they arrive in later chunks. */
  let skipSpaces = false;
  const labels: string[] = [];

  const run = (final: boolean): string => {
    let out = '';
    const emit = (text: string) => {
      if (!text) return;
      out += text;
      const lineBreak = text.lastIndexOf('\n');
      lineHasText = lineBreak === -1 ? true : lineBreak < text.length - 1;
    };

    for (;;) {
      if (skipSpaces) {
        pending = pending.replace(/^[ \t]+/, '');
        if (!pending) return out;
        skipSpaces = false;
      }
      const open = findOpen(pending);
      if (open === -1) {
        // Keep a trailing run of spaces/marks: it may be the start of a tag.
        let keep = pending.length;
        if (!final) while (keep > 0 && DECOR.includes(pending[keep - 1])) keep--;
        emit(pending.slice(0, keep));
        pending = pending.slice(keep);
        return out;
      }

      // The spaces/marks right before the `[` belong to the candidate.
      let start = open;
      while (start > 0 && DECOR.includes(pending[start - 1])) start--;
      emit(pending.slice(0, start));
      const lead = pending.slice(start, open);
      const candidate = pending.slice(open);

      // Only the first DECIDE_AT characters are looked at, so the decision is
      // a function of the text, not of how it was chunked: streaming and
      // extractTopicTag always agree.
      const seen = candidate.slice(0, DECIDE_AT);
      const lineEnd = seen.indexOf('\n');
      if (lineEnd === -1 && seen.length < DECIDE_AT && !final) {
        pending = lead + candidate; // wait for more
        return out;
      }
      const window = lineEnd !== -1 ? seen.slice(0, lineEnd) : seen;
      const tag = TAG.exec(window);

      if (!tag) {
        // Ordinary text: forward up to and including this `[`, scan on.
        emit(lead + '[');
        pending = candidate.slice(1);
        continue;
      }

      labels.push(tag[1]);
      const after = candidate.slice(tag[0].length);
      const restOfLine = window.slice(tag[0].length);
      // The whole line is known when it ends, or the stream ends, within
      // DECIDE_AT characters.
      const lineComplete =
        lineEnd !== -1 || (final && candidate.length < DECIDE_AT);
      const aloneOnLine =
        !lineHasText && lineComplete && /^[ \t*_`~"'\r]*$/.test(restOfLine);

      if (aloneOnLine) {
        // Drop the whole line, its newline included.
        pending = lineEnd !== -1 ? candidate.slice(lineEnd + 1) : '';
        skipSpaces = false;
        continue;
      }
      // Drop the tag and the spaces/marks touching it before; keep the marks
      // that close earlier text ("*b* [TOPIC]" keeps "*b*").
      const touching = /[ \t]*[*_`~]*$/.exec(lead)!;
      emit(lead.slice(0, touching.index));
      pending = after;
      skipSpaces = !lineHasText;
    }
  };

  return {
    push: (delta: string) => {
      pending += delta;
      return run(false);
    },
    flush: () => run(true),
    labels: () => labels,
  };
}

/**
 * Take the `[TOPIC]` tag out of a model answer (rules above). Returns the
 * answer without the tag (the `[SUGGESTIONS]` line is left for
 * parseSuggestionsFromResponse) and the label of the first tag. No tag (none,
 * or only `[TOPIC]` text that is not a tag): the answer comes back unchanged,
 * byte for byte, and the topic is `other`.
 */
export function extractTopicTag(answer: string): {
  answer: string;
  topic: Topic;
  /** False when the answer had no tag (the topic is the fallback). */
  labelled: boolean;
} {
  const filter = createTopicTagFilter();
  const stripped = filter.push(answer) + filter.flush();
  const [first] = filter.labels();
  const topic = normalizeTopic(first);
  if (first === undefined || topic === null) {
    return { answer, topic: FALLBACK_TOPIC, labelled: false };
  }
  return { answer: stripped.trim(), topic, labelled: true };
}
