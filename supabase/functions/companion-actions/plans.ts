// Settlement plan actions (mobile-app#364), same contract version 1 and the same
// authenticated boundary as the task actions: new actions only, which version 1
// clients ignore. A plan refers to shared Checklist tasks; it never copies progress.
// The account comes from the JWT only (the handler passes it in); every write is one SQL
// transaction run by the service role; no model or generation allowance is involved.
//
// Pure parsing here; the database validates everything again.

import { PRIORITIES, type Parsed, TASK_REF, TITLE_MAX } from './contract.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_INT = 2_147_483_647;
// deno-lint-ignore no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
export const GOAL_MAX = 120;
export const LABEL_MAX = 160;
export const PLAN_ITEMS_MAX = 12;
export const PLAN_ADDITIONS_MAX = 5;

export const PLAN_ACTIONS = [
  'plan_prepare', 'plan_proposal', 'plan_revise', 'plan_cancel', 'plan_apply', 'plan_status', 'plan_retry',
  'plan_undo', 'plans', 'conversation_plans',
] as const;
export type PlanActionName = (typeof PLAN_ACTIONS)[number];

/** A prepared item: an existing task by stable identity, or a suggested addition. */
export type PlanItemInput =
  | { kind: 'existing'; task_ref: string; label?: string }
  | { kind: 'new'; title: string; priority?: (typeof PRIORITIES)[number]; candidates?: string[] };

export type PlanAuthorization =
  | { kind: 'approved_proposal'; proposal_id: string; proposal_revision: number; removal_confirmed?: true };

export interface PlanSource {
  conversation_id: string;
  message_id?: number;
}

export type PlanRequest =
  | { action: 'plan_prepare'; goal: string; items: PlanItemInput[]; source: PlanSource | null }
  | { action: 'plan_proposal'; plan_proposal_id: string }
  | { action: 'plans' }
  | { action: 'plan_status'; operation_id: string }
  | { action: 'conversation_plans'; conversation_id: string }
  | { action: 'plan_retry'; operation_id: string; receipt_operation_id: string; authorization: { kind: 'ui_control' } }
  | {
    action: 'plan_undo';
    operation_id: string;
    receipt_operation_id: string;
    authorization: { kind: 'ui_control'; removal_confirmed?: true };
  }
  | { action: 'plan_revise'; plan_proposal_id: string; proposal_revision: number; items: unknown[] }
  | { action: 'plan_cancel'; plan_proposal_id: string; proposal_revision: number }
  | { action: 'plan_apply'; operation_id: string; authorization: PlanAuthorization; items: unknown[] };

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const refuse = (status: 400 | 403 | 422, reason: string): Parsed<never> => ({ ok: false, status, reason });
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_INT;
const plain = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v === v.trim() && v.length >= 1 && v.length <= max && !CONTROL.test(v);

export const isPlanAction = (action: unknown): action is PlanActionName =>
  typeof action === 'string' && (PLAN_ACTIONS as readonly string[]).includes(action);

function parseItems(raw: unknown): Parsed<PlanItemInput[]> {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > PLAN_ITEMS_MAX) return refuse(422, 'invalid_items');
  const out: PlanItemInput[] = [];
  let additions = 0;
  for (const item of raw) {
    if (!isObject(item)) return refuse(422, 'invalid_items');
    if (item.kind === 'existing') {
      if (Object.keys(item).some(k => !['kind', 'task_ref', 'label'].includes(k))) return refuse(422, 'unknown_field');
      if (typeof item.task_ref !== 'string' || !TASK_REF.test(item.task_ref)) return refuse(422, 'invalid_task_ref');
      if (item.label !== undefined && !plain(item.label, LABEL_MAX)) return refuse(422, 'invalid_label');
      out.push({ kind: 'existing', task_ref: item.task_ref, ...(item.label === undefined ? {} : { label: item.label }) });
    } else if (item.kind === 'new') {
      if (Object.keys(item).some(k => !['kind', 'title', 'priority', 'candidates'].includes(k))) {
        return refuse(422, 'unknown_field');
      }
      if (!plain(item.title, TITLE_MAX)) return refuse(422, 'invalid_title');
      if (item.priority !== undefined && !(PRIORITIES as readonly unknown[]).includes(item.priority)) {
        return refuse(422, 'invalid_priority');
      }
      if (item.candidates !== undefined && (!Array.isArray(item.candidates) || item.candidates.length > 3 ||
          item.candidates.some(c => typeof c !== 'string' || !TASK_REF.test(c) || !c.startsWith('sanity:')))) {
        return refuse(422, 'invalid_candidates');
      }
      additions++;
      out.push({
        kind: 'new',
        title: item.title,
        ...(item.priority === undefined ? {} : { priority: item.priority as (typeof PRIORITIES)[number] }),
        ...(item.candidates === undefined ? {} : { candidates: item.candidates as string[] }),
      });
    } else {
      return refuse(422, 'invalid_items');
    }
  }
  if (additions > PLAN_ADDITIONS_MAX) return refuse(422, 'too_many_additions');
  return ok(out);
}

function parseSource(raw: unknown): Parsed<PlanSource | null> {
  if (raw === undefined || raw === null) return ok(null);
  if (!isObject(raw) || Object.keys(raw).some(k => k !== 'conversation_id' && k !== 'message_id')) {
    return refuse(422, 'invalid_source');
  }
  if (typeof raw.conversation_id !== 'string' || !UUID.test(raw.conversation_id)) return refuse(422, 'invalid_source');
  if (raw.message_id !== undefined && !isInt(raw.message_id)) return refuse(422, 'invalid_source');
  return ok({
    conversation_id: raw.conversation_id.toLowerCase(),
    ...(raw.message_id === undefined ? {} : { message_id: raw.message_id as number }),
  });
}

function parseApproval(raw: unknown): Parsed<PlanAuthorization> {
  // Only the user's approval of a displayed draft revision. A model-supplied flag,
  // a direct command or a bare UI control cannot approve a plan.
  if (!isObject(raw) || raw.kind !== 'approved_proposal') return refuse(403, 'invalid_authorization');
  if (Object.keys(raw).some(k => !['kind', 'proposal_id', 'proposal_revision', 'removal_confirmed'].includes(k))) {
    return refuse(403, 'invalid_authorization');
  }
  if (typeof raw.proposal_id !== 'string' || !UUID.test(raw.proposal_id) || !isInt(raw.proposal_revision)) {
    return refuse(403, 'invalid_authorization');
  }
  if (raw.removal_confirmed !== undefined && raw.removal_confirmed !== true) return refuse(403, 'invalid_authorization');
  return ok({
    kind: 'approved_proposal',
    proposal_id: raw.proposal_id.toLowerCase(),
    proposal_revision: raw.proposal_revision,
    ...(raw.removal_confirmed ? { removal_confirmed: true as const } : {}),
  });
}

export function parsePlanAction(body: Record<string, unknown>): Parsed<PlanRequest> {
  switch (body.action as PlanActionName) {
    case 'plan_prepare': {
      if (!plain(body.goal, GOAL_MAX)) return refuse(422, 'invalid_goal');
      const items = parseItems(body.items);
      if (!items.ok) return items;
      const source = parseSource(body.source);
      if (!source.ok) return source;
      return ok({ action: 'plan_prepare', goal: body.goal, items: items.value, source: source.value });
    }
    case 'plan_proposal':
      if (typeof body.plan_proposal_id !== 'string' || !UUID.test(body.plan_proposal_id)) {
        return refuse(400, 'invalid_proposal_id');
      }
      return ok({ action: 'plan_proposal', plan_proposal_id: body.plan_proposal_id });
    case 'plans':
      return ok({ action: 'plans' });
    case 'plan_retry': {
      if (typeof body.operation_id !== 'string' || !UUID.test(body.operation_id)) return refuse(400, 'invalid_operation_id');
      if (typeof body.receipt_operation_id !== 'string' || !UUID.test(body.receipt_operation_id)) {
        return refuse(400, 'invalid_receipt_operation_id');
      }
      // The user's own Retry control on the receipt. The original approval covers the items.
      if (!isObject(body.authorization) || body.authorization.kind !== 'ui_control' ||
          Object.keys(body.authorization).length !== 1) {
        return refuse(403, 'invalid_authorization');
      }
      return ok({
        action: 'plan_retry',
        operation_id: body.operation_id,
        receipt_operation_id: body.receipt_operation_id,
        authorization: { kind: 'ui_control' },
      });
    }
    case 'plan_undo': {
      if (typeof body.operation_id !== 'string' || !UUID.test(body.operation_id)) return refuse(400, 'invalid_operation_id');
      if (typeof body.receipt_operation_id !== 'string' || !UUID.test(body.receipt_operation_id)) {
        return refuse(400, 'invalid_receipt_operation_id');
      }
      // The user's own Undo control on that receipt; removal_confirmed when the user
      // confirmed removing the tasks the plan added.
      const auth = body.authorization;
      if (!isObject(auth) || auth.kind !== 'ui_control' ||
          Object.keys(auth).some(k => k !== 'kind' && k !== 'removal_confirmed') ||
          (auth.removal_confirmed !== undefined && auth.removal_confirmed !== true)) {
        return refuse(403, 'invalid_authorization');
      }
      return ok({
        action: 'plan_undo',
        operation_id: body.operation_id,
        receipt_operation_id: body.receipt_operation_id,
        authorization: { kind: 'ui_control', ...(auth.removal_confirmed ? { removal_confirmed: true as const } : {}) },
      });
    }
    case 'conversation_plans':
      if (typeof body.conversation_id !== 'string' || !UUID.test(body.conversation_id)) {
        return refuse(400, 'invalid_conversation_id');
      }
      return ok({ action: 'conversation_plans', conversation_id: body.conversation_id.toLowerCase() });
    case 'plan_status':
      if (typeof body.operation_id !== 'string' || !UUID.test(body.operation_id)) return refuse(400, 'invalid_operation_id');
      return ok({ action: 'plan_status', operation_id: body.operation_id });
    case 'plan_revise':
    case 'plan_cancel': {
      if (typeof body.plan_proposal_id !== 'string' || !UUID.test(body.plan_proposal_id)) {
        return refuse(400, 'invalid_proposal_id');
      }
      if (!isInt(body.proposal_revision)) return refuse(400, 'invalid_proposal_revision');
      if (body.action === 'plan_cancel') {
        return ok({ action: 'plan_cancel', plan_proposal_id: body.plan_proposal_id, proposal_revision: body.proposal_revision });
      }
      // The edited draft: { kind: 'existing', task_ref } or { kind: 'new', key, include,
      // confirm_new? }. The database rebuilds titles from the original draft.
      if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > PLAN_ITEMS_MAX) {
        return refuse(422, 'invalid_items');
      }
      return ok({
        action: 'plan_revise',
        plan_proposal_id: body.plan_proposal_id,
        proposal_revision: body.proposal_revision,
        items: body.items,
      });
    }
    case 'plan_apply': {
      if (typeof body.operation_id !== 'string' || !UUID.test(body.operation_id)) return refuse(400, 'invalid_operation_id');
      const auth = parseApproval(body.authorization);
      if (!auth.ok) return auth;
      if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > PLAN_ITEMS_MAX) {
        return refuse(422, 'invalid_items');
      }
      return ok({ action: 'plan_apply', operation_id: body.operation_id, authorization: auth.value, items: body.items });
    }
    default:
      return refuse(400, 'invalid_action');
  }
}
