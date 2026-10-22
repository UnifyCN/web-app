// Topic label helpers (spec UnifyCN/mobile-app#314).
//
// RUN (from web-app/):
//   deno test supabase/functions/rag-query/lib/topic_test.ts

import { assertEquals } from 'jsr:@std/assert@1';
import {
  createTopicTagFilter,
  extractTopicTag,
  normalizeTopic,
  TOPIC_INSTRUCTION,
  TOPICS,
  type Topic,
} from './topic.ts';

Deno.test('the topic list is the approved one', () => {
  assertEquals(
    [...TOPICS],
    [
      'immigration',
      'work',
      'housing',
      'money',
      'taxes',
      'health',
      'education',
      'transportation',
      'settling_in',
      'other',
    ]
  );
});

Deno.test('the instruction names every topic and the tag format', () => {
  for (const topic of TOPICS) {
    assertEquals(TOPIC_INSTRUCTION.includes(`\n${topic} (`), true, topic);
  }
  assertEquals(TOPIC_INSTRUCTION.includes('[TOPIC]: '), true);
});

Deno.test('normalizeTopic accepts every label as written', () => {
  for (const topic of TOPICS) assertEquals(normalizeTopic(topic), topic);
});

Deno.test('normalizeTopic tolerates case, markdown, spacing and extra words', () => {
  assertEquals(normalizeTopic('Housing'), 'housing');
  assertEquals(normalizeTopic('**housing**'), 'housing');
  assertEquals(normalizeTopic(' "taxes". '), 'taxes');
  assertEquals(normalizeTopic('settling in'), 'settling_in');
  assertEquals(normalizeTopic('Settling-In'), 'settling_in');
  assertEquals(normalizeTopic('housing (renting)'), 'housing');
});

Deno.test('normalizeTopic is null for anything off the list', () => {
  assertEquals(normalizeTopic('nhà ở'), null); // translated label
  assertEquals(normalizeTopic('السكن'), null);
  assertEquals(normalizeTopic('rent'), null);
  assertEquals(normalizeTopic(''), null);
  assertEquals(normalizeTopic(undefined), null);
  assertEquals(normalizeTopic(42), null);
});

/** Run deltas through a fresh filter; return what the client would see. */
function streamed(deltas: string[]): string {
  const filter = createTopicTagFilter();
  return deltas.map(d => filter.push(d)).join('') + filter.flush();
}

/** Every way to cut `text` into two chunks and three chunks, and one
 *  character per chunk. */
function splits(text: string): string[][] {
  const out: string[][] = [[text], [...text]];
  for (let i = 0; i <= text.length; i++) {
    out.push([text.slice(0, i), text.slice(i)]);
    for (let j = i; j <= text.length; j++) {
      out.push([text.slice(0, i), text.slice(i, j), text.slice(j)]);
    }
  }
  return out;
}

/**
 * `answer` streams as `expected` at every chunk boundary, and extractTopicTag
 * saves the same text (trimmed when something was removed, byte-for-byte when
 * nothing was) with `topic` (null: no valid label, so the fallback `other`).
 */
function check(answer: string, expected: string, topic: Topic | null): void {
  for (const deltas of splits(answer)) {
    assertEquals(streamed(deltas), expected, JSON.stringify(deltas));
  }
  const result = extractTopicTag(answer);
  assertEquals(result.topic, topic ?? 'other', answer);
  assertEquals(result.labelled, topic !== null, answer);
  assertEquals(result.answer, expected === answer ? answer : expected.trim(), answer);
}

Deno.test('a tag on its own line: the whole line goes, newline included', () => {
  check('First.\n[TOPIC]: housing\nSecond sentence.', 'First.\nSecond sentence.', 'housing');
  check(
    'Answer.\n[SUGGESTIONS]: A? | B?\n[TOPIC]: housing',
    'Answer.\n[SUGGESTIONS]: A? | B?\n',
    'housing'
  );
  // Before the suggestions block.
  check(
    'Answer.\n[TOPIC]: money\n[SUGGESTIONS]: A? | B?',
    'Answer.\n[SUGGESTIONS]: A? | B?',
    'money'
  );
});

Deno.test('a tag after text on the same line: only the tag goes, the line break stays', () => {
  check('First. [TOPIC]: housing\nSecond sentence.', 'First.\nSecond sentence.', 'housing');
  check(
    'Done. [TOPIC]: housing\n[SUGGESTIONS]: A? | B?',
    'Done.\n[SUGGESTIONS]: A? | B?',
    'housing'
  );
  // At the end of the last sentence, no newline after it.
  check('You can rent online. [TOPIC]: housing', 'You can rent online.', 'housing');
  // Text after the tag on the same line stays.
  check('First. [TOPIC]: housing Second.', 'First. Second.', 'housing');
  // Emphasis that closes earlier text is not taken as the tag's wrapper.
  check('A *b* [TOPIC]: taxes', 'A *b*', 'taxes');
});

Deno.test('a wrapped tag goes whole, wrappers included', () => {
  check('Answer.\n`[TOPIC]: housing`', 'Answer.\n', 'housing');
  check('Answer.\n**[TOPIC]: health**', 'Answer.\n', 'health');
  check('Answer.\n**[TOPIC]:** Work\nMore.', 'Answer.\nMore.', 'work');
  check('Answer.\n*[TOPIC]: taxes*', 'Answer.\n', 'taxes');
  check('Answer.\n_[TOPIC]: education_', 'Answer.\n', 'education');
  check('First.\n  **`[TOPIC]: settling_in`**  \nSecond.', 'First.\nSecond.', 'settling_in');
  check('Answer.\n** [TOPIC]: housing', 'Answer.\n', 'housing');
  check('Answer.\n[TOPIC]: "transportation"', 'Answer.\n', 'transportation');
  check('Answer. `[TOPIC]: money`\nNext.', 'Answer.\nNext.', 'money');
});

Deno.test('CRLF line ends', () => {
  check('First. [TOPIC]: housing\r\nSecond.', 'First.\r\nSecond.', 'housing');
  check('First.\r\n[TOPIC]: work\r\nSecond.', 'First.\r\nSecond.', 'work');
});

Deno.test('label spelling: case, settling in', () => {
  check('Answer.\n[topic]: work', 'Answer.\n', 'work');
  check('Answer.\n[Topic]: Housing', 'Answer.\n', 'housing');
  check('Answer.\n[TOPIC]: settling in', 'Answer.\n', 'settling_in');
  check('Answer.\n[TOPIC]: Settling-In', 'Answer.\n', 'settling_in');
});

Deno.test('every topic is read from a valid tag', () => {
  for (const topic of TOPICS) {
    check(`Answer.\n[TOPIC]: ${topic}`, 'Answer.\n', topic);
  }
});

Deno.test('two tags: both are removed and the first one wins', () => {
  check('A.\n[TOPIC]: work\nB.\n[TOPIC]: health', 'A.\nB.\n', 'work');
  check('A. [TOPIC]: money\nB. [TOPIC]: taxes', 'A.\nB.', 'money');
});

Deno.test('[TOPIC] that is not a tag is ordinary text, unchanged', () => {
  for (const text of [
    'The form says [TOPIC] is optional.\nBring your lease.',
    'Fill in [TOPIC] and [NAME].',
    'Answer.\n[TOPIC] housing',
    // Off-list labels mid-answer: more text follows the line.
    'Answer.\n[TOPIC]: banking\nMore.',
    'Answer.\n[TOPIC]: السكن\nMore.',
    'Answer.\n[TOPIC]: nhà ở\n  \n\nMore.',
    'Answer.\n[TOPIC]:\nMore.',
    'Answer. [TOPIC]: workshops near you\nMore.',
    'Ends with [TOP',
    'Ends with **[topic]',
    'Ends with [TOPIC]: hous',
  ]) {
    check(text, text, null);
  }
});

Deno.test('text with no tag streams and saves byte-for-byte unchanged', () => {
  for (const text of [
    'Hello world.',
    'Answer.\n[SUGGESTIONS]: A? | B?',
    'See [IRCC](https://ircc.canada.ca) and [T] and **bold** and `code` and _it_ ',
    'Line one.\n\nLine two with [brackets] and [TO partial.',
    '  Indented, with trailing spaces   \n\n',
    'CRLF\r\nlines\r\n',
  ]) {
    check(text, text, null);
  }
});

Deno.test('the last line starting with [TOPIC]: goes whatever its label', () => {
  check('Answer.\n[TOPIC]: nhà ở', 'Answer.\n', null);
  check('Answer.\n[TOPIC]: السكن\n', 'Answer.\n', null);
  check('Answer.\n**[TOPIC]:** banking  \n \n', 'Answer.\n', null);
  check('Answer.\n[TOPIC]:', 'Answer.\n', null);
  check('Answer.\r\n[topic]: housing2\r\n', 'Answer.\r\n', null);
  // After the suggestions line: every suggestion stays.
  check(
    'Answer.\n[SUGGESTIONS]: A? | B? | C?\n[TOPIC]: nhà ở',
    'Answer.\n[SUGGESTIONS]: A? | B? | C?\n',
    null
  );
  // A valid tag earlier still sets the topic.
  check('A.\n[TOPIC]: work\nB.\n[TOPIC]: nhà ở', 'A.\nB.\n', 'work');
  // Not at the start of its line: ordinary text (round-4 rule).
  check('Answer. [TOPIC]: nhà ở', 'Answer. [TOPIC]: nhà ở', null);
});

Deno.test('the label must end at a word boundary, in any script', () => {
  check('Answer.\n[TOPIC]: housing2\nAfter.', 'Answer.\n[TOPIC]: housing2\nAfter.', null);
  check('Answer.\n[TOPIC]: housingé\nAfter.', 'Answer.\n[TOPIC]: housingé\nAfter.', null);
  check('Answer.\n[TOPIC]: housing_x\nAfter.', 'Answer.\n[TOPIC]: housing_x\nAfter.', null);
  check('Answer. [TOPIC]: housing2', 'Answer. [TOPIC]: housing2', null);
  check('Answer.\n[TOPIC]: housing.\nAfter.', 'Answer.\nAfter.', 'housing');
  check('Answer.\n[TOPIC]: housing**\nAfter.', 'Answer.\nAfter.', 'housing');
  check('Answer.\n[TOPIC]: housing', 'Answer.\n', 'housing');
});

Deno.test('a long line is decided the same however it is chunked', () => {
  const pad = ' '.repeat(70);
  // Trailing spaces never count toward the decision limit: the tag is still
  // alone on its line, so the whole line goes.
  check(`A.\n[TOPIC]: work${pad}`, 'A.\n', 'work');
  check(`A.\n[TOPIC]: work${pad}\nB.`, 'A.\nB.', 'work');
  check(`A.\n**[TOPIC]: work**${pad}\r\nB.`, 'A.\nB.', 'work');
  const long = `A [TOPIC] note that runs on${'.'.repeat(60)}\nB.`;
  check(long, long, null);
});

Deno.test('the stream filter holds back only a possible tag', () => {
  const filter = createTopicTagFilter();
  assertEquals(filter.push('Rent is due on the 1st. '), 'Rent is due on the 1st.');
  assertEquals(filter.push('It is'), ' It is');
  assertEquals(filter.push(' [TOPIC] '), '');
  assertEquals(filter.push('free.\n'), ' [TOPIC] free.\n');
  assertEquals(filter.flush(), '');
});
