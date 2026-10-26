// Test harness for the mounted task-action tests (mobile-app#361). Not used by the app.
//
// `scriptedServer` answers the companion-actions request contract from a small
// in-memory record so the rendered client can be driven through real controls.
// It is not evidence of the server's behaviour: authorization, revisions,
// receipts and persistence are proven against the real endpoint and database in
// supabase/tests/companion-actions (run.sh).
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import en from "@/lib/i18n/locales/en/translation.json";

/** One HTTP reply of the endpoint. */
export interface TransportReply {
  status: number;
  body: unknown;
}

export function testI18n() {
  const i18n = createInstance();
  void i18n.use(initReactI18next).init({
    lng: "en",
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
    initImmediate: false,
  });
  return i18n;
}

export function Providers({
  children,
  queryClient,
}: {
  children: ReactNode;
  queryClient: QueryClient;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={testI18n()}>{children}</I18nextProvider>
    </QueryClientProvider>
  );
}

// gcTime Infinity: no garbage-collection timer outlives the test.
export const newQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });

// Request and receipt bodies are free-form JSON in this stand-in.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Body = Record<string, any>;

interface Row {
  state: string;
  reason: string | null;
  revision: number;
  removed: boolean;
  receipts: Body[];
}

export const PROPOSAL_ID = "7e1f1f6c-1111-4111-8111-000000000001";

export function scriptedServer(
  initial: Record<string, Partial<Row>> = {},
  opts: {
    override?: (body: Body) => TransportReply | "network-error" | undefined;
  } = {},
) {
  const rows = new Map<string, Row>();
  for (const [ref, row] of Object.entries(initial)) {
    rows.set(ref, {
      state: "not_started",
      reason: null,
      revision: 1,
      removed: false,
      receipts: [],
      ...row,
    });
  }
  const sent: Body[] = [];
  const urls: string[] = [];
  const byOperation = new Map<string, Body>();
  const proposals = new Map<string, Body>();

  const rowOf = (ref: string): Row =>
    rows.get(ref) ?? {
      state: "not_started",
      reason: null,
      revision: 0,
      removed: false,
      receipts: [],
    };

  const receiptOf = (
    ref: string,
    body: Body,
    before: Row,
    after: Row,
    over: Body = {},
  ): Body => ({
    operation_id: body.operation_id,
    created_at: "2026-10-25T18:00:00.000Z",
    kind: "change",
    undo_of: null,
    task_ref: ref,
    before_state: before.state,
    after_state: after.state,
    before_revision: before.revision,
    after_revision: after.revision,
    undone_by: null,
    current: true,
    undoable: true,
    ...over,
  });

  function visible(ref: string, receipt: Body): Body {
    // before_reason is the stand-in's own record of the inverse; it never leaves.
    const rest = { ...receipt };
    delete rest.before_reason;
    return {
      ...rest,
      current:
        !receipt.undone_by && rowOf(ref).revision === receipt.after_revision,
    };
  }

  const applied = (receipt: Body, replayed = false): TransportReply => ({
    status: 200,
    body: {
      status: "applied",
      replayed,
      receipt: visible(receipt.task_ref, receipt),
    },
  });

  function handle(body: Body): TransportReply {
    if (body.action === "read") {
      return {
        status: 200,
        body: {
          contract_version: 1,
          tasks: [...rows.entries()].map(([ref, row]) => ({
            task_ref: ref,
            source: ref.split(":")[0],
            state: row.state,
            waiting_reason: row.reason,
            revision: row.revision,
            removed: row.removed,
            state_updated_at: null,
            last_receipt: row.receipts.length
              ? visible(ref, row.receipts[row.receipts.length - 1])
              : null,
          })),
        },
      };
    }
    if (body.action === "status") {
      const done = byOperation.get(body.operation_id);
      if (!done) return { status: 200, body: { status: "not_applied" } };
      return {
        status: 200,
        body: { status: "applied", receipt: visible(done.task_ref, done) },
      };
    }
    const replay = byOperation.get(body.operation_id);
    if (replay) return applied(replay, true);

    if (body.action === "undo") {
      const target = byOperation.get(body.receipt_operation_id);
      if (!target) return { status: 404, body: { error: "not_found" } };
      if (target.undone_by)
        return { status: 409, body: { error: "already_undone" } };
      const ref = target.task_ref;
      const now = rowOf(ref);
      if (now.revision !== target.after_revision) {
        const proposal = {
          proposal_id: PROPOSAL_ID,
          proposal_revision: 1,
          operations: [
            {
              type: "task.set_state",
              task_ref: ref,
              state: target.before_state,
              expected_revision: now.revision,
              ...(target.before_reason
                ? { waiting_reason: target.before_reason }
                : {}),
            },
          ],
        };
        proposals.set(PROPOSAL_ID, {
          ...proposal,
          undo_of: target.operation_id,
        });
        return {
          status: 409,
          body: {
            error: "undo_conflict",
            receipt_operation_id: target.operation_id,
            current: [
              {
                task_ref: ref,
                state: now.state,
                waiting_reason: now.reason,
                revision: now.revision,
                removed: now.removed,
              },
            ],
            proposal,
          },
        };
      }
      const after: Row = {
        ...now,
        state: target.before_state,
        reason: target.before_reason ?? null,
        revision: now.revision + 1,
      };
      const receipt = receiptOf(ref, body, now, after, {
        kind: "undo",
        undo_of: target.operation_id,
        undoable: false,
      });
      target.undone_by = body.operation_id;
      target.undoable = false;
      after.receipts = [...now.receipts, receipt];
      rows.set(ref, after);
      byOperation.set(body.operation_id, receipt);
      return applied(receipt);
    }

    if (body.action === "apply") {
      const op = body.operations[0];
      let undoOf: Body | undefined;
      if (body.authorization?.kind === "approved_proposal") {
        const proposal = proposals.get(body.authorization.proposal_id);
        if (!proposal || proposal.used)
          return { status: 403, body: { error: "forbidden" } };
        proposal.used = true;
        undoOf = byOperation.get(proposal.undo_of);
      }
      const before = rowOf(op.task_ref);
      if (before.revision !== op.expected_revision) {
        return {
          status: 409,
          body: {
            error: "revision_conflict",
            detail: {
              task_ref: op.task_ref,
              expected: op.expected_revision,
              actual: before.revision,
            },
          },
        };
      }
      const after: Row = {
        ...before,
        state: op.state,
        reason: op.state === "waiting" ? (op.waiting_reason ?? null) : null,
        revision: before.revision + 1,
      };
      const receipt = receiptOf(op.task_ref, body, before, after, {
        before_reason: before.reason,
        ...(undoOf
          ? { kind: "undo", undo_of: undoOf.operation_id, undoable: false }
          : {}),
      });
      if (undoOf) {
        undoOf.undone_by = body.operation_id;
        undoOf.undoable = false;
      }
      after.receipts = [...before.receipts, receipt];
      rows.set(op.task_ref, after);
      byOperation.set(body.operation_id, receipt);
      return applied(receipt);
    }
    return { status: 400, body: { error: "invalid_action" } };
  }

  /**
   * Stands in for window.fetch. Only the same-origin task actions route is
   * answered; any other request fails the test.
   */
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url !== "/api/companion/actions") {
      throw new Error(`unexpected request in a task action test: ${url}`);
    }
    urls.push(url);
    const body = JSON.parse(String(init?.body)) as Body;
    sent.push(body);
    const scripted = opts.override?.(body);
    if (scripted === "network-error") throw new TypeError("Failed to fetch");
    const reply = scripted ?? handle(body);
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "content-type": "application/json" },
    });
  };

  return {
    fetch,
    urls,
    handle,
    sent,
    writes: () =>
      sent.filter((b) => b.action === "apply" || b.action === "undo"),
    row: (ref: string) => rows.get(ref),
    /** Another platform changes the task: the revision moves on. */
    editElsewhere(ref: string, state: string) {
      const before = rowOf(ref);
      rows.set(ref, {
        ...before,
        state,
        reason: null,
        revision: before.revision + 1,
      });
    },
  };
}
