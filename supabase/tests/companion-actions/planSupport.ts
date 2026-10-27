// Plan fixtures shared by the #364 test files. Fictional validation data only.
import { assertEquals } from 'jsr:@std/assert@1';
import { type Account, existingItem, existingSanityTask, newAccount, newItem, planPrepare, setProfile } from './support.ts';

export const GOAL = 'Your first week in Vancouver';
export const PHONE = 'Set up phone service';

export async function vancouverArrival(label: string) {
  const a = await newAccount(label);
  await setProfile(a, {
    persona: 'skilled_worker', city: 'Vancouver', province: 'British Columbia',
    arrival_date: '2026-11-02T00:00:00Z', stage: 0, wants_reminders: false,
  });
  const sin = await existingSanityTask(a, 'sin-number');
  const bank = await existingSanityTask(a, 'bank-account');
  return { a, sin, bank };
}

export const journeyItems = (sin: string, bank: string) =>
  [existingItem(sin, 'Get your SIN'), existingItem(bank, 'Open a bank account'), newItem(PHONE)];

export async function draftFor(a: Account, sin: string, bank: string, extra: Record<string, unknown> = {}) {
  const p = await planPrepare(a, GOAL, journeyItems(sin, bank), extra);
  assertEquals(p.status, 200, JSON.stringify(p.json));
  return p.json.plan_proposal;
}

/** The draft items as the client sends them back after an edit. */
export const draftItems = (items: Array<Record<string, unknown>>) =>
  items.map(i => i.kind === 'existing' ? { kind: 'existing', task_ref: i.task_ref }
    : { kind: 'new', key: i.key, include: i.include, ...(i.confirm_new ? { confirm_new: true } : {}) });

