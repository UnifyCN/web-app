// Companion actions contract, version 1 (mobile-app#361; decided in #360).
// Typed request parsing and the domain operation registry. Pure: no I/O, so the
// handler validates every request before it reaches the database. The database
// validates again (companion_validate_operations) as defence in depth.

export const CONTRACT_VERSION = 1;

export const TASK_STATES = ['not_started', 'in_progress', 'waiting', 'completed'] as const;
export type TaskState = (typeof TASK_STATES)[number];

export const PLATFORMS = ['ios', 'android', 'web'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const WAITING_REASON_MAX = 500;

/** One spelling per task: `custom:<id>` without padding, or a published Sanity id. */
export const TASK_REF = /^(sanity:(?!drafts\.|versions\.)[A-Za-z0-9][A-Za-z0-9._-]{0,127}|custom:[1-9][0-9]{0,17})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REVISION = 999_999_999_999_999;

/** Evidence of who authorized a write. A model can never produce either kind. */
export type Authorization =
  | { kind: 'ui_control' }
  | { kind: 'approved_proposal'; proposal_id: string; proposal_revision: number };
export type AuthorizationKind = Authorization['kind'];

export interface SetStateOperation {
  type: 'task.set_state';
  task_ref: string;
  state: TaskState;
  expected_revision: number;
  waiting_reason?: string;
}
export type Operation = SetStateOperation;

export type Parsed<T> = { ok: true; value: T } | { ok: false; status: 400 | 403 | 422; reason: string };
const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const refuse = (status: 400 | 403 | 422, reason: string): Parsed<never> => ({ ok: false, status, reason });

/**
 * One registry entry per domain operation. Every field is policy the handler and the
 * database enforce. Adding an operation means adding an entry, its SQL executor and
 * its tests; the database validator refuses any type it does not implement.
 */
export interface OperationSpec<Op extends Operation> {
  type: Op['type'];
  version: 1;
  /** The account is derived from the JWT; the operation acts only on that account's rows. */
  access: 'owner';
  classification: 'write';
  /** Authorization kinds that may carry this operation. */
  approval: readonly AuthorizationKind[];
  /** The caller must name the revision it saw; a different current revision is a conflict. */
  revisionCheck: 'expected_revision';
  /** Same operation id and payload replays the recorded receipt. */
  idempotency: 'operation_id';
  /** Undo applies the recorded inverse when the task is still at the receipt's revision. */
  undo: 'recorded_inverse';
  parse(raw: Record<string, unknown>): Parsed<Op>;
}

const isPlainInt = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_REVISION;

const setState: OperationSpec<SetStateOperation> = {
  type: 'task.set_state',
  version: 1,
  access: 'owner',
  classification: 'write',
  approval: ['ui_control', 'approved_proposal'],
  revisionCheck: 'expected_revision',
  idempotency: 'operation_id',
  undo: 'recorded_inverse',
  parse(raw) {
    for (const key of Object.keys(raw)) {
      if (!['type', 'task_ref', 'state', 'expected_revision', 'waiting_reason'].includes(key)) {
        return refuse(422, 'unknown_field');
      }
    }
    if (typeof raw.task_ref !== 'string' || !TASK_REF.test(raw.task_ref)) return refuse(422, 'invalid_task_ref');
    if (!isPlainInt(raw.expected_revision)) return refuse(422, 'expected_revision_required');
    if (typeof raw.state !== 'string' || !(TASK_STATES as readonly string[]).includes(raw.state)) {
      return refuse(422, 'invalid_state');
    }
    const state = raw.state as TaskState;
    const op: SetStateOperation = {
      type: 'task.set_state',
      task_ref: raw.task_ref,
      state,
      expected_revision: raw.expected_revision,
    };
    if (raw.waiting_reason !== undefined) {
      if (typeof raw.waiting_reason !== 'string' || state !== 'waiting') return refuse(422, 'invalid_waiting_reason');
      const reason = raw.waiting_reason.trim();
      if (reason.length > WAITING_REASON_MAX) return refuse(422, 'invalid_waiting_reason');
      // An empty reason is the same request as no reason: one canonical form per change.
      if (reason) op.waiting_reason = reason;
    }
    return ok(op);
  },
};

export const OPERATION_REGISTRY: { readonly [K in Operation['type']]: OperationSpec<Extract<Operation, { type: K }>> } = {
  'task.set_state': setState,
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseOperations(raw: unknown, authorization: Authorization): Parsed<Operation[]> {
  // One operation per request in this slice: a receipt summarizes exactly one task change.
  if (!Array.isArray(raw) || raw.length !== 1) return refuse(422, 'invalid_operations');
  const out: Operation[] = [];
  for (const item of raw) {
    if (!isObject(item)) return refuse(422, 'invalid_operations');
    const spec = typeof item.type === 'string'
      ? (OPERATION_REGISTRY as Record<string, OperationSpec<Operation> | undefined>)[item.type]
      : undefined;
    if (!spec) return refuse(422, 'unsupported_operation');
    if (!spec.approval.includes(authorization.kind)) return refuse(403, 'invalid_authorization');
    const parsed = spec.parse(item);
    if (!parsed.ok) return parsed;
    out.push(parsed.value);
  }
  return ok(out);
}

export function parseAuthorization(raw: unknown): Parsed<Authorization> {
  if (!isObject(raw)) return refuse(403, 'invalid_authorization');
  if (raw.kind === 'ui_control') return ok({ kind: 'ui_control' });
  if (raw.kind === 'approved_proposal') {
    if (typeof raw.proposal_id !== 'string' || !UUID.test(raw.proposal_id)) return refuse(403, 'invalid_authorization');
    if (!isPlainInt(raw.proposal_revision) || raw.proposal_revision > 2_147_483_647) {
      return refuse(403, 'invalid_authorization');
    }
    return ok({ kind: 'approved_proposal', proposal_id: raw.proposal_id, proposal_revision: raw.proposal_revision });
  }
  // direct_command, a model-supplied `approved: true`, or anything else.
  return refuse(403, 'invalid_authorization');
}

export interface Envelope {
  contract_version: number;
  platform: Platform;
}

export type ActionRequest =
  | { action: 'read' }
  | { action: 'status'; operation_id: string }
  | { action: 'apply'; operation_id: string; authorization: Authorization; operations: Operation[] }
  | { action: 'undo'; operation_id: string; receipt_operation_id: string; authorization: Authorization };

/** The version and platform, checked against the gate before anything else. */
export function parseEnvelope(body: unknown): Parsed<{ version: unknown; platform: unknown }> {
  if (!isObject(body)) return refuse(400, 'invalid_request');
  return ok({ version: body.contract_version, platform: isObject(body.client) ? body.client.platform : undefined });
}

export function parseAction(body: Record<string, unknown>): Parsed<ActionRequest> {
  switch (body.action) {
    case 'read':
      return ok({ action: 'read' });
    case 'status':
      if (typeof body.operation_id !== 'string' || !UUID.test(body.operation_id)) return refuse(400, 'invalid_operation_id');
      return ok({ action: 'status', operation_id: body.operation_id });
    case 'apply': {
      if (typeof body.operation_id !== 'string' || !UUID.test(body.operation_id)) return refuse(400, 'invalid_operation_id');
      const auth = parseAuthorization(body.authorization);
      if (!auth.ok) return auth;
      const ops = parseOperations(body.operations, auth.value);
      if (!ops.ok) return ops;
      return ok({ action: 'apply', operation_id: body.operation_id, authorization: auth.value, operations: ops.value });
    }
    case 'undo': {
      if (typeof body.operation_id !== 'string' || !UUID.test(body.operation_id)) return refuse(400, 'invalid_operation_id');
      if (typeof body.receipt_operation_id !== 'string' || !UUID.test(body.receipt_operation_id)) {
        return refuse(400, 'invalid_receipt_operation_id');
      }
      const auth = parseAuthorization(body.authorization);
      if (!auth.ok) return auth;
      // Undo is an explicit control of the signed-in user only.
      if (auth.value.kind !== 'ui_control') return refuse(403, 'invalid_authorization');
      return ok({
        action: 'undo',
        operation_id: body.operation_id,
        receipt_operation_id: body.receipt_operation_id,
        authorization: auth.value,
      });
    }
    default:
      return refuse(400, 'invalid_action');
  }
}
