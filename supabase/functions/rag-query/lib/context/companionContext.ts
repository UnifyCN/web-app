// The read plan for one Companion answer. The server decides which registered
// reads run from the request alone (the model never chooses a read or its
// input), runs them in parallel within their time budgets, and assembles the
// CompanionContext the answer and the client receive.
//
// Every read is a read: the plan has no write path, and the result never
// becomes authorization for anything.

import {
  CONTEXT_VERSION,
  type AppContentItem,
  type CompanionContext,
  type ContextItem,
  type GuidanceResult,
  type ReadReport,
} from './contract.ts';
import { runRead } from './registry.ts';
import {
  parseConversationIdentifier,
  profileContextItem,
  readChecklist,
  readOwnConversation,
  readProfileRow,
  type ChecklistRead,
  type ProfileRow,
  type SanityConfig,
  type UserClient,
} from './appContext.ts';
import {
  clarificationFor,
  effectiveProvince,
  isPlanningQuestion,
  readConversationDetails,
} from './conversationDetails.ts';
import { gatherGuidance, type GuidanceConfig, type GuidanceReads } from './guidance.ts';

export interface CompanionReadRequest {
  /** The caller's JWT client; null only in eval mode (no account). */
  userClient: UserClient | null;
  userId: string | null;
  /** Eval mode supplies the profile in the request body instead. */
  evalProfile?: ProfileRow | null;
  conversationIdentifier: unknown;
  prompt: string;
  earlierUserTurns: string[];
  lang: string;
  /** The question's lane uses retrieval (immigration, settlement, fact check, form help). */
  queryType: string;
  sanity: SanityConfig | null;
  guidance: GuidanceConfig;
  now: () => Date;
}

export interface CompanionReads {
  /** Resolves first: retrieval waits for the province. */
  profile: Promise<ProfileRow | null>;
  /** Everything else. */
  context: Promise<{ context: CompanionContext; evidence: Map<string, string>; conversationDenied: boolean }>;
}

const RAG_LANES = new Set(['immigration', 'newcomer_settlement', 'fact_check', 'form_help']);

/** External guidance is searched for planning and fact-check questions only. */
export function needsGuidance(queryType: string, prompt: string): boolean {
  if (!RAG_LANES.has(queryType) || queryType === 'form_help') return false;
  return queryType === 'fact_check' || isPlanningQuestion(prompt);
}

export function startCompanionReads(request: CompanionReadRequest): CompanionReads {
  const { userClient, userId } = request;
  const reports: ReadReport[] = [];

  const profileOutcome = userClient && userId
    ? runRead<string, ProfileRow | null>('context.profile', userId, {
        parseInput: raw => (typeof raw === 'string' && raw ? raw : null),
        execute: (id, signal) => readProfileRow(userClient, id, signal),
        validateOutput: raw =>
          raw === null || (typeof raw === 'object' && !Array.isArray(raw)) ? (raw as ProfileRow | null) : null,
      })
    : Promise.resolve(
        request.evalProfile && typeof request.evalProfile === 'object'
          ? ({ status: 'ok', value: request.evalProfile } as const)
          : ({ status: 'skipped' } as const)
      );

  const profile = profileOutcome.then(outcome => {
    reports.push({ capability: 'context.profile', status: outcome.status });
    return outcome.status === 'ok' ? outcome.value ?? null : null;
  });

  const conversationId = parseConversationIdentifier(request.conversationIdentifier);
  const conversationOutcome = userClient
    ? runRead('context.conversation', conversationId, {
        parseInput: raw => (typeof raw === 'string' ? raw : null),
        execute: (id, signal) => readOwnConversation(userClient, id, signal),
        validateOutput: raw => (raw && typeof raw === 'object' ? (raw as ContextItem) : null),
      })
    : Promise.resolve({ status: 'skipped' } as const);

  const context = (async () => {
    const profileRow = await profile;
    const details = readConversationDetails(request.prompt, request.earlierUserTurns);
    const province = effectiveProvince(details, profileRow);

    const checklistOutcome = userClient && userId
      ? runRead<string, ChecklistRead>('context.checklist', userId, {
          parseInput: raw => (typeof raw === 'string' && raw ? raw : null),
          execute: (id, signal) =>
            readChecklist(
              userClient,
              id,
              profileRow,
              { sanity: request.sanity, lang: request.lang, prompt: request.prompt },
              signal
            ),
          validateOutput: raw =>
            raw && typeof raw === 'object' && Array.isArray((raw as ChecklistRead).items)
              ? (raw as ChecklistRead)
              : null,
        })
      : Promise.resolve({ status: 'skipped' } as const);

    const guidancePromise: Promise<GuidanceReads | null> = needsGuidance(request.queryType, request.prompt)
      ? gatherGuidance(
          `${request.prompt} ${province ?? ''} Canada official`.trim(),
          province,
          request.guidance,
          { now: request.now }
        )
      : Promise.resolve(null);

    const [checklist, conversation, guidance] = await Promise.all([
      checklistOutcome,
      conversationOutcome,
      guidancePromise,
    ]);

    reports.push({
      capability: 'context.checklist',
      status:
        checklist.status === 'ok' && !checklist.value.contentAvailable ? 'unavailable' : checklist.status,
    });
    reports.push({ capability: 'context.conversation', status: conversation.status });
    reports.push({ capability: 'guidance.search', status: guidance?.searchStatus ?? 'skipped' });
    reports.push({ capability: 'guidance.read', status: guidance?.readStatus ?? 'skipped' });

    const items: ContextItem[] = [];
    const profileItem = profileContextItem(profileRow);
    if (profileItem) items.push(profileItem);
    if (details.item) items.push(details.item);
    if (conversation.status === 'ok') items.push(conversation.value);
    if (checklist.status === 'ok') items.push(...checklist.value.items);

    const guidanceResult: GuidanceResult = guidance?.result ?? { status: 'not_needed', sources: [] };
    const result: CompanionContext = {
      version: CONTEXT_VERSION,
      items,
      reads: reports,
      guidance: guidanceResult,
      clarification: clarificationFor(details, profileRow, request.prompt, request.now()),
    };
    return {
      context: result,
      evidence: guidance?.evidence ?? new Map<string, string>(),
      conversationDenied: conversation.status === 'denied',
    };
  })().catch(error => {
    // A defect in assembling context must not cost the user the answer; the
    // answer goes ahead with no app context and says nothing was checked.
    console.error('[rag-query] context assembly failed', error instanceof Error ? error.message : 'unknown');
    return {
      context: {
        version: CONTEXT_VERSION,
        items: [],
        reads: [{ capability: 'context.profile', status: 'error' } as ReadReport],
        guidance: { status: 'unavailable', reason: 'read_failed', sources: [] } as GuidanceResult,
        clarification: null,
      },
      evidence: new Map<string, string>(),
      conversationDenied: true,
    };
  });

  return { profile, context };
}

/** Add the knowledge-base articles retrieval returned (public app content). */
export function withKnowledgeSources(
  context: CompanionContext,
  status: 'ok' | 'error' | 'skipped',
  sources: Array<{ document_id: number; document_title: string; url: string; updated_at?: string | null }>
): CompanionContext {
  const items: AppContentItem[] = sources.map(source => ({
    kind: 'app_content',
    id: `kb:${source.document_id}`,
    revision: source.updated_at ?? null,
    title: source.document_title,
  }));
  return {
    ...context,
    items: [...context.items, ...items],
    reads: [...context.reads, { capability: 'content.knowledge', status }],
  };
}
