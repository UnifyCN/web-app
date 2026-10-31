import { createClient } from "jsr:@supabase/supabase-js@2";
// Same authenticated request handler with a controlled Checklist-content read.
// Auth, JWT, RLS, SQL actions, revisions and receipts use the owned real local stack.
import { assert, assertEquals } from "jsr:@std/assert@1.0.19";
import { createHandler } from "../../functions/companion-actions/handler.ts";
import { extractActionProposal } from "../../functions/rag-query/lib/actions/proposals.ts";
import {
  API_URL,
  SERVICE_ROLE_KEY,
  ready,
  sql,
  newAccount,
  existingCustomTask,
  conversationWith,
  messageIn,
  uuid,
} from "./support.ts";
await ready();
await sql.begin(
  async (tx) =>
    await tx.unsafe(
      await Deno.readTextFile(
        new URL(
          "../../migrations/20261029175439_companion_task_reminders.sql",
          import.meta.url,
        ),
      ),
    ),
);
const a = await newAccount("reminder-command"),
  b = await newAccount("reminder-foreign");
const { ref } = await existingCustomTask(a, "Synthetic appointment");
const handle = createHandler({
  admin: createClient(API_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  }),
  listTasks: async (_jwt, user) => ({
    complete: true,
    tasks:
      user === a.id ? [{ task_ref: ref, title: "Synthetic appointment" }] : [],
  }),
  log: () => {},
});
const call = async (who: typeof a, body: Record<string, unknown>) => {
  const response = await handle(
    new Request("http://127.0.0.1/actions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${who.jwt}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contract_version: 1,
        client: { platform: "web", app_version: "test" },
        ...body,
      }),
    }),
  );
  return { status: response.status, json: await response.json() };
};
const opts = { sanitizeOps: false, sanitizeResources: false };
Deno.test({
  name: "reminder authorization: exact own user command, unknown outcome, foreign and assistant message refusal",
  ...opts,
  fn: async () => {
    const time = "2027-11-07T01:30:00-04:00";
    const conversation = await conversationWith(
      a,
      "user",
      `Remind me about task "Synthetic appointment" at ${time} [America/New_York]`,
    );
    const interpreted = await call(a, {
      action: "interpret",
      message_id: conversation.message_id,
    });
    assertEquals(interpreted.status, 200);
    assertEquals(interpreted.json.command.kind, "reminder");
    const op = interpreted.json.command.operation,
      operation_id = uuid();
    const request = {
      action: "apply",
      operation_id,
      authorization: {
        kind: "direct_command",
        message_id: conversation.message_id,
      },
      operations: [op],
    };
    assertEquals((await call(b, request)).status, 403);
    assertEquals(
      (
        await call(a, {
          ...request,
          operations: [
            {
              ...op,
              remind_at: "2027-11-07T01:40:00-04:00",
              wall_time: "2027-11-07T01:40:00",
            },
          ],
        })
      ).status,
      403,
      "command cannot widen time",
    );
    const saved = await call(a, request);
    assertEquals(saved.status, 200, JSON.stringify(saved));
    assertEquals((await call(a, request)).json.replayed, true);
    assertEquals(
      (await call(a, { ...request, operation_id: uuid() })).status,
      409,
    );
    const assistant = await messageIn(
      a,
      conversation.conversationRow,
      "assistant",
      `Remind me about task "Synthetic appointment" at ${time} [America/New_York]`,
    );
    assertEquals(
      (
        await call(a, {
          ...request,
          operation_id: uuid(),
          authorization: { kind: "direct_command", message_id: assistant },
        })
      ).status,
      403,
    );
    assertEquals(
      (
        await call(a, {
          ...request,
          operation_id: uuid(),
          authorization: { approved: true },
        })
      ).status,
      403,
    );
    assertEquals(
      (await call(a, { ...request, contract_version: 2 })).status,
      426,
    );
    assertEquals(
      (await call(a, { ...request, operations: [{ ...op, user_id: b.id }] }))
        .status,
      422,
    );
  },
});
Deno.test({
  name: "reminder proposal: registry produces data only and the exact approved server revision authorizes the change",
  ...opts,
  fn: async () => {
    const generated = extractActionProposal(
      `Review this time.\n[REMINDER]: ${ref} | 2027-11-07T01:30:00-05:00 | America/New_York`,
      [],
      new Set([ref]),
    );
    assertEquals(generated.proposal?.type, "reminder.schedule");
    assert(!generated.answer.includes("[REMINDER]"));
    const assistant = await conversationWith(
      a,
      "assistant",
      "Synthetic proposal",
    );
    const proposed = generated.proposal as {
      type: "reminder.schedule";
      task_ref: string;
      remind_at: string;
      wall_time: string;
      time_zone: string;
    };
    const { type, task_ref, remind_at, wall_time, time_zone } = proposed;
    const prepared = await call(a, {
      action: "prepare",
      operation: {
        type,
        task_ref,
        remind_at,
        wall_time,
        time_zone,
        expected_revision: 0,
      },
      source: {
        conversation_id: assistant.conversation_id,
        message_id: assistant.message_id,
      },
    });
    assertEquals(prepared.status, 200, JSON.stringify(prepared));
    const p = prepared.json.proposal;
    const request = {
      action: "apply",
      operation_id: uuid(),
      operations: p.operations,
      authorization: {
        kind: "approved_proposal",
        proposal_id: p.proposal_id,
        proposal_revision: p.proposal_revision,
      },
    };
    assertEquals((await call(b, request)).status, 403);
    assertEquals(
      (
        await call(a, {
          ...request,
          authorization: {
            ...request.authorization,
            proposal_revision: p.proposal_revision + 1,
          },
        })
      ).status,
      403,
    );
    assertEquals((await call(a, request)).status, 200);
    assertEquals(
      extractActionProposal(
        `[REMINDER]: custom:999999 | 2027-11-07T01:30:00-04:00 | America/New_York`,
        [],
        new Set([ref]),
      ).proposal,
      null,
    );
    assertEquals(
      extractActionProposal(
        `[REMINDER]: ${ref} | 2027-11-07T01:30:00 | America/New_York`,
        [],
        new Set([ref]),
      ).proposal,
      null,
    );
    assertEquals(
      (await sql`select count(*)::int n from quota_tripwire_calls`)[0].n,
      0,
    );
  },
});
Deno.test({
  name: "reminder command cleanup",
  ...opts,
  fn: async () => {
    await sql.end();
  },
});
