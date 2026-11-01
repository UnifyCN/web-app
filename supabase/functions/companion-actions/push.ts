// Version 1 Companion push contract. No client owner or session field is accepted.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type { ListTasks } from './targets.ts';
import type { PlanHandlerTools } from './planHandler.ts';
export const PUSH_LOCALES = ['ar', 'en', 'es', 'fr-CA', 'hi', 'pa', 'vi'] as const;
export type PushLocale = typeof PUSH_LOCALES[number];
export interface PushOperation {
  type: 'push.enroll' | 'push.disable' | 'push.revoke';
  installation_id: string;
  installation_secret: string;
  expected_revision: number;
  token?: string;
  enabled?: boolean;
  locale?: PushLocale;
}
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function isPushAction(action: unknown): boolean {
  return ['push_apply', 'push_read', 'push_resolve'].includes(String(action));
}
/** getUser has already validated this exact JWT. Never decode an unvalidated bearer. */
function sessionOf(jwt: string): string | null {
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return uuid(payload.session_id) ? payload.session_id : null;
  } catch { return null; }
}
export async function handlePushRequest(
  admin: SupabaseClient, userId: string, jwt: string, body: Record<string, unknown>,
  listTasks: ListTasks | undefined, { json, mapDbError }: PlanHandlerTools,
): Promise<Response> {
  const session = sessionOf(jwt);
  if (!session) return json({ error: 'unauthorized' }, 401);
  const fail = (e: { code?: string; message?: string; details?: string }) =>
    e.code === 'PGRST202' ? json({ error: 'push_disabled' }, 503) : mapDbError(e);
  const common = ['contract_version', 'client', 'action'];
  if (body.action === 'push_apply') {
    if (Object.keys(body).some(k => ![...common, 'operation_id', 'authorization', 'operation'].includes(k)) || !uuid(body.operation_id) || !object(body.operation))
      return json({ error: 'invalid_request' }, 422);
    if (!object(body.authorization) || body.authorization.kind !== 'ui_control' || Object.keys(body.authorization).length !== 1)
      return json({ error: 'forbidden' }, 403);
    const op = body.operation;
    const enroll = op.type === 'push.enroll';
    const fields = ['type', 'installation_id', 'installation_secret', 'expected_revision', ...(enroll ? ['token', 'enabled', 'locale'] : [])];
    if (!['push.enroll', 'push.disable', 'push.revoke'].includes(String(op.type)) || Object.keys(op).some(k => !fields.includes(k)) ||
      !uuid(op.installation_id) || typeof op.installation_secret !== 'string' || !/^[0-9a-f]{64}$/.test(op.installation_secret) ||
      !Number.isSafeInteger(op.expected_revision) || Number(op.expected_revision) < 0 ||
      (enroll && (typeof op.enabled !== 'boolean' || typeof op.token !== 'string' || !/^(ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]{1,200}\]$/.test(op.token) || !(PUSH_LOCALES as readonly unknown[]).includes(op.locale))))
      return json({ error: 'invalid_request' }, 422);
    const { data, error } = await admin.rpc('companion_push_apply', {
      p_user: userId, p_session: session, p_operation_id: body.operation_id,
      p_version: body.contract_version, p_platform: (body.client as Record<string, unknown>).platform, p_operation: op,
    });
    return error ? fail(error) : json(data);
  }
  if (body.action === 'push_read') {
    if (Object.keys(body).some(k => ![...common, 'installation_id', 'installation_secret'].includes(k)) || !uuid(body.installation_id) ||
      typeof body.installation_secret !== 'string' || !/^[0-9a-f]{64}$/.test(body.installation_secret)) return json({ error: 'invalid_request' }, 422);
    const { data, error } = await admin.rpc('companion_push_read', { p_user: userId, p_session: session,
      p_installation: body.installation_id, p_secret: body.installation_secret });
    return error ? fail(error) : json({ enrollment: data });
  }
  if (Object.keys(body).some(k => ![...common, 'delivery_id', 'language'].includes(k)) || !uuid(body.delivery_id) ||
    !(PUSH_LOCALES as readonly unknown[]).includes(body.language)) return json({ error: 'invalid_request' }, 422);
  // Resolve ownership BEFORE any task read. A shared published id is not authority.
  const { data, error } = await admin.rpc('companion_push_target', { p_user: userId, p_session: session, p_delivery: body.delivery_id });
  if (error) return fail(error);
  if (!data) return json({ target: 'unavailable' });
  if (String(data).startsWith('sanity:')) {
    try {
      const tasks = await listTasks?.(jwt, userId, String(body.language));
      if (!tasks?.complete) return json({ error: 'tasks_unavailable' }, 503);
      if (!tasks.tasks.some(t => t.task_ref === data)) return json({ target: 'unavailable' });
    } catch { return json({ error: 'tasks_unavailable' }, 503); }
  }
  return json({ target: 'available', task_ref: data });
}
