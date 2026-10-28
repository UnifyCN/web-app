// Settlement plan request handling (mobile-app#364). Called by handler.ts after the
// JWT, gate, version and platform checks, with the account taken from the JWT. Every
// call is one SQL function run by the service role; nothing here calls a model, the
// generation allowance or rag-query, so saved plans, approvals, lookups, retries and
// Undo keep working at the AI limit.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type { PlanRequest } from './plans.ts';

interface DbError {
  code?: string;
  message?: string;
  details?: string;
}

export interface PlanHandlerTools {
  json: (body: unknown, status?: number, headers?: Record<string, string>) => Response;
  mapDbError: (error: DbError) => Response;
}

export interface PlanHandled {
  response: Response;
  outcome: string;
}

export async function handlePlanRequest(
  admin: SupabaseClient,
  userId: string,
  version: number,
  request: PlanRequest,
  { json, mapDbError }: PlanHandlerTools,
): Promise<PlanHandled> {
  const failed = (error: DbError, outcome = 'failed'): PlanHandled =>
    // The plan functions are absent (the #364 schema is rolled back): refuse, never guess.
    error.code === 'PGRST202'
      ? { response: json({ error: 'feature_unavailable' }, 503), outcome: 'unavailable' }
      : { response: mapDbError(error), outcome };

  switch (request.action) {
    case 'plan_prepare': {
      const { data, error } = await admin.rpc('companion_plan_prepare', {
        p_user_id: userId,
        p_goal: request.goal,
        p_items: request.items,
        p_source: request.source,
      });
      if (error) return failed(error);
      return { response: json({ plan_proposal: data }), outcome: 'prepared' };
    }
    case 'plan_proposal': {
      const { data, error } = await admin.rpc('companion_plan_get_proposal', {
        p_user_id: userId,
        p_id: request.plan_proposal_id,
      });
      if (error) return failed(error);
      return { response: json({ plan_proposal: data }), outcome: 'read' };
    }
    case 'plan_revise':
    case 'plan_cancel': {
      const { data, error } = request.action === 'plan_revise'
        ? await admin.rpc('companion_plan_revise', {
          p_user_id: userId,
          p_id: request.plan_proposal_id,
          p_revision: request.proposal_revision,
          p_items: request.items,
        })
        : await admin.rpc('companion_plan_cancel', {
          p_user_id: userId,
          p_id: request.plan_proposal_id,
          p_revision: request.proposal_revision,
        });
      if (error) return failed(error);
      const result = data as { changed?: boolean; plan_proposal: unknown };
      // The request named an older revision or a closed draft: nothing changed.
      if (result.changed) {
        return { response: json({ error: 'proposal_changed', plan_proposal: result.plan_proposal }, 409), outcome: 'proposal_changed' };
      }
      return {
        response: json({ plan_proposal: result.plan_proposal }),
        outcome: request.action === 'plan_revise' ? 'revised' : 'cancelled',
      };
    }
    case 'plan_retry': {
      const { data, error } = await admin.rpc('companion_plan_retry', {
        p_user_id: userId,
        p_operation_id: request.operation_id,
        p_contract_version: version,
        p_authorization: request.authorization,
        p_receipt_operation_id: request.receipt_operation_id,
      });
      if (error) return failed(error);
      const result = data as { replayed?: boolean; status?: string };
      return { response: json(data), outcome: result.replayed ? 'replayed' : result.status === 'partial' ? 'partial' : 'applied' };
    }
    case 'plan_undo': {
      const { data, error } = await admin.rpc('companion_plan_undo', {
        p_user_id: userId,
        p_operation_id: request.operation_id,
        p_contract_version: version,
        p_authorization: request.authorization,
        p_receipt_operation_id: request.receipt_operation_id,
      });
      if (error) return failed(error);
      const result = data as { conflict?: boolean; replayed?: boolean };
      if (result.conflict) {
        // Nothing changed. Newer edits are kept; the draft is the reviewed compensating change.
        const { conflict: _c, ...rest } = result as Record<string, unknown>;
        return { response: json({ error: 'undo_conflict', ...rest }, 409), outcome: 'undo_conflict' };
      }
      return { response: json(data), outcome: result.replayed ? 'replayed' : 'undone' };
    }
    case 'plan_status': {
      const { data, error } = await admin.rpc('companion_plan_status', {
        p_user_id: userId,
        p_operation_id: request.operation_id,
      });
      if (error) return failed(error);
      return { response: json(data), outcome: `status_${(data as { status: string }).status}` };
    }
    case 'conversation_plans': {
      const { data, error } = await admin.rpc('companion_plan_conversation', {
        p_user_id: userId,
        p_conversation_id: request.conversation_id,
      });
      if (error) return failed(error);
      return { response: json(data), outcome: 'read' };
    }
    case 'plans': {
      const { data, error } = await admin.rpc('companion_plans_read', { p_user_id: userId });
      if (error) return failed(error);
      return { response: json({ contract_version: version, ...(data as Record<string, unknown>) }), outcome: 'read' };
    }
    case 'plan_apply': {
      const { data, error } = await admin.rpc('companion_plan_apply', {
        p_user_id: userId,
        p_operation_id: request.operation_id,
        p_contract_version: version,
        p_authorization: request.authorization,
        p_items: request.items,
      });
      if (error) return failed(error, error.code === 'CA409' ? 'conflict' : 'failed');
      const result = data as {
        replayed?: boolean; status?: string; needs_review?: boolean; changed?: boolean; plan_proposal?: unknown;
      };
      if (result.changed) {
        return { response: json({ error: 'proposal_changed', plan_proposal: result.plan_proposal }, 409), outcome: 'proposal_changed' };
      }
      // Relevant context changed since review: nothing was written; the refreshed draft
      // needs a new approval.
      if (result.needs_review) {
        return { response: json({ error: 'needs_review', plan_proposal: result.plan_proposal }, 409), outcome: 'needs_review' };
      }
      return { response: json(data), outcome: result.replayed ? 'replayed' : result.status === 'partial' ? 'partial' : 'applied' };
    }
  }
}
