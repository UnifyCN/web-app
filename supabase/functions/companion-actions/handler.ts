// Companion actions request handler (mobile-app#361). One authenticated HTTP
// boundary for both clients: mobile calls it directly with the user's JWT, web
// through the same-origin /api/companion/actions proxy. The account comes from
// the JWT only. Every write is one SQL transaction executed by the service role.
// This path never calls the AI-generation quota or a model: task controls, result
// lookup and Undo stay available at the AI limit.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { type ActionRequest, type Operation, PLATFORMS, type Platform, parseAction, parseEnvelope } from './contract.ts';
import { resolveCommand, titleKey } from './commands.ts';

/**
 * Whether a published Checklist document exists (#366): true, false, or null when the
 * content read failed. A new step under a content-backed task needs it, so a step can
 * never be saved under a content id that does not exist.
 */
export type ContentTaskLookup = (sanityId: string) => Promise<boolean | null>;

export interface HandlerDeps {
  /** Service-role client. Used for the user lookup, the gate and the action SQL. */
  admin: SupabaseClient;
  /** Published Checklist content read. Absent: content-backed parents cannot be checked. */
  contentTaskExists?: ContentTaskLookup | null;
  /** Allowlisted, content-free result line for operational metrics. */
  log?: (line: ResultLine) => void;
}

/** Only categorical fields. Never task titles, reasons, ids of rows or message text. */
export interface ResultLine {
  event: 'companion_action_result';
  action: ActionRequest['action'] | 'unknown';
  operation_type: Operation['type'] | null;
  platform: Platform | null;
  http_status: number;
  outcome: string;
}

const SQLSTATE_TO_HTTP: Record<string, [number, string]> = {
  CA403: [403, 'forbidden'],
  CA404: [404, 'not_found'],
  CA409: [409, 'revision_conflict'],
  CA410: [409, 'operation_id_reused'],
  CA411: [409, 'already_undone'],
  CA412: [409, 'command_already_used'],
  CA413: [409, 'needs_clarification'],
  CA422: [422, 'invalid_request'],
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });
}

interface DbError {
  code?: string;
  message?: string;
  details?: string;
}

function mapDbError(error: DbError): Response {
  // lock_not_available: another request holds this operation or task. The outcome is unknown.
  if (error.code === '55P03') return json({ error: 'operation_in_flight' }, 503, { 'retry-after': '1' });
  const mapped = SQLSTATE_TO_HTTP[error.code ?? ''];
  if (!mapped) {
    console.error('companion-actions: database error', error.code);
    return json({ error: 'internal' }, 500);
  }
  let detail: unknown;
  try {
    detail = error.details ? JSON.parse(error.details) : undefined;
  } catch {
    detail = undefined;
  }
  return json({ error: mapped[1], reason: error.message, ...(detail && Object.keys(detail).length ? { detail } : {}) }, mapped[0]);
}

async function userIdFrom(admin: SupabaseClient, req: Request): Promise<string | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

/** The caller's own saved user message, or null. Read by the service, never taken from the client. */
async function ownUserMessage(admin: SupabaseClient, userId: string, messageId: number): Promise<string | null> {
  const { data, error } = await admin
    .from('messages')
    .select('content, role, conversations!inner(user_id)')
    .eq('id', messageId)
    .eq('conversations.user_id', userId)
    .eq('role', 'user')
    .maybeSingle();
  if (error || !data || typeof (data as { content?: unknown }).content !== 'string') return null;
  return (data as { content: string }).content;
}

/** Live custom tasks of the caller with the same title (shown when a command is unclear). */
async function sameTitleTasks(admin: SupabaseClient, userId: string, title: string) {
  const { data, error } = await admin
    .from('custom_checklist_tasks')
    .select('id, title, revision')
    .eq('user_id', userId)
    .is('removed_at', null);
  if (error) throw error;
  const key = titleKey(title);
  return (data ?? [])
    .filter(row => titleKey(String(row.title)) === key)
    .map(row => ({ task_ref: `custom:${row.id}`, revision: row.revision, title: row.title }));
}

const CONTENT_QUERY = '*[_type == "checklist" && _id == $id][0]._id';

/** The published-content read from the function environment (the rag-query Sanity settings). */
export function contentLookupFromEnv(get: (key: string) => string | undefined): ContentTaskLookup | null {
  // Test stacks point this at a local stand-in; production derives the Sanity CDN URL.
  const override = get('COMPANION_CONTENT_QUERY_URL')?.trim();
  const projectId = get('SANITY_PROJECT_ID')?.trim() ?? '';
  const dataset = get('SANITY_DATASET')?.trim() || 'production';
  const base = override ||
    (/^[a-z0-9]{1,32}$/.test(projectId) && /^[\w-]{1,64}$/.test(dataset)
      ? `https://${projectId}.apicdn.sanity.io/v2024-01-01/data/query/${dataset}`
      : '');
  if (!base) return null;
  return async sanityId => {
    try {
      const url = new URL(base);
      url.searchParams.set('query', CONTENT_QUERY);
      url.searchParams.set('$id', JSON.stringify(sanityId));
      const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const body = (await res.json()) as { result?: unknown };
      if (body.result === null) return false;
      return body.result === sanityId ? true : null;
    } catch {
      return null;
    }
  };
}

/** A new step under a content-backed task: its published document must exist. */
async function contentParentRefusal(
  lookup: ContentTaskLookup | null | undefined,
  op: Operation,
): Promise<Response | null> {
  if (op.type !== 'step.create' || !op.task_ref.startsWith('sanity:')) return null;
  const exists = lookup ? await lookup(op.task_ref.slice('sanity:'.length)) : null;
  if (exists === true) return null;
  if (exists === false) {
    return json({ error: 'not_found', reason: 'task_not_found', detail: { task_ref: op.task_ref } }, 404);
  }
  // Nothing was written; the client may look the operation up and send it again.
  return json({ error: 'content_unavailable' }, 503, { 'retry-after': '1' });
}

export function createHandler({ admin, contentTaskExists, log = line => console.log(JSON.stringify(line)) }: HandlerDeps) {
  return async function handle(req: Request): Promise<Response> {
    let action: ResultLine['action'] = 'unknown';
    let platform: Platform | null = null;
    let operationType: ResultLine['operation_type'] = null;
    const finish = (res: Response, outcome: string): Response => {
      log({ event: 'companion_action_result', action, operation_type: operationType, platform, http_status: res.status, outcome });
      return res;
    };

    if (req.method !== 'POST') return finish(json({ error: 'method_not_allowed' }, 405), 'rejected');
    const userId = await userIdFrom(admin, req);
    if (!userId) return finish(json({ error: 'unauthorized' }, 401), 'unauthorized');

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return finish(json({ error: 'invalid_json' }, 400), 'rejected');
    }
    const envelope = parseEnvelope(body);
    if (!envelope.ok) return finish(json({ error: 'invalid_request', reason: envelope.reason }, 400), 'rejected');

    // Version negotiation and gate, read per request so a flag flip is a rollback.
    const { data: gate, error: gateError } = await admin.from('companion_feature_gate').select('*').maybeSingle();
    if (gateError || !gate) return finish(json({ error: 'feature_unavailable' }, 503), 'unavailable');
    const version = envelope.value.version;
    if (!Number.isInteger(version) || (version as number) < gate.min_contract_version ||
        (version as number) > gate.max_contract_version) {
      return finish(json({
        error: 'unsupported_contract_version',
        supported: { min: gate.min_contract_version, max: gate.max_contract_version },
      }, 426), 'unsupported_version');
    }
    const rawPlatform = envelope.value.platform;
    if (typeof rawPlatform === 'string' && (PLATFORMS as readonly string[]).includes(rawPlatform)) {
      platform = rawPlatform as Platform;
    }
    if (!gate.enabled) return finish(json({ error: 'feature_disabled' }, 403), 'feature_disabled');
    if (!platform || !gate.allowed_platforms.includes(platform)) {
      return finish(json({ error: 'platform_not_enabled' }, 403), 'platform_not_enabled');
    }

    const parsed = parseAction(body as Record<string, unknown>);
    if (!parsed.ok) {
      const error = parsed.status === 403 ? 'forbidden' : parsed.status === 422 ? 'invalid_request' : 'invalid_request';
      return finish(json({ error, reason: parsed.reason }, parsed.status), 'rejected');
    }
    const request = parsed.value;
    action = request.action;

    if (request.action === 'read') {
      const { data, error } = await admin.rpc('companion_read_tasks', { p_user_id: userId });
      if (error) return finish(mapDbError(error), 'failed');
      // #366: the live steps of every task, read after the tasks. After a rollback of the
      // step migration the read function is gone: the tasks are still served, without steps.
      const steps = await admin.rpc('companion_read_steps', { p_user_id: userId });
      if (steps.error && steps.error.code !== 'PGRST202') return finish(mapDbError(steps.error), 'failed');
      return finish(json({ contract_version: version, tasks: data, ...(steps.error ? {} : { steps: steps.data }) }), 'read');
    }

    if (request.action === 'prepare') {
      // A draft for review: writes only the proposal, never task progress.
      operationType = request.operation.type;
      const parentRefusal = await contentParentRefusal(contentTaskExists, request.operation);
      if (parentRefusal) return finish(parentRefusal, 'rejected');
      const { data, error } = await admin.rpc('companion_prepare_proposal', {
        p_user_id: userId,
        p_operations: [request.operation],
        p_source: request.source,
      });
      if (error) return finish(mapDbError(error), 'failed');
      return finish(json({ proposal: data }), 'prepared');
    }

    if (request.action === 'proposal') {
      const { data, error } = await admin.rpc('companion_get_proposal', {
        p_user_id: userId,
        p_proposal_id: request.proposal_id,
      });
      if (error) return finish(mapDbError(error), 'failed');
      return finish(json({ proposal: data }), 'read');
    }

    if (request.action === 'interpret') {
      // Reads only. The message must be the caller's own user message.
      const text = await ownUserMessage(admin, userId, request.message_id);
      if (text === null) return finish(json({ error: 'not_found', reason: 'message_not_found' }, 404), 'rejected');
      const resolved = resolveCommand(text);
      if (resolved.kind !== 'create') return finish(json({ command: resolved }), `interpret_${resolved.kind}`);
      operationType = 'task.create_custom';
      let same;
      try {
        same = await sameTitleTasks(admin, userId, resolved.title);
      } catch {
        return finish(json({ error: 'internal' }, 500), 'failed');
      }
      return finish(json({
        command: {
          kind: 'create',
          operation: { type: 'task.create_custom', title: resolved.title, priority: 'Do soon' },
          same_title_tasks: same,
        },
      }), 'interpret_create');
    }

    if (request.action === 'conversation_actions') {
      const { data, error } = await admin.rpc('companion_conversation_actions', {
        p_user_id: userId,
        p_conversation_id: request.conversation_id,
      });
      if (error) return finish(mapDbError(error), 'failed');
      return finish(json(data), 'read');
    }

    if (request.action === 'cancel') {
      const { data, error } = await admin.rpc('companion_cancel_proposal', {
        p_user_id: userId,
        p_proposal_id: request.proposal_id,
        p_proposal_revision: request.proposal_revision,
      });
      if (error) return finish(mapDbError(error), 'failed');
      const result = data as { changed?: boolean; proposal: unknown };
      if (result.changed) return finish(json({ error: 'proposal_changed', proposal: result.proposal }, 409), 'proposal_changed');
      return finish(json({ proposal: result.proposal }), 'cancelled');
    }

    if (request.action === 'revise') {
      operationType = request.operation.type;
      const { data, error } = await admin.rpc('companion_revise_proposal', {
        p_user_id: userId,
        p_proposal_id: request.proposal_id,
        p_proposal_revision: request.proposal_revision,
        p_operations: [request.operation],
      });
      if (error) return finish(mapDbError(error), 'failed');
      const result = data as { changed?: boolean; proposal: unknown };
      // The edit named an older revision (or the draft is no longer open): nothing
      // changed, and the current proposal is returned for review.
      if (result.changed) return finish(json({ error: 'proposal_changed', proposal: result.proposal }, 409), 'proposal_changed');
      return finish(json({ proposal: result.proposal }), 'revised');
    }

    if (request.action === 'status') {
      const { data, error } = await admin.rpc('companion_action_status', {
        p_user_id: userId,
        p_operation_id: request.operation_id,
      });
      if (error) return finish(mapDbError(error), 'failed');
      return finish(json(data), `status_${(data as { status: string }).status}`);
    }

    if (request.action === 'apply') {
      operationType = request.operations[0].type;
      if (request.authorization.kind === 'direct_command') {
        // The command is read from the user's own saved message, here, and must resolve
        // to exactly the submitted operation. A client or model cannot widen it.
        const text = await ownUserMessage(admin, userId, request.authorization.message_id);
        const resolved = text === null ? null : resolveCommand(text);
        const op = request.operations[0];
        if (!resolved || resolved.kind !== 'create' || op.type !== 'task.create_custom' ||
            op.title !== resolved.title || op.priority !== 'Do soon') {
          return finish(json({ error: 'forbidden', reason: 'invalid_authorization' }, 403), 'rejected');
        }
      }
      const parentRefusal = await contentParentRefusal(contentTaskExists, request.operations[0]);
      if (parentRefusal) return finish(parentRefusal, parentRefusal.status === 404 ? 'rejected' : 'unavailable');
      const { data, error } = await admin.rpc('companion_apply_actions', {
        p_user_id: userId,
        p_operation_id: request.operation_id,
        p_contract_version: version,
        p_authorization: request.authorization,
        p_operations: request.operations,
      });
      if (error) return finish(mapDbError(error), error.code === 'CA409' ? 'conflict' : 'failed');
      const result = data as { replayed?: boolean; needs_review?: boolean; proposal?: unknown };
      // Relevant context changed since review: nothing was written; the refreshed
      // proposal needs a new approval.
      if (result.needs_review) return finish(json({ error: 'needs_review', proposal: result.proposal }, 409), 'needs_review');
      return finish(json(data), result.replayed ? 'replayed' : 'applied');
    }

    // undo (the operation type is the receipt's; not known before the database reads it)
    const { data, error } = await admin.rpc('companion_undo_action', {
      p_user_id: userId,
      p_operation_id: request.operation_id,
      p_contract_version: version,
      p_authorization: request.authorization,
      p_receipt_operation_id: request.receipt_operation_id,
    });
    if (error) return finish(mapDbError(error), 'failed');
    const result = data as { conflict?: boolean; replayed?: boolean };
    if (result.conflict) {
      // Nothing changed. The newer edit is kept; the proposal is the reviewed compensating change.
      const { conflict: _c, ...rest } = result as Record<string, unknown>;
      return finish(json({ error: 'undo_conflict', ...rest }, 409), 'undo_conflict');
    }
    return finish(json(data), result.replayed ? 'replayed' : 'undone');
  };
}
