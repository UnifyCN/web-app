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

Deno.test('extractTopicTag reads the label and strips the tag', () => {
  const result = extractTopicTag(
    'Bạn có thể thuê nhà qua các trang web.\n[SUGGESTIONS]: Tiền đặt cọc là bao nhiêu? | Tôi cần giấy tờ gì?\n[TOPIC]: housing'
  );
  assertEquals(result.topic, 'housing');
  assertEquals(result.labelled, true);
  assertEquals(
    result.answer,
    'Bạn có thể thuê nhà qua các trang web.\n[SUGGESTIONS]: Tiền đặt cọc là bao nhiêu? | Tôi cần giấy tờ gì?'
  );
});

Deno.test('extractTopicTag reads every topic, not just one', () => {
  for (const topic of TOPICS) {
    const result = extractTopicTag(`Answer.\n[TOPIC]: ${topic}`);
    assertEquals(result.topic, topic);
    assertEquals(result.labelled, true);
    assertEquals(result.answer, 'Answer.');
  }
});

Deno.test('extractTopicTag removes only the tag line; text after it is kept', () => {
  const mid = extractTopicTag('First.\n[TOPIC]: housing\nSecond sentence.');
  assertEquals(mid.topic, 'housing');
  assertEquals(mid.answer, 'First.\nSecond sentence.');

  const before = extractTopicTag('Answer.\n[TOPIC]: money\n[SUGGESTIONS]: A? | B?');
  assertEquals(before.topic, 'money');
  assertEquals(before.answer, 'Answer.\n[SUGGESTIONS]: A? | B?');

  const sameLine = extractTopicTag('Answer. [topic] taxes');
  assertEquals(sameLine.topic, 'taxes');
  assertEquals(sameLine.answer, 'Answer.');
});

Deno.test('extractTopicTag strips a wrapped tag whole, leaving no markdown behind', () => {
  const cases: Array<[string, string, string]> = [
    ['Answer.\n`[TOPIC]: housing`', 'housing', 'Answer.'],
    ['Answer.\n**[TOPIC]: health**', 'health', 'Answer.'],
    ['Answer.\n**[TOPIC]:** Work', 'work', 'Answer.'],
    ['Answer.\n*[TOPIC]: taxes*', 'taxes', 'Answer.'],
    ['Answer.\n_[TOPIC]: education_', 'education', 'Answer.'],
    ['Answer.\n  **`[TOPIC]: settling_in`**  \n', 'settling_in', 'Answer.'],
    ['First.\n`[TOPIC]: money`\nSecond.', 'money', 'First.\nSecond.'],
    ['Answer.   \n\n[TOPIC]: transportation   \n\n', 'transportation', 'Answer.'],
  ];
  for (const [input, topic, answer] of cases) {
    const result = extractTopicTag(input);
    assertEquals(result.topic, topic, input);
    assertEquals(result.answer, answer, input);
    for (const mark of ['`', '**', '[TOPIC]', '[topic]']) {
      assertEquals(result.answer.includes(mark), false, `${input} left ${mark}`);
    }
  }
});

Deno.test('extractTopicTag: a missing tag leaves the answer byte-for-byte unchanged', () => {
  const answers = [
    'Answer.\n[SUGGESTIONS]: A? | B?',
    'See [IRCC](https://ircc.canada.ca) and **bold** and `code`.',
    'Line one.\n\nLine two with [brackets] and [TO partial.',
    '  Indented, with trailing spaces   \n\n',
  ];
  for (const answer of answers) {
    const result = extractTopicTag(answer);
    assertEquals(result.answer, answer);
    assertEquals(result.topic, 'other');
    assertEquals(result.labelled, false);
  }
});

Deno.test('extractTopicTag falls back to "other" for an invalid label', () => {
  const invalid = extractTopicTag('Answer.\n[TOPIC]: السكن');
  assertEquals(invalid.topic, 'other');
  assertEquals(invalid.labelled, false);
  assertEquals(invalid.answer, 'Answer.');

  const empty = extractTopicTag('Answer.\n[TOPIC]:');
  assertEquals(empty.topic, 'other');
  assertEquals(empty.labelled, false);
  assertEquals(empty.answer, 'Answer.');

  const unknown = extractTopicTag('Answer.\n[TOPIC]: banking');
  assertEquals(unknown.topic, 'other');
  assertEquals(unknown.answer, 'Answer.');
});

Deno.test('extractTopicTag: the last tag wins and every tag is removed', () => {
  const result = extractTopicTag('[TOPIC]: work\nAnswer.\n[TOPIC]: health');
  assertEquals(result.topic, 'health');
  assertEquals(result.answer, 'Answer.');
});

/** Run deltas through a fresh filter; return what the client would see. */
function streamed(deltas: string[]): string {
  const filter = createTopicTagFilter();
  return deltas.map(d => filter.push(d)).join('') + filter.flush();
}

/** Every way to cut `text` into two chunks, three chunks around the middle,
 *  and one character per chunk. */
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

/** The answer streams the same at every chunk boundary, and the streamed text
 *  is what extractTopicTag keeps (up to surrounding whitespace). */
function assertStreamsAs(answer: string, expected: string): void {
  for (const deltas of splits(answer)) {
    assertEquals(streamed(deltas), expected, JSON.stringify(deltas));
  }
  assertEquals(extractTopicTag(answer).answer.trim(), expected.trim(), answer);
}

Deno.test('the stream filter forwards plain text unchanged', () => {
  for (const text of [
    'Hello world.',
    'See [IRCC](https://ircc.canada.ca) and [T]',
    'Ends with [TO',
    'Some **bold** and `code` and _it_ ',
  ]) {
    assertStreamsAs(text, text);
  }
});

Deno.test('the stream filter removes only the tag line; text after it keeps streaming', () => {
  assertStreamsAs('First.\n[TOPIC]: housing\nSecond sentence.', 'First.\nSecond sentence.');
  assertStreamsAs(
    'Answer.\n[SUGGESTIONS]: A? | B?\n[TOPIC]: housing',
    'Answer.\n[SUGGESTIONS]: A? | B?\n'
  );
  assertStreamsAs('Answer.\n[topic]: work', 'Answer.\n');
  assertStreamsAs('Answer.[TOPIC]: money\n more', 'Answer. more');
});

Deno.test('the stream filter strips a wrapped tag whole, at every chunk boundary', () => {
  assertStreamsAs('Answer.\n`[TOPIC]: housing`', 'Answer.\n');
  assertStreamsAs('Answer.\n**[TOPIC]: housing**', 'Answer.\n');
  assertStreamsAs('Answer.\n**[TOPIC]:** Work\nMore.', 'Answer.\nMore.');
  assertStreamsAs('First.\n  `[TOPIC]: money`  \nSecond.', 'First.\nSecond.');
  assertStreamsAs('A *b* [TOPIC]: taxes', 'A *b*');
});

Deno.test('the stream filter only holds back a possible tag start', () => {
  const filter = createTopicTagFilter();
  assertEquals(filter.push('Rent is due on the 1st ['), 'Rent is due on the 1st');
  assertEquals(filter.push('note]'), ' [note]');
  assertEquals(filter.flush(), '');
});
