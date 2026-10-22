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
 * (createTopicTagFilter). A missing or off-list label falls back to `other`.
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

/** `[TOPIC]` with optional markdown emphasis around it, then the label. */
const TOPIC_TAG = /\**\[topic\]\**\s*:?\**[ \t]*([^\n]*)/gi;

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

/**
 * Take the `[TOPIC]` tag out of a model answer. Returns the answer without the
 * tag (the `[SUGGESTIONS]` line is left for parseSuggestionsFromResponse) and
 * the label, falling back to `other` when the tag is missing or its label is
 * off the list. The last tag wins; every tag is removed.
 */
export function extractTopicTag(answer: string): {
  answer: string;
  topic: Topic;
  /** False when the model wrote no usable label (the topic is the fallback). */
  labelled: boolean;
} {
  let last: string | undefined;
  const stripped = answer.replace(TOPIC_TAG, (_match, label: string) => {
    last = label;
    return '';
  });
  const topic = normalizeTopic(last);
  return {
    answer: stripped.replace(/[ \t]+$/gm, '').trim(),
    topic: topic ?? FALLBACK_TOPIC,
    labelled: topic !== null,
  };
}

const TAG_START = '[topic]';

/**
 * Streaming guard: forwards answer text as it arrives but holds back anything
 * from a `[TOPIC]` tag on, so the label never shows in the client's live
 * bubble. A partial tag at the end of a chunk ("[TO") is held until the next
 * chunk shows whether it is the tag. Call `flush` once the stream ends to get
 * any held text that turned out not to be the tag.
 */
export function createTopicTagFilter(): {
  push: (delta: string) => string;
  flush: () => string;
} {
  let held = '';
  let suppressed = false;

  return {
    push(delta: string): string {
      if (suppressed) return '';
      const text = held + delta;
      const lower = text.toLowerCase();
      const at = lower.indexOf(TAG_START);
      if (at !== -1) {
        suppressed = true;
        held = '';
        return text.slice(0, at);
      }
      // Hold the longest tail that could still grow into the tag.
      let keep = Math.min(TAG_START.length - 1, text.length);
      while (keep > 0 && !TAG_START.startsWith(lower.slice(text.length - keep))) {
        keep--;
      }
      held = text.slice(text.length - keep);
      return text.slice(0, text.length - keep);
    },
    flush(): string {
      const rest = suppressed ? '' : held;
      held = '';
      return rest;
    },
  };
}
