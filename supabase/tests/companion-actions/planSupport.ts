// Plan fixtures shared by the #364 test files. Fictional validation data only.
import { assertEquals } from 'jsr:@std/assert@1';
import {
  type Account, existingItem, existingSanityTask, newAccount, newItem, planApply, planPrepare, setProfile, sql,
} from './support.ts';

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


/**
 * A deliberate, narrow fault: inserting a custom task with this exact title fails, as a
 * real write can. Installed and removed by the test; no product code knows about it.
 */
export async function failTitle(title: string): Promise<() => Promise<void>> {
  await sql.unsafe(`create or replace function public.test364_fail_title() returns trigger language plpgsql as $f$
    begin if new.title = ${"'"}${title.replace(/'/g, "''")}${"'"} then raise exception 'injected fault'; end if; return new; end $f$`);
  await sql`create trigger test364_fail_title before insert on custom_checklist_tasks
    for each row execute function public.test364_fail_title()`;
  return async () => {
    await sql`drop trigger if exists test364_fail_title on custom_checklist_tasks`;
    await sql`drop function if exists public.test364_fail_title()`;
  };
}

/** The reference plan saved while the phone addition fails: SIN and bank reused, phone failed. */
export async function partialPlan(label: string) {
  const { a, sin, bank } = await vancouverArrival(label);
  const draft = await draftFor(a, sin, bank);
  const heal = await failTitle(PHONE);
  let w;
  try {
    w = await planApply(a, draft);
  } finally {
    await heal();
  }
  assertEquals([w.status, w.json.status], [200, 'partial'], JSON.stringify(w.json));
  return {
    a, sin, bank, draft, saved: w.json,
    planOp: w.json.operation_id as string,
    phoneOp: w.json.receipt.results[2].item_operation_id as string,
  };
}
