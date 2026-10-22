// Companion topic label (spec UnifyCN/mobile-app#314, ticket #318).
//
// rag-query labels every question with exactly one topic from a fixed list
// (approved by Savar 2026-10-21). The label goes on `$ai_generation` and back
// to the client; the question text never does. The expected labels below are
// worked examples of what a person would file each question under.
//
// RUN (from web-app/):
//   deno test supabase/functions/rag-query/lib/topic_test.ts

import { assert, assertEquals } from 'jsr:@std/assert@1';
import { classifyTopic, isTopic, TOPICS } from './topic.ts';

Deno.test('the topic list is exactly the approved list', () => {
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

const EXAMPLES: Array<[string, string]> = [
  // immigration
  ['How do I apply for permanent residence through Express Entry?', 'immigration'],
  ['When can I apply for Canadian citizenship?', 'immigration'],
  ['My study permit expires next month, what do I do?', 'immigration'],
  ['How long does a PGWP take to process?', 'immigration'],
  ['Can I sponsor my parents to come to Canada?', 'immigration'],
  ['How do I renew my PR card?', 'immigration'],
  ['Can I work more than 24 hours a week on a work permit?', 'immigration'],
  // work
  ['How do I find a job in Toronto?', 'work'],
  ['Can you help me write a resume for Canadian employers?', 'work'],
  ['What is the minimum wage in Alberta?', 'work'],
  ['How should I prepare for a job interview?', 'work'],
  // housing
  ['How do I find an apartment to rent in Vancouver?', 'housing'],
  ['My landlord wants a deposit of three months, is that legal?', 'housing'],
  ['What should I check before signing a lease?', 'housing'],
  // money
  ['How do I open a bank account as a newcomer?', 'money'],
  ['How can I build my credit score in Canada?', 'money'],
  ['What is the difference between a TFSA and an RRSP?', 'money'],
  ['Am I eligible for the Canada Child Benefit?', 'money'],
  // taxes
  ['Do I need to file taxes in my first year in Canada?', 'taxes'],
  ['How do I file a tax return with the CRA?', 'taxes'],
  ['What is a T4 slip?', 'taxes'],
  // health
  ['How do I get an OHIP card?', 'health'],
  ['How do I find a family doctor?', 'health'],
  ['Is dental care covered for newcomers?', 'health'],
  ['Where can I get help for my mental health?', 'health'],
  // education
  ['How do I get my foreign degree assessed by WES?', 'education'],
  ['How do I enrol my kids in school?', 'education'],
  ['Are there free English classes for newcomers?', 'education'],
  ['Which college programs are good for international students?', 'education'],
  // transportation
  ['How do I get a driver\'s licence in Ontario?', 'transportation'],
  ['What is the cheapest way to take transit in Montreal?', 'transportation'],
  ['Do I need car insurance before I drive?', 'transportation'],
  // settling_in
  ['How do I get a Social Insurance Number?', 'settling_in'],
  ['What phone plan should I get when I arrive?', 'settling_in'],
  ['How do I prepare for my first winter?', 'settling_in'],
  ['Where can I find a food bank near me?', 'settling_in'],
  // other
  ['Tell me a joke', 'other'],
  ['What is the capital of Australia?', 'other'],
  ['', 'other'],
];

for (const [prompt, expected] of EXAMPLES) {
  Deno.test(`"${prompt}" -> ${expected}`, () => {
    assertEquals(classifyTopic(prompt), expected);
  });
}

Deno.test('a follow-up with no topic words takes the topic of earlier context', () => {
  assertEquals(
    classifyTopic('How long does that usually take?', [
      'How do I apply for a work permit?',
    ]),
    'immigration'
  );
});

Deno.test('context is used in order: the first one with a topic wins', () => {
  assertEquals(
    classifyTopic('And after that?', [
      'Thanks!',
      'How do I open a bank account?',
      'How do I find an apartment?',
    ]),
    'money'
  );
});

Deno.test('the question itself beats the earlier context', () => {
  assertEquals(
    classifyTopic('Do I need to file taxes?', ['How do I find an apartment?']),
    'taxes'
  );
});

Deno.test('a lesson title used as context labels an in-lesson question', () => {
  assertEquals(
    classifyTopic('What does this mean?', ['Opening a bank account']),
    'money'
  );
});

Deno.test('non-string input never throws and yields "other"', () => {
  // deno-lint-ignore no-explicit-any
  assertEquals(classifyTopic(undefined as any), 'other');
  // deno-lint-ignore no-explicit-any
  assertEquals(classifyTopic('???', [null as any, 42 as any]), 'other');
});

Deno.test('isTopic accepts only the fixed list', () => {
  for (const topic of TOPICS) assert(isTopic(topic));
  assert(!isTopic('Immigration'));
  assert(!isTopic('newcomer_settlement'));
  assert(!isTopic(undefined));
});
