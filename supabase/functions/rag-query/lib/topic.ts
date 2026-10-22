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
 *
 * One exception, approved in round 5: the LAST non-blank line of the answer,
 * when it starts with `[TOPIC]:` (after spaces/marks), is removed whatever its
 * label (a translated or off-list label is still the model's tag). An
 * off-list label gives no topic, so the fallback `other` applies. The same
 * line mid-answer stays visible.
 */

/** Spaces and markdown marks that may sit around a tag. */
const DECOR = ' \t*_`~';

/** The start of a tag, anchored at its `[`: `[TOPIC]`, marks, colon. */
const TAG_HEAD = String.raw`^\[topic\][*_${'`'}~]{0,4}[ \t]{0,2}:`;

/** A tag, anchored at its `[`. Group 1 is the label: a topic from the list,
 *  "settling_in" also written with a space or hyphen. The label must end at a
 *  word boundary in any script: no letter or digit may follow, directly or
 *  after underscores ("housing2", "housingé", "housing_x" are not tags; the
 *  closing "_" of "_education_" is a mark). Closing marks may include a
 *  full stop. */
const TAG = new RegExp(
  TAG_HEAD +
    String.raw`[*_${'`'}~"' \t]{0,8}` +
    `(${TOPICS.map(t => t.replace('_', '[ _-]')).join('|')})` +
    String.raw`(?!_*[\p{L}\p{N}])[*_${'`'}~"'.]{0,4}`,
  'iu'
);

/** `[TOPIC]:` with any label (or none): removed only as the last line. */
const LOOSE_TAG = new RegExp(TAG_HEAD, 'i');

/** What may follow a tag on its line for the tag to count as alone. */
const ALONE_REST = /^[ \t*_`~"'\r]*$/;

/** Longer than any tag plus the character after it. The tag pattern is
 *  matched against at most this many characters of the candidate, so the
 *  match does not depend on how the text was chunked. */
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
  /** The label of every valid tag removed so far, in order. */
  labels: () => readonly string[];
  /** Whether anything (a tag, or a last `[TOPIC]:` line) has been removed. */
  removedAny: () => boolean;
} {
  let pending = '';
  /** Whether text has been forwarded since the last line break. */
  let lineHasText = false;
  /** After a tag that started a line: drop the spaces that follow it, even
   *  when they arrive in later chunks. */
  let skipSpaces = false;
  /** A `[TOPIC]:` line with no valid label, plus the blank text after it:
   *  dropped if the answer ends here, forwarded as written if it goes on. */
  let lastLineCandidate: string | null = null;
  /** Whether anything has been removed. */
  let removed = false;
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
      if (lastLineCandidate !== null) {
        const blank = /^[ \t\r\n]*/.exec(pending)![0];
        lastLineCandidate += blank;
        pending = pending.slice(blank.length);
        if (!pending) {
          if (final) {
            lastLineCandidate = null; // it was the last line: drop it
            removed = true;
          }
          return out;
        }
        // More text follows: forward the line as written. Blank text after
        // its last line break goes back to be scanned with what follows.
        const cut = lastLineCandidate.lastIndexOf('\n') + 1;
        emit(lastLineCandidate.slice(0, cut));
        pending = lastLineCandidate.slice(cut) + pending;
        lastLineCandidate = null;
      }
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

      const lineEnd = candidate.indexOf('\n');
      const line = lineEnd === -1 ? candidate : candidate.slice(0, lineEnd);
      const lineKnown = lineEnd !== -1 || final;
      const wait = () => {
        pending = lead + candidate;
        return out;
      };

      // 1. Is it a tag? Matched on the first DECIDE_AT characters only.
      if (!lineKnown && line.length < DECIDE_AT) return wait();
      const tag = TAG.exec(line.slice(0, DECIDE_AT));

      if (tag) {
        const rest = line.slice(tag[0].length);
        const restIsBlank = ALONE_REST.test(rest);
        // Alone on its line? Needs the whole line unless text came first or
        // something other than spaces/marks follows. Trailing spaces never
        // force a decision early.
        if (!lineHasText && restIsBlank && !lineKnown) return wait();
        labels.push(tag[1]);
        removed = true;
        if (!lineHasText && restIsBlank) {
          // Drop the whole line, its newline included.
          pending = lineEnd !== -1 ? candidate.slice(lineEnd + 1) : '';
          continue;
        }
        // Drop the tag and the spaces/marks touching it before; keep the
        // marks that close earlier text ("*b* [TOPIC]" keeps "*b*").
        const touching = /[ \t]*[*_`~]*$/.exec(lead)!;
        emit(lead.slice(0, touching.index));
        pending = candidate.slice(tag[0].length);
        skipSpaces = !lineHasText;
        continue;
      }

      // 2. `[TOPIC]:` starting a line, off-list label: removed only if it is
      //    the last line, so hold it until that is known.
      if (!lineHasText && LOOSE_TAG.test(line)) {
        if (!lineKnown) return wait();
        if (lineEnd === -1) {
          pending = ''; // the stream ended on this line
          removed = true;
          continue;
        }
        lastLineCandidate = lead + candidate.slice(0, lineEnd + 1);
        pending = candidate.slice(lineEnd + 1);
        continue;
      }

      // 3. Ordinary text: forward up to and including this `[`, scan on.
      emit(lead + '[');
      pending = candidate.slice(1);
    }
  };

  return {
    push: (delta: string) => {
      pending += delta;
      return run(false);
    },
    flush: () => run(true),
    labels: () => labels,
    removedAny: () => removed,
  };
}

/**
 * Take the `[TOPIC]` tag out of a model answer (rules above). Returns the
 * answer without the tag (the `[SUGGESTIONS]` line is left for
 * parseSuggestionsFromResponse) and the label of the first valid tag, else
 * `other`. When nothing is removed (no tag, or only `[TOPIC]` text that is not
 * a tag) the answer comes back unchanged, byte for byte.
 */
export function extractTopicTag(answer: string): {
  answer: string;
  topic: Topic;
  /** False when the answer had no valid label (the topic is the fallback). */
  labelled: boolean;
} {
  const filter = createTopicTagFilter();
  const stripped = filter.push(answer) + filter.flush();
  if (!filter.removedAny()) {
    return { answer, topic: FALLBACK_TOPIC, labelled: false };
  }
  const topic = normalizeTopic(filter.labels()[0]);
  return {
    answer: stripped.trim(),
    topic: topic ?? FALLBACK_TOPIC,
    labelled: topic !== null,
  };
}
