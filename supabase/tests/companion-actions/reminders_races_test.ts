import type { Reply } from "./support.ts";
interface ReminderRow {
  reminder_id: string;
  task_ref: string;
  due: boolean;
  history: { reason: string | null }[];
}
// Authenticated action boundary and committed outcomes. No worker invocation.
import { assert, assertEquals } from "jsr:@std/assert@1.0.19";
import {
  ready,
  sql,
  newAccount,
  existingCustomTask,
  taskOf,
  apply,
  read,
  uuid,
  prepare,
  confirmedApproval,
  undo,
  setState,
  contentStub,
  startContentStub,
  taskRemove,
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

const wait = async <T>(
  read: () => Promise<T>,
  match: (v: T) => boolean,
  label: string,
  ms = 15000,
) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await read();
    if (match(v)) return v;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("UNRESOLVED deadline: " + label);
};
const record = (name: string, data: unknown) => {
  const line = JSON.stringify({ name, data });
  console.log(line);
  const path = Deno.env.get("ACTIONS_REMINDER_EVIDENCE");
  if (path) Deno.writeTextFileSync(path, line + "\n", { append: true });
};
const locks = () =>
  sql`select pid,application_name,wait_event_type,wait_event,pg_blocking_pids(pid) blockers from pg_stat_activity where datname=current_database() and wait_event_type='Lock' order by pid`;
const row = async (id: string) =>
  (
    await sql`select r.status,r.cancelled_reason,e.reminder_id is not null claimed from companion_task_reminders r left join companion_reminder_private.events e on e.reminder_id=r.id where r.id=${id}::uuid`
  )[0];
await sql.unsafe(`create table companion_reminder_private.test_barriers(task_ref text primary key,kind text);
create function companion_reminder_private.test_barrier() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare barrier_ref text;barrier_kind text;
begin
 if tg_table_name='events' then select task_ref into barrier_ref from companion_task_reminders where id=new.reminder_id;barrier_kind:='claim';
 elsif tg_table_name='companion_task_reminders' then if new.status<>'cancelled' then return new;end if;barrier_ref:=new.task_ref;barrier_kind:='stop';
 elsif tg_table_name='user_tasks' then if new.completed is not true then return new;end if;barrier_ref:='sanity:'||new.sanity_checklist_id;barrier_kind:='stop';
 else if new.completed is not true and new.removed_at is null then return new;end if;barrier_ref:='custom:'||new.id;barrier_kind:='stop';end if;
 if exists(select 1 from companion_reminder_private.test_barriers b where b.task_ref=barrier_ref and b.kind=barrier_kind) then
 -- The barrier extends only its own wait. It leaves the worker's parent-lock order intact.
 perform set_config('lock_timeout','8s',true);perform pg_advisory_xact_lock(368,1);end if;
 return new;end $$;
create trigger test_claim_barrier before insert on companion_reminder_private.events for each row execute function companion_reminder_private.test_barrier();
create trigger zz_test_stop_barrier after update on custom_checklist_tasks for each row execute function companion_reminder_private.test_barrier();
create trigger zz_test_content_barrier after insert or update on user_tasks for each row execute function companion_reminder_private.test_barrier();
create trigger zz_test_cancel_barrier after update on companion_task_reminders for each row execute function companion_reminder_private.test_barrier();`);
for (const kind of [
  "complete",
  "remove",
  "cancel",
  "legacy",
  "content_complete",
] as const)
  for (const first of ["claim", "stop"] as const) {
    Deno.test({
      name: `reminders race: ${kind}, ${first} commits first`,
      ...opts,
      fn: async () => {
        let ref: string, revision: number, id: number | undefined;
        if (kind === "content_complete") {
          const key = "race-" + uuid();
          contentStub.published.add(key);
          ref = "sanity:" + key;
          revision = 0;
        } else {
          const task = await existingCustomTask(a);
          ref = task.ref;
          id = task.id;
          revision = (await taskOf(a, ref)).revision;
        }
        const op = schedule(ref, revision, 2200),
          saved = ok(await apply(a, [op])),
          rid = saved.results[0].reminder_id;
        const proposal =
          kind === "remove"
            ? ok(await prepare(a, taskRemove(ref, revision))).proposal
            : null;
        await sql`insert into companion_reminder_private.test_barriers values(${ref},${first})`;
        let release!: () => void, acquired!: () => void;
        const barrier = new Promise<void>((r) => (release = r)),
          held = new Promise<void>((r) => (acquired = r));
        const transaction = sql.begin(async (tx) => {
          await tx`select pg_advisory_xact_lock(368,1)`;
          acquired();
          await barrier;
        });
        await held;
        let request: Promise<Pick<Reply, "status" | "json">> | undefined;
        const stop = () =>
          kind === "content_complete"
            ? a.client
                .from("user_tasks")
                .insert({
                  user_id: a.id,
                  sanity_checklist_id: ref.slice(7),
                  completed: true,
                })
                .then((r) => ({
                  status: r.error ? 500 : 200,
                  json: r.error ?? {},
                }))
            : kind === "legacy"
              ? a.client
                  .from("custom_checklist_tasks")
                  .update({ completed: true })
                  .eq("id", id!)
                  .then((r) => ({
                    status: r.error ? 500 : 200,
                    json: r.error ?? {},
                  }))
              : kind === "cancel"
                ? apply(
                    a,
                    [
                      {
                        type: "reminder.cancel",
                        task_ref: ref,
                        expected_revision: revision,
                        reminder_id: rid,
                        expected_reminder_revision: 1,
                      },
                    ],
                    {
                      authorization: {
                        kind: "ui_control",
                        removal_confirmed: true,
                      },
                    },
                  )
                : kind === "remove"
                  ? apply(a, proposal.operations, {
                      authorization: confirmedApproval(proposal),
                    })
                  : apply(a, [setState(ref, "completed", revision)]);
        try {
          if (first === "claim")
            await wait(
              locks,
              (rs) => rs.some((r) => r.wait_event === "advisory"),
              "worker paused after parent lock",
            );
          request = Promise.resolve(stop());
          const graph = await wait(
            locks,
            (rs) => rs.length >= 2,
            "both transactions wait",
            6000,
          );
          const worker=graph.find(r=>r.application_name==='pg_cron');
      assert(worker,'actual Cron worker must wait in the graph');
      if(first==='claim')assert(graph.some(r=>r.pid!==worker.pid && r.blockers.includes(worker.pid)),'stop must wait on the worker');
      else assert(worker.blockers.some((pid:number)=>graph.some(r=>r.pid===pid && r.application_name!=='pg_cron')),'worker must wait on the stop');
      const snapshot = await row(rid);
          assertEquals([snapshot.status, snapshot.claimed], ["pending", false]);
          if (kind === "content_complete")
            assertEquals(
              (
                await sql`select count(*)::int n from user_tasks where user_id=${a.id}::uuid and sanity_checklist_id=${ref.slice(7)}`
              )[0].n,
              0,
            );
          else
            assertEquals(
              (
                await sql`select completed,removed_at from custom_checklist_tasks where id=${id!}`
              )[0],
              { completed: false, removed_at: null },
            );
          record(`${kind}-${first}-intermediate`, { snapshot, graph });
        } finally {
          release();
          await transaction;
        }
        const stopped = ok(await request!);
        await wait(
          () => row(rid),
          (r) => r.status === "cancelled",
          "committed stop",
        );
        const final = await row(rid);
        assertEquals(final.claimed, first === "claim");
        assertEquals(
          ok(await read(a)).reminders.items.find(
            (r: ReminderRow) => r.reminder_id === rid,
          ).due,
          false,
        );
        if (kind === "complete" || kind === "remove")
          ok(await undo(a, stopped.operation_id));
        assertEquals((await row(rid)).status, "cancelled");
        await sql`delete from companion_reminder_private.test_barriers where task_ref=${ref}`;
        record(`${kind}-${first}-final`, final);
      },
    });
  }
Deno.test({
  name: "reminder races: cleanup barriers and connections",
  ...opts,
  fn: async () => {
    await sql.unsafe(
      "drop trigger test_claim_barrier on companion_reminder_private.events;drop trigger zz_test_stop_barrier on custom_checklist_tasks;drop trigger zz_test_content_barrier on user_tasks;drop trigger zz_test_cancel_barrier on companion_task_reminders;drop function companion_reminder_private.test_barrier();drop table companion_reminder_private.test_barriers;",
    );
    await sql.end();
  },
});
