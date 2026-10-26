// Companion actions request handler (mobile-app#361). One authenticated HTTP
// boundary for both clients: mobile calls it directly with the user's JWT, web
// through the same-origin /api/companion/actions proxy. The account comes from
// the JWT only. Every write is one SQL transaction executed by the service role.
// This path never calls the AI-generation quota or a model: task controls, result
// lookup and Undo stay available at the AI limit.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { type ActionRequest, PLATFORMS, type Platform, parseAction, parseEnvelope } from './contract.ts';

export interface HandlerDeps {
  /** Service-role client. Used for the user lookup, the gate and the action SQL. */
  admin: SupabaseClient;
  /** Allowlisted, content-free result line for operational metrics. */
  log?: (line: ResultLine) => void;
}

/** Only categorical fields. Never task titles, reasons, ids of rows or message text. */
export interface ResultLine {
  event: 'companion_action_result';
  action: ActionRequest['action'] | 'unknown';
  operation_type: 'task.set_state' | null;
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

export function createHandler({ admin, log = line => console.log(JSON.stringify(line)) }: HandlerDeps) {
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
      return finish(json({ contract_version: version, tasks: data }), 'read');
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
      const { data, error } = await admin.rpc('companion_apply_actions', {
        p_user_id: userId,
        p_operation_id: request.operation_id,
        p_contract_version: version,
        p_authorization: request.authorization,
        p_operations: request.operations,
      });
      if (error) return finish(mapDbError(error), error.code === 'CA409' ? 'conflict' : 'failed');
      return finish(json(data), (data as { replayed: boolean }).replayed ? 'replayed' : 'applied');
    }

    // undo
    operationType = 'task.set_state';
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
