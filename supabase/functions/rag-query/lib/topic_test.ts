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

Deno.test('extractTopicTag handles a tag before the suggestions or in markdown', () => {
  const before = extractTopicTag('Answer.\n[TOPIC]: money\n[SUGGESTIONS]: A? | B?');
  assertEquals(before.topic, 'money');
  assertEquals(before.answer, 'Answer.\n\n[SUGGESTIONS]: A? | B?');

  const bold = extractTopicTag('Answer.\n**[TOPIC]:** Work');
  assertEquals(bold.topic, 'work');
  assertEquals(bold.answer, 'Answer.');

  const lower = extractTopicTag('Answer. [topic] taxes');
  assertEquals(lower.topic, 'taxes');
  assertEquals(lower.answer, 'Answer.');
});

Deno.test('extractTopicTag falls back to "other" for a missing or invalid label', () => {
  const missing = extractTopicTag('Answer.\n[SUGGESTIONS]: A? | B?');
  assertEquals(missing.topic, 'other');
  assertEquals(missing.labelled, false);
  assertEquals(missing.answer, 'Answer.\n[SUGGESTIONS]: A? | B?');

  const invalid = extractTopicTag('Answer.\n[TOPIC]: السكن');
  assertEquals(invalid.topic, 'other');
  assertEquals(invalid.labelled, false);
  assertEquals(invalid.answer, 'Answer.');

  const empty = extractTopicTag('Answer.\n[TOPIC]:');
  assertEquals(empty.topic, 'other');
  assertEquals(empty.answer, 'Answer.');
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

Deno.test('the stream filter forwards plain text unchanged', () => {
  assertEquals(streamed(['Hello ', 'world.']), 'Hello world.');
  // Brackets that are not the tag (markdown links, lists) pass through.
  assertEquals(
    streamed(['See [IR', 'CC](https://ircc.canada.ca) and [', 'T]']),
    'See [IRCC](https://ircc.canada.ca) and [T]'
  );
  // A held partial tag at the very end is released by flush.
  assertEquals(streamed(['Ends with [TO']), 'Ends with [TO');
});

Deno.test('the stream filter never forwards the tag, even split across chunks', () => {
  const answer = 'Answer.\n[SUGGESTIONS]: A? | B?\n';
  assertEquals(streamed([answer, '[TOPIC]: housing']), answer);
  assertEquals(streamed([answer + '[', 'TO', 'PIC', ']: hou', 'sing']), answer);
  assertEquals(streamed([answer + '[topic]: work']), answer);
  // Text after the tag is held back too.
  assertEquals(streamed(['Answer.[TOPIC]: money', ' more']), 'Answer.');
});

Deno.test('the stream filter only holds back a possible tag start', () => {
  const filter = createTopicTagFilter();
  assertEquals(filter.push('Rent is due on the 1st ['), 'Rent is due on the 1st ');
  assertEquals(filter.push('note]'), '[note]');
  assertEquals(filter.flush(), '');
});
