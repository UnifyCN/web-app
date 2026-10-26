// Companion actions contract, version 1 (mobile-app#361; decided in #360; task
// creation and proposals added in #363 within the same version: new actions and
// fields only, which version 1 clients ignore).
// Typed request parsing and the domain operation registry. Pure: no I/O, so the
// handler validates every request before it reaches the database. The database
// validates again (companion_validate_operations) as defence in depth.

export const CONTRACT_VERSION = 1;

export const TASK_STATES = ['not_started', 'in_progress', 'waiting', 'completed'] as const;
export type TaskState = (typeof TASK_STATES)[number];

export const PLATFORMS = ['ios', 'android', 'web'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const WAITING_REASON_MAX = 500;
export const TITLE_MAX = 200;
export const PRIORITIES = ['Do now', 'Do soon', 'Explore and connect', 'Optional / later'] as const;
export type Priority = (typeof PRIORITIES)[number];

/** One spelling per task: `custom:<id>` without padding, or a published Sanity id. */
export const TASK_REF = /^(sanity:(?!drafts\.|versions\.)[A-Za-z0-9][A-Za-z0-9._-]{0,127}|custom:[1-9][0-9]{0,17})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REVISION = 999_999_999_999_999;

/** Evidence of who authorized a write. A model can never produce either kind. */
export type Authorization =
  | { kind: 'ui_control' }
  | { kind: 'approved_proposal'; proposal_id: string; proposal_revision: number }
  /** The user's own saved message that is one clear command (resolved by commands.ts). */
  | { kind: 'direct_command'; message_id: number };
export type AuthorizationKind = Authorization['kind'];

export interface SetStateOperation {
  type: 'task.set_state';
  task_ref: string;
  state: TaskState;
  expected_revision: number;
  waiting_reason?: string;
}
export interface CreateCustomOperation {
  type: 'task.create_custom';
  title: string;
  priority: Priority;
}
export type Operation = SetStateOperation | CreateCustomOperation;

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
  /**
   * expected_revision: the caller names the revision it saw; a different current
   * revision is a conflict. proposal_context: an approved proposal's relevant
   * context (profile fields, same-title tasks) is read again before the write.
   */
  revisionCheck: 'expected_revision' | 'proposal_context';
  /** Same operation id and payload replays the recorded receipt. */
  idempotency: 'operation_id';
  /** Undo applies the recorded inverse when the task is still at the receipt's revision. */
  undo: 'recorded_inverse';
  /** Undo of this operation removes a task: it needs the user's explicit confirmation. */
  undoRemoves: boolean;
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
  undoRemoves: false,
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

// One line of plain text. Control characters (newlines included) are refused, not
// rewritten, so the stored title is exactly the reviewed one.
// deno-lint-ignore no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

const createCustom: OperationSpec<CreateCustomOperation> = {
  type: 'task.create_custom',
  version: 1,
  access: 'owner',
  classification: 'write',
  // Never ui_control: a new task comes from a reviewed proposal or the user's own clear command.
  approval: ['approved_proposal', 'direct_command'],
  revisionCheck: 'proposal_context',
  idempotency: 'operation_id',
  undo: 'recorded_inverse',
  undoRemoves: true,
  parse(raw) {
    for (const key of Object.keys(raw)) {
      if (!['type', 'title', 'priority'].includes(key)) return refuse(422, 'unknown_field');
    }
    if (typeof raw.title !== 'string') return refuse(422, 'invalid_title');
    const title = raw.title.trim();
    if (!title || title.length > TITLE_MAX || CONTROL.test(title)) return refuse(422, 'invalid_title');
    if (typeof raw.priority !== 'string' || !(PRIORITIES as readonly string[]).includes(raw.priority)) {
      return refuse(422, 'invalid_priority');
    }
    return ok({ type: 'task.create_custom', title, priority: raw.priority as Priority });
  },
};

export const OPERATION_REGISTRY: { readonly [K in Operation['type']]: OperationSpec<Extract<Operation, { type: K }>> } = {
  'task.set_state': setState,
  'task.create_custom': createCustom,
};

/** One operation through its registry entry, without authorization (prepare, revise). */
export function parseOperation(raw: unknown): Parsed<Operation> {
  if (!isObject(raw)) return refuse(422, 'invalid_operations');
  const spec = typeof raw.type === 'string' && Object.hasOwn(OPERATION_REGISTRY, raw.type)
    ? (OPERATION_REGISTRY as Record<string, OperationSpec<Operation>>)[raw.type]
    : undefined;
  if (!spec) return refuse(422, 'unsupported_operation');
  return spec.parse(raw);
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseOperations(raw: unknown, authorization: Authorization): Parsed<Operation[]> {
  // One operation per request in this slice: a receipt summarizes exactly one task change.
  if (!Array.isArray(raw) || raw.length !== 1) return refuse(422, 'invalid_operations');
  const out: Operation[] = [];
  for (const item of raw) {
    if (!isObject(item)) return refuse(422, 'invalid_operations');
    // Own entries only: a name every object inherits (constructor, toString,
    // __proto__) is an unsupported type, not a registry entry.
    const spec = typeof item.type === 'string' && Object.hasOwn(OPERATION_REGISTRY, item.type)
      ? (OPERATION_REGISTRY as Record<string, OperationSpec<Operation>>)[item.type]
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
  if (raw.kind === 'direct_command') {
    if (Object.keys(raw).some(k => k !== 'kind' && k !== 'message_id')) return refuse(403, 'invalid_authorization');
    if (!isPlainInt(raw.message_id) || raw.message_id > 2_147_483_647) return refuse(403, 'invalid_authorization');
    return ok({ kind: 'direct_command', message_id: raw.message_id });
  }
  // A model-supplied `approved: true`, or anything else.
  return refuse(403, 'invalid_authorization');
}

export interface Envelope {
  contract_version: number;
  platform: Platform;
}

/** Where a proposal came from: the caller's own conversation and, optionally, a message in it. */
export interface ProposalSource {
  conversation_id: string;
  message_id?: number;
}

export type ActionRequest =
  | { action: 'read' }
  | { action: 'prepare'; operation: CreateCustomOperation; source: ProposalSource | null }
  | { action: 'proposal'; proposal_id: string }
  | { action: 'interpret'; message_id: number }
  | { action: 'revise'; proposal_id: string; proposal_revision: number; operation: CreateCustomOperation }
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
    case 'prepare': {
      const op = parseOperation(body.operation);
      if (!op.ok) return op;
      // Only a new task can be prepared for review in this slice.
      if (op.value.type !== 'task.create_custom') return refuse(422, 'unsupported_operation');
      const source = parseSource(body.source);
      if (!source.ok) return source;
      return ok({ action: 'prepare', operation: op.value, source: source.value });
    }
    case 'proposal':
      if (typeof body.proposal_id !== 'string' || !UUID.test(body.proposal_id)) return refuse(400, 'invalid_proposal_id');
      return ok({ action: 'proposal', proposal_id: body.proposal_id });
    case 'interpret':
      if (!isPlainInt(body.message_id) || body.message_id > 2_147_483_647) return refuse(400, 'invalid_message_id');
      return ok({ action: 'interpret', message_id: body.message_id });
    case 'revise': {
      if (typeof body.proposal_id !== 'string' || !UUID.test(body.proposal_id)) return refuse(400, 'invalid_proposal_id');
      if (!isPlainInt(body.proposal_revision) || body.proposal_revision > 2_147_483_647) {
        return refuse(400, 'invalid_proposal_revision');
      }
      const op = parseOperation(body.operation);
      if (!op.ok) return op;
      if (op.value.type !== 'task.create_custom') return refuse(422, 'unsupported_operation');
      return ok({
        action: 'revise',
        proposal_id: body.proposal_id,
        proposal_revision: body.proposal_revision,
        operation: op.value,
      });
    }
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

function parseSource(raw: unknown): Parsed<ProposalSource | null> {
  if (raw === undefined || raw === null) return ok(null);
  if (!isObject(raw)) return refuse(422, 'invalid_source');
  for (const key of Object.keys(raw)) {
    if (key !== 'conversation_id' && key !== 'message_id') return refuse(422, 'invalid_source');
  }
  if (typeof raw.conversation_id !== 'string' || !UUID.test(raw.conversation_id)) return refuse(422, 'invalid_source');
  const source: ProposalSource = { conversation_id: raw.conversation_id.toLowerCase() };
  if (raw.message_id !== undefined) {
    if (!isPlainInt(raw.message_id) || raw.message_id > 2_147_483_647) return refuse(422, 'invalid_source');
    source.message_id = raw.message_id;
  }
  return ok(source);
}
