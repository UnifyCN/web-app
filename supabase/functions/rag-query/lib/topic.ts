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
 * The tag and the markdown a model may wrap it in. It starts at the spaces
 * before it and the emphasis marks (`*`, `_`, backtick, `~`) touching
 * `[TOPIC]`, and runs through the end of its line, newline included: closing marks and
 * the label are on that line. Text before it on the line and every line after
 * it are kept.
 */
const TAG_OPEN = /[ \t]*[*_`~]*\[topic\]/i;

/** A run at the end of a chunk that could still grow into TAG_OPEN. */
const PARTIAL_TAG_OPEN = /[ \t]*[*_`~]*(?:\[(?:t(?:o(?:p(?:i(?:c)?)?)?)?)?)?$/i;

/**
 * Streaming guard: forwards answer text as it arrives but removes each
 * `[TOPIC]` tag line, so the label never shows in the client's live bubble,
 * while the text after the tag keeps streaming. A possible tag start at the
 * end of a chunk ("**[TO") is held until the next chunk shows whether it is
 * the tag. Call `flush` once the stream ends to get any held text that turned
 * out not to be the tag. extractTopicTag runs the same filter, so the saved
 * answer matches what was streamed.
 */
export function createTopicTagFilter(): {
  push: (delta: string) => string;
  flush: () => string;
  /** The label text of every tag seen so far, in order. */
  labels: () => readonly string[];
} {
  let held = '';
  let inTag = false;
  let label = '';
  const labels: string[] = [];

  const endTag = () => {
    labels.push(label);
    label = '';
    inTag = false;
  };

  return {
    push(delta: string): string {
      let text = held + delta;
      held = '';
      let out = '';
      while (text) {
        if (inTag) {
          const lineEnd = text.indexOf('\n');
          if (lineEnd === -1) {
            label += text;
            return out;
          }
          label += text.slice(0, lineEnd);
          text = text.slice(lineEnd + 1);
          endTag();
          continue;
        }
        const open = TAG_OPEN.exec(text);
        if (open) {
          out += text.slice(0, open.index);
          text = text.slice(open.index + open[0].length);
          inTag = true;
          continue;
        }
        const partial = PARTIAL_TAG_OPEN.exec(text)!;
        out += text.slice(0, partial.index);
        held = text.slice(partial.index);
        return out;
      }
      return out;
    },
    flush(): string {
      if (inTag) endTag();
      const rest = held;
      held = '';
      return rest;
    },
    labels: () => labels,
  };
}

/**
 * Take the `[TOPIC]` tag out of a model answer. Returns the answer without the
 * tag line (the `[SUGGESTIONS]` line is left for parseSuggestionsFromResponse)
 * and the label, falling back to `other` when the tag is missing or its label
 * is off the list. The last tag wins; every tag is removed. An answer with no
 * tag comes back unchanged.
 */
export function extractTopicTag(answer: string): {
  answer: string;
  topic: Topic;
  /** False when the model wrote no usable label (the topic is the fallback). */
  labelled: boolean;
} {
  const filter = createTopicTagFilter();
  const stripped = filter.push(answer) + filter.flush();
  const labels = filter.labels();
  if (labels.length === 0) {
    return { answer, topic: FALLBACK_TOPIC, labelled: false };
  }
  const topic = normalizeTopic(labels[labels.length - 1]);
  return {
    answer: stripped.trim(),
    topic: topic ?? FALLBACK_TOPIC,
    labelled: topic !== null,
  };
}
