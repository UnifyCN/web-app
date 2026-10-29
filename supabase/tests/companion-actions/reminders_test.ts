import type { Reply } from "./support.ts";
interface ReminderRow {
  reminder_id: string;
  task_ref: string;
  due: boolean;
  history: { reason: string | null }[];
}
// Authenticated action boundary and committed outcomes. No worker invocation.
import { assert, assertEquals, AssertionError } from "jsr:@std/assert@1.0.19";
import {
  holdOperationLock,
  ready,
  sql,
  admin,
  newAccount,
  existingCustomTask,
  taskOf,
  apply,
  read,
  status,
  uuid,
  prepare,
  approved,
  undo,
  setState,
  contentStub,
  startContentStub,
  migrate,
} from "./support.ts";
await ready();
const migration = new URL(
  "../../migrations/20261029175439_companion_task_reminders.sql",
  import.meta.url,
);
if (
  !(
    await sql`select to_regprocedure('companion_reminder_private.tick()') is not null as applied`
  )[0].applied &&
  (await Deno.readTextFile(migration)).trim()
)
  await sql.begin(
    async (t) => await t.unsafe(await Deno.readTextFile(migration)),
  );
const a = await newAccount("reminders-a");
const b = await newAccount("reminders-b");
startContentStub();
await sql`select cron.alter_job(jobid,schedule:='1 second') from cron.job where jobname='companion-reminder-due'`;
const opts = { sanitizeOps: false, sanitizeResources: false };
const ok = (r: Pick<Reply, "status" | "json">) => {
  assertEquals(r.status, 200, JSON.stringify(r.json));
  return r.json;
};
function schedule(ref: string, revision: number, ms = 5000) {
  const instant = new Date(Date.now() + ms).toISOString();
  return {
    type: "reminder.schedule",
    task_ref: ref,
    expected_revision: revision,
    remind_at: instant,
    time_zone: "Etc/UTC",
    wall_time: instant.slice(0, -1),
  };
}
Deno.test({
  name: "reminders: concurrent authenticated saves replay one immutable schedule and receipt",
  ...opts,
  fn: async () => {
    const t = await existingCustomTask(a, "Synthetic reminder task"),
      rev = (await taskOf(a, t.ref)).revision;
    const op = schedule(t.ref, rev),
      operation_id = uuid();
    const held=holdOperationLock(a.id,operation_id);await held.ready;
    const requests=[apply(a,[op],{operation_id}),apply(a,[op],{operation_id})];
    try {
      const graph=await wait(async()=>sql`select pid,pg_blocking_pids(pid) blockers from pg_stat_activity where datname=current_database() and wait_event='advisory'`,r=>r.length>=2,'both duplicate operations wait');
      assertEquals((await sql`select count(*)::int n from companion_task_reminders where task_ref=${t.ref}`)[0].n,0);
      assertEquals(ok(await status(a,operation_id)).status,'pending');
      console.log(JSON.stringify({name:'duplicate-intermediate',reminders:0,graph}));
    } finally {await held.release();}
    const rs=(await Promise.all(requests)).map(ok);
    assertEquals(rs.map((r) => r.replayed).sort(), [false, true]);
    assertEquals(rs[0].results[0].reminder_id, rs[1].results[0].reminder_id);
    assertEquals(
      (
        await sql`select count(*)::int n from companion_task_reminders where user_id=${a.id}::uuid and task_ref=${t.ref}`
      )[0].n,
      1,
    );
    assertEquals(ok(await status(a, operation_id)).status, "applied");
    assertEquals(ok(await read(a)).reminders.items.length, 1);
    assertEquals((await taskOf(a, t.ref)).state, "not_started");
  },
});

const wait = async <T>(
  read: () => Promise<T>,
  match: (v: T) => boolean,
  label: string,
  ms = 15000,
) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = await read();
    if (match(value)) return value;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error("UNRESOLVED deadline: " + label);
};
const rows = async (id: string) =>
  (
    await sql`select r.*,e.due_at from companion_task_reminders r left join companion_reminder_private.events e on e.reminder_id=r.id where r.id=${id}::uuid`
  )[0];
const due = async (who: typeof a) =>
  ok(await read(who)).reminders.items.filter((r: ReminderRow) => r.due);
const saved = async (ref: string, revision: number, ms = 1800) => {
  const op = schedule(ref, revision, ms),
    operation_id = uuid();
  const result = ok(await apply(a, [op], { operation_id }));
  return { op, operation_id, id: result.results[0].reminder_id };
};
Deno.test({
  name: "reminders: actual Cron, not early, one event, owner isolation, unknown-outcome lookup",
  ...opts,
  fn: async () => {
    const t = await existingCustomTask(a),
      rev = (await taskOf(a, t.ref)).revision;
    const x = await saved(t.ref, rev, 3000);
    assertEquals(
      (await due(a)).filter((r: ReminderRow) => r.reminder_id === x.id).length,
      0,
    );
    await wait(
      () => rows(x.id),
      (r) => r.due_at != null,
      "real Cron claim",
    );
    assertEquals(
      (await due(a)).filter((r: ReminderRow) => r.reminder_id === x.id).length,
      1,
    );
    assertEquals((await due(b)).length, 0);
    assertEquals(
      (
        await b.client
          .from("companion_task_reminders")
          .select("*")
          .eq("id", x.id)
      ).data,
      [],
    );
    assertEquals(
      (await a.client.rpc("companion_read_reminders", { p_user_id: b.id }))
        .error?.code,
      "42501",
    );
    assertEquals((await apply(b, [x.op])).status, 404);
    assertEquals(ok(await status(b, x.operation_id)).status, "not_applied");
    assertEquals(ok(await status(a, x.operation_id)).status, "applied");
    assertEquals(
      ok(await apply(a, [x.op], { operation_id: x.operation_id })).replayed,
      true,
    );
    assertEquals(
      (
        await sql`select count(*)::int n from companion_reminder_private.events where reminder_id=${x.id}::uuid`
      )[0].n,
      1,
    );
    assert(new Date((await rows(x.id)).due_at) >= new Date(x.op.remind_at));
  },
});
Deno.test({
  name: "reminders: published parent without progress, invalid content and content outage",
  ...opts,
  fn: async () => {
    const op = schedule("sanity:sin-number", 0, 4000);
    assertEquals(
      (
        await sql`select count(*)::int n from user_tasks where user_id=${a.id}::uuid and sanity_checklist_id='sin-number'`
      )[0].n,
      0,
    );
    const x = ok(await apply(a, [op]));
    assertEquals((await apply(a, [schedule("sanity:missing", 0)])).status, 404);
    contentStub.fail = true;
    try {
      assertEquals(
        (await apply(a, [schedule("sanity:bank-account", 0)])).status,
        503,
      );
    } finally {
      contentStub.fail = false;
    }
    await wait(
      () => rows(x.results[0].reminder_id),
      (r) => r.due_at != null,
      "content-backed Cron",
    );
    assertEquals(
      (
        await sql`select count(*)::int n from user_tasks where user_id=${a.id}::uuid and sanity_checklist_id='sin-number'`
      )[0].n,
      0,
      "opening/read/claim cannot create progress",
    );
    assertEquals(
      (await due(a)).filter(
        (r: ReminderRow) => r.task_ref === "sanity:sin-number",
      ).length,
      1,
    );
    // Authenticated legacy first insert shares the parent boundary and atomically cancels.
    const legacy = await a.client
      .from("user_tasks")
      .insert({
        user_id: a.id,
        sanity_checklist_id: "sin-number",
        completed: true,
      });
    assertEquals(legacy.error, null);
    assertEquals(
      (await rows(x.results[0].reminder_id)).cancelled_reason,
      "task_completed",
    );
    assertEquals(
      (await due(a)).filter(
        (r: ReminderRow) => r.task_ref === "sanity:sin-number",
      ).length,
      0,
    );
  },
});
Deno.test({
  name: "reminders: proposal approval, revision conflict, schedule change and receipt-specific Undo",
  ...opts,
  fn: async () => {
    const t = await existingCustomTask(a),
      rev = (await taskOf(a, t.ref)).revision;
    const op = schedule(t.ref, rev, 60000),
      p = ok(await prepare(a, op)).proposal;
    assertEquals(
      (await apply(b, p.operations, { authorization: approved(p) })).status,
      403,
    );
    assertEquals(
      (
        await apply(a, p.operations, {
          authorization: {
            kind: "approved_proposal",
            proposal_id: p.proposal_id,
            proposal_revision: p.proposal_revision + 1,
          },
        })
      ).status,
      403,
    );
    const first = ok(
        await apply(a, p.operations, { authorization: approved(p) }),
      ),
      id = first.results[0].reminder_id;
    const revised = {
      ...schedule(t.ref, rev, 120000),
      reminder_id: id,
      expected_reminder_revision: 1,
    };
    const proposal = ok(await prepare(a, revised)).proposal;
    const changed = ok(
      await apply(a, proposal.operations, {
        authorization: approved(proposal),
      }),
    );
    assertEquals((await rows(id)).cancelled_reason, "rescheduled");
    const newer = changed.results[0].reminder_id;
    const oldUndo = ok(
      await undo(a, first.operation_id, {
        authorization: { kind: "ui_control", removal_confirmed: true },
      }),
    );
    assertEquals(
      (await rows(newer)).status,
      "pending",
      "old Undo cannot stop a later schedule",
    );
    assertEquals(oldUndo.receipt.undo_of, first.operation_id);
    assertEquals(
      (await undo(a, changed.operation_id)).status,
      403,
      "Undo needs cancellation confirmation",
    );
    ok(
      await undo(a, changed.operation_id, {
        authorization: { kind: "ui_control", removal_confirmed: true },
      }),
    );
    assertEquals((await rows(newer)).status, "cancelled");
    assertEquals(
      (await rows(id)).status,
      "cancelled",
      "Undo cannot restart predecessor",
    );
    const x = await saved(t.ref, rev, 60000);
    const cancel = {
      type: "reminder.cancel",
      task_ref: t.ref,
      expected_revision: rev,
      reminder_id: x.id,
      expected_reminder_revision: 1,
    };
    assertEquals((await apply(a, [cancel])).status, 403);
    const stopped = ok(
      await apply(a, [cancel], {
        authorization: { kind: "ui_control", removal_confirmed: true },
      }),
    );
    ok(await undo(a, stopped.operation_id));
    assertEquals(
      (await rows(x.id)).status,
      "cancelled",
      "cancellation Undo requires a new explicit schedule",
    );
    const before = ok(await prepare(a, schedule(t.ref, rev, 60000))).proposal;
    ok(await apply(a, [setState(t.ref, "waiting", rev, "Synthetic wait")]));
    const stale = await apply(a, before.operations, {
      authorization: approved(before),
    });
    assertEquals(stale.status, 409);
    assertEquals(stale.json.error, "needs_review");
    assertEquals(
      stale.json.proposal.proposal_revision,
      before.proposal_revision + 1,
    );
    assertEquals(
      (
        await sql`select count(*)::int n from companion_task_reminders where task_ref=${t.ref} and status='pending'`
      )[0].n,
      0,
    );
  },
});
Deno.test({
  name: "reminders: DST gap, explicit fold offsets and stable saved instant after zone change",
  ...opts,
  fn: async () => {
    const ids: string[] = [];
    for (const [i, offset] of ["-04:00", "-05:00"].entries()) {
      const t = await existingCustomTask(a),
        rev = (await taskOf(a, t.ref)).revision;
      const base = {
        ...schedule(t.ref, rev),
        time_zone: "America/New_York",
        wall_time: "2027-11-07T01:30:00",
        remind_at: "2027-11-07T01:30:00" + offset,
      };
      if (i === 0) {
        assertEquals(
          (await apply(a, [{ ...base, remind_at: "2027-11-07T01:30:00" }]))
            .status,
          422,
        );
        assertEquals(
          (
            await apply(a, [
              {
                ...base,
                wall_time: "2027-03-14T02:30:00",
                remind_at: "2027-03-14T02:30:00-05:00",
              },
            ])
          ).status,
          422,
        );
      }
      ids.push(ok(await apply(a, [base])).results[0].reminder_id);
    }
    const epochs = async () =>
      await sql`select extract(epoch from remind_at)::bigint epoch,time_zone from companion_task_reminders where id in (${ids[0]}::uuid,${ids[1]}::uuid) order by remind_at`;
    const original = await epochs();
    assertEquals(Number(original[1].epoch) - Number(original[0].epoch), 3600);
    await sql`set time zone 'Asia/Tokyo'`;
    assertEquals(Array.from(await epochs()), Array.from(original));
    await sql`set time zone 'UTC'`;
  },
});
Deno.test({
  name: "reminders: stopped job, item failure isolation, bounded batch and recovered read failure",
  ...opts,
  fn: async () => {
    await sql`select cron.alter_job(jobid,active:=false) from cron.job where jobname='companion-reminder-due'`;
    const t = await existingCustomTask(a),
      x = await saved(t.ref, (await taskOf(a, t.ref)).revision, 500);
    await new Promise((r) => setTimeout(r, 1300));
    assertEquals((await rows(x.id)).due_at, null);
    assertEquals(ok(await status(a, x.operation_id)).status, "applied");
    assertEquals(ok(await read(a)).reminders.scheduler, "unavailable");
    await sql.unsafe(
      `create function companion_reminder_private.test_item_fault() returns trigger language plpgsql as $$ begin if new.reminder_id='${x.id}'::uuid then raise exception 'synthetic item fault';end if;return new;end $$;create trigger test_item_fault before insert on companion_reminder_private.events for each row execute function companion_reminder_private.test_item_fault();`,
    );
    const goodTask = await existingCustomTask(a),
      good = await saved(
        goodTask.ref,
        (await taskOf(a, goodTask.ref)).revision,
        500,
      );
    await sql`select cron.alter_job(jobid,active:=true) from cron.job where jobname='companion-reminder-due'`;
    try {
      await wait(
        () => rows(good.id),
        (r) => r.due_at != null,
        "valid item after failed item",
      );
      assertEquals((await rows(x.id)).last_error, "P0001");
      assertEquals(
        (
          await sql`select max(attempted)::int n from companion_reminder_private.runs`
        )[0].n <= 50,
        true,
      );
    } finally {
      await sql.unsafe(
        "drop trigger test_item_fault on companion_reminder_private.events;drop function companion_reminder_private.test_item_fault()",
      );
    }
    await sql`update companion_task_reminders set next_attempt_at=clock_timestamp() where id=${x.id}::uuid`;
    await wait(
      () => rows(x.id),
      (r) => r.due_at != null,
      "fair retry after item recovery",
    );
    const original = (
      await sql`select pg_get_functiondef('public.companion_read_reminders(uuid)'::regprocedure) def`
    )[0].def;
    try {
      await sql.unsafe(
        `create or replace function public.companion_read_reminders(p_user_id uuid) returns jsonb language plpgsql security definer as $$begin raise exception 'synthetic read outage';end $$`,
      );
      assertEquals((await read(a)).status, 500);
      assertEquals((await rows(good.id)).status, "pending");
    } finally {
      await sql.unsafe(original);
    }
    assertEquals(
      (await due(a)).filter((r: ReminderRow) => r.reminder_id === good.id)
        .length,
      1,
    );
  },
});
Deno.test({
  name: "reminders: actual failed Cron run is observable without changing progress",
  ...opts,
  fn: async () => {
    const original = (
      await sql`select pg_get_functiondef('companion_reminder_private.tick()'::regprocedure) def`
    )[0].def;
    const before = (
      await sql`select coalesce(max(runid),0)::int n from cron.job_run_details`
    )[0].n;
    try {
      await sql.unsafe(
        `create or replace function companion_reminder_private.tick() returns void language plpgsql security definer as $$begin raise exception 'synthetic worker outage';end $$`,
      );
      await wait(
        async () =>
          sql`select status from cron.job_run_details where runid>${before} and status='failed'`,
        (r) => r.length > 0,
        "actual Cron failed run",
      );
      assertEquals(ok(await read(a)).reminders.scheduler, "degraded");
    } finally {
      await sql.unsafe(original);
    }
  },
});
Deno.test({
  name: "reminders: binding owner, cancellation and due-time mutations fail at assertions",
  ...opts,
  fn: async () => {
    const original = (
      await sql`select pg_get_functiondef('public.companion_read_reminders(uuid)'::regprocedure) def`
    )[0].def;
    const t = await existingCustomTask(a),
      x = await saved(t.ref, (await taskOf(a, t.ref)).revision, 900);
    await wait(
      () => rows(x.id),
      (r) => r.due_at != null,
      "mutation fixture due",
    );
    ok(
      await apply(
        a,
        [
          {
            type: "reminder.cancel",
            task_ref: t.ref,
            expected_revision: (await taskOf(a, t.ref)).revision,
            reminder_id: x.id,
            expected_reminder_revision: 1,
          },
        ],
        { authorization: { kind: "ui_control", removal_confirmed: true } },
      ),
    );
    const results: { name: string; verdict: string }[] = [];
    async function mutation(
      name: string,
      from: string,
      to: string,
      check: () => Promise<void>,
    ) {
      assert(original.includes(from), "mutation anchor must exist");
      try {
        await sql.unsafe(original.replace(from, to));
        try {
          await check();
          results.push({ name, verdict: "SURVIVED" });
          throw new Error("surviving mutation");
        } catch (e) {
          if (!(e instanceof AssertionError)) throw e;
          results.push({ name, verdict: "assertion RED" });
        }
      } finally {
        await sql.unsafe(original);
      }
    }
    await mutation(
      "owner",
      "where r.user_id=p_user_id",
      "where true",
      async () => {
        assertEquals(ok(await read(b)).reminders.items.length, 0);
      },
    );
    await mutation(
      "cancelled due",
      "e.reminder_id is not null and r.status='pending'",
      "e.reminder_id is not null",
      async () => {
        assertEquals(
          (await due(a)).filter((r: ReminderRow) => r.reminder_id === x.id)
            .length,
          0,
        );
      },
    );
    const tick = (
      await sql`select pg_get_functiondef('companion_reminder_private.tick()'::regprocedure) def`
    )[0].def;
    const futureTask = await existingCustomTask(a),
      future = await saved(
        futureTask.ref,
        (await taskOf(a, futureTask.ref)).revision,
        86400000,
      );
    try {
      const broken = tick
        .replaceAll("x.remind_at<=clock_timestamp()", "true")
        .replaceAll("remind_at<=clock_timestamp()", "true");
      assert(broken !== tick);
      await sql.unsafe(broken);
      await wait(
        () => rows(future.id),
        (r) => r.due_at != null,
        "mutated real worker",
      );
      try {
        assertEquals(
          (await due(a)).filter((r: ReminderRow) => r.reminder_id === future.id)
            .length,
          0,
        );
        throw new Error("surviving due-time mutation");
      } catch (e) {
        if (!(e instanceof AssertionError)) throw e;
        results.push({ name: "due time", verdict: "assertion RED" });
      }
    } finally {
      await sql.unsafe(tick);
      await sql`delete from companion_reminder_private.events e using companion_task_reminders r where e.reminder_id=r.id and r.remind_at>clock_timestamp()`;
    }
    assertEquals(results.filter((r) => r.verdict === "SURVIVED").length, 0);
    console.log(JSON.stringify({ mutations: results }));
  },
});
Deno.test({
  name: "reminders: rollback/reapply stops schedules, preserves history/receipts and never restarts old work",
  ...opts,
  fn: async () => {
    const t = await existingCustomTask(a),
      x = await saved(t.ref, (await taskOf(a, t.ref)).revision, 60000);
    const foreignTask=await existingCustomTask(b),foreignOp=schedule(foreignTask.ref,(await taskOf(b,foreignTask.ref)).revision,60000);
    ok(await apply(b,[foreignOp],{operation_id:x.operation_id}));
    await sql.begin(
      async (tx) =>
        await tx.unsafe(
          await Deno.readTextFile(
            new URL(
              "../../rollbacks/20261029175439_companion_task_reminders.down.sql",
              import.meta.url,
            ),
          ),
        ),
    );
    assertEquals(
      (
        await sql`select status,cancelled_reason from companion_task_reminders where id=${x.id}::uuid`
      )[0],
      { status: "cancelled", cancelled_reason: "schema_rollback" },
    );
    await migrate("down");
    await ready();
    await sql.begin(
      async (tx) => await tx.unsafe(await Deno.readTextFile(migration)),
    );
    await wait(
      async () => admin.rpc("companion_read_reminders", { p_user_id: a.id }),
      (r) => !r.error,
      "schema cache restored",
    );
    assertEquals(ok(await status(b,x.operation_id)).status,'applied');
    assertEquals((await rows(x.id)).status, "cancelled");
    assertEquals(
      ok(await apply(a, [x.op], { operation_id: x.operation_id })).replayed,
      true,
    );
    assertEquals(
      (await due(a)).filter((r: ReminderRow) => r.reminder_id === x.id).length,
      0,
    );
    assertEquals(
      ok(await read(a))
        .reminders.items.find((r: ReminderRow) => r.reminder_id === x.id)
        .history.some(
          (h: { reason: string | null }) => h.reason === "schema_rollback",
        ),
      true,
    );
    assertEquals(
      (await sql`select count(*)::int n from quota_tripwire_calls`)[0].n,
      0,
    );
  },
});
Deno.test({
  name: "reminders: cleanup client connections",
  ...opts,
  fn: async () => {
    await sql.end();
  },
});
