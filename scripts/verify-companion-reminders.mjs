// Headless reminder check. Default: scripted component proof. Optional live mode
// uses only the exact owned local Auth/JWT/action service and actual Cron due state.
// Runs actual drawer, reminder controls, controller, action client/store and translations.
// No web server, hosted request or provider. Live mode is not a Next.js shell or native check.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium } from "playwright";
const root = process.cwd();
const live = process.env.REMINDER_BROWSER_MODE === "live";
const API = process.env.ACTIONS_API_URL,
  ANON = process.env.ACTIONS_ANON_KEY,
  SERVICE = process.env.ACTIONS_SERVICE_ROLE_KEY;
const users = [],
  httpEvidence = [];
if (live) {
  assert.equal(API, "http://127.0.0.1:63081");
  assert(ANON && SERVICE);
  assert.equal(
    process.env.ACTIONS_DB_CONTAINER,
    "supabase_db_unify-reminders-368-r1",
  );
  assert.equal(
    process.env.ACTIONS_REST_CONTAINER,
    "supabase_rest_unify-reminders-368-r1",
  );
  const containers = JSON.parse(
    execFileSync(
      "docker",
      [
        "inspect",
        "--type",
        "container",
        ...["db", "auth", "rest", "kong", "edge_runtime"].map(
          (n) => "supabase_" + n + "_unify-reminders-368-r1",
        ),
      ],
      { encoding: "utf8" },
    ),
  );
  for (const c of containers) {
    assert.equal(
      c.Config.Labels["com.supabase.cli.project"],
      "unify-reminders-368-r1",
    );
    assert(c.State.Running);
    assert.equal(
      c.Config.Labels["com.supabase.cli.workdir"],
      realpathSync(
        "/Users/savargupta/.t3/worktrees/Unify/t3-abe3435e/DOCS/companion-actions/evidence/368-reminders-r1/.runtime/supabase/tests/companion-actions",
      ),
    );
    if (c.Name.includes("edge_runtime"))
      assert(
        c.Config.Env.includes(
          "COMPANION_CONTENT_QUERY_URL=http://host.docker.internal:3385/content",
        ),
      );
  }
}
async function http(
  path,
  { key = ANON, jwt = key, method = "POST", body } = {},
) {
  const start = performance.now();
  const response = await fetch(API + path, {
    method,
    headers: {
      apikey: key,
      authorization: "Bearer " + jwt,
      "content-type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  httpEvidence.push({
    path: path.split("?")[0],
    status: response.status,
    bytes: Buffer.byteLength(text),
    rows: Array.isArray(json)
      ? json.length
      : (json?.reminders?.items?.length ?? null),
    milliseconds: performance.now() - start,
  });
  return { status: response.status, json };
}
async function account() {
  const email =
      "reminder-browser-" + crypto.randomUUID() + "@reminder368.invalid",
    password = "reminder-browser-password-1";
  const made = await http("/auth/v1/admin/users", {
    key: SERVICE,
    body: { email, password, email_confirm: true },
  });
  assert.equal(made.status, 200);
  users.push(made.json.id);
  const signed = await http("/auth/v1/token?grant_type=password", {
    body: { email, password },
  });
  assert.equal(signed.status, 200);
  return { id: made.json.id, jwt: signed.json.access_token };
}
const envelope = (body) => ({
  contract_version: 1,
  client: { platform: "web", app_version: "reminder-live-browser" },
  ...body,
});
const action = (who, body) =>
  http("/functions/v1/companion-actions", {
    jwt: who.jwt,
    body: envelope(body),
  });
async function liveSetup() {
  const who = await account();
  const tasks = await http("/rest/v1/custom_checklist_tasks", {
    jwt: who.jwt,
    body: [
      { user_id: who.id, title: "Synthetic due task", priority: "Do soon" },
      {
        user_id: who.id,
        title: "Synthetic reminder control task",
        priority: "Do soon",
      },
    ],
  });
  assert.equal(tasks.status, 201);
  const [dueTask, formTask] = tasks.json,
    dueRef = "custom:" + dueTask.id,
    formRef = "custom:" + formTask.id;
  const at = new Date(Date.now() + 15000).toISOString();
  const scheduled = await action(who, {
    action: "apply",
    operation_id: crypto.randomUUID(),
    authorization: { kind: "ui_control" },
    operations: [
      {
        type: "reminder.schedule",
        task_ref: dueRef,
        expected_revision: dueTask.revision,
        remind_at: at,
        time_zone: "Etc/UTC",
        wall_time: at.slice(0, -1),
      },
    ],
  });
  assert.equal(scheduled.status, 200);
  return {
    who,
    config: {
      accountId: who.id,
      dueRef,
      formRef,
      operationIds: Array.from({ length: 20 }, () => crypto.randomUUID()),
    },
    before: { completed: formTask.completed, revision: formTask.revision },
  };
}
const out = process.env.REMINDER_BROWSER_OUT;
if (!out)
  throw new Error("REMINDER_BROWSER_OUT must name an owned evidence directory");
await mkdir(out, { recursive: true });
const fixture = String.raw`
import {useSyncExternalStore} from 'react';
export const useTaskActionClient=()=>window.__bound;
export const useTaskActionPhase=(store,key)=>useSyncExternalStore(store.subscribe,()=>store.get(key),()=>store.get(key));
export const useTaskActionDraft=(store,key)=>useSyncExternalStore(store.subscribe,()=>store.draft(key),()=>undefined);
`;
const entry = String.raw`
import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {createInstance} from 'i18next';
import {I18nextProvider,initReactI18next} from 'react-i18next';
import en from '@/lib/i18n/locales/en/translation.json';
import ar from '@/lib/i18n/locales/ar/translation.json';
import {createTaskActionClient} from '@/lib/companionActions/client';
import {TaskActionStore} from '@/lib/companionActions/taskActionStore';
import {noteAccount,ownAccountWork} from '@/lib/accountSession';
import {ReminderSection,ReminderList} from '@/components/companion/tasks/ReminderSection';
import {TaskDrawer} from '@/components/companion/tasks/TaskDrawer';
const lang=window.__locale;document.documentElement.dir=lang==='ar'?'rtl':'ltr';document.documentElement.lang=lang;
const i18n=createInstance();i18n.use(initReactI18next).init({lng:lang,resources:{en:{translation:en},ar:{translation:ar}},initImmediate:false});window.__labels=i18n.getResourceBundle(lang,'translation');
noteAccount(window.__liveConfig?.accountId??'browser-fixture');window.__calls=[];let count=0;
const client=createTaskActionClient({platform:'web',appVersion:'browser-fixture',transport:async body=>{
 window.__calls.push(body);
 if(window.__liveConfig){const response=await fetch('http://127.0.0.1:3390/reminder-actions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};}
 if(body.action==='prepare')return {status:200,body:{proposal:{proposal_id:'fixture-review',proposal_revision:1,kind:'reminder',status:'draft',operations:[body.operation]}}};
 if(body.action==='apply'){const op=body.operations[0];return {status:200,body:{receipt:{operation_id:body.operation_id,created_at:new Date().toISOString(),kind:'change',operation_type:op.type,task_ref:op.task_ref,before_state:'not_started',after_state:'not_started',after_revision:0,undone_by:null,undo_of:null,current:true,undoable:true,reminder:{reminder_id:'fixture',remind_at:op.remind_at,time_zone:op.time_zone,scheduling:'registered'}}}};}
 return {status:200,body:{status:'not_applied'}};
}});
window.__bound={client,owner:ownAccountWork()};
let refresh=()=>{};
const store=new TaskActionStore({client,newOperationId:()=>window.__liveConfig?window.__liveConfig.operationIds.shift():String(++count),onChanged:()=>refresh()});
const reminder={reminderId:'due-fixture',taskRef:'sanity:1',title:'Content task with the same numeric id',remindAt:'2027-11-07T05:30:00Z',timeZone:'America/New_York',wallTime:'2027-11-07T01:30:00',revision:1,status:'pending',due:true,dueAt:'2027-11-07T05:30:01Z',cancelledReason:null,history:[]};
function App(){const [open,setOpen]=useState(false),[ref,setRef]=useState(''),[loaded,setLoaded]=useState(null);
 useEffect(()=>{if(!window.__liveConfig)return;let cancelled=false;refresh=()=>client.read().then(r=>{if(!cancelled&&r.kind==='ok')setLoaded(r);});refresh();const timer=setInterval(refresh,1000);return()=>{cancelled=true;clearInterval(timer);};},[]);
 const view={status:'ready',byRef:new Map((loaded?.tasks??[]).map(t=>[t.taskRef,t])),stepsByRef:new Map(),details:[],stale:false,canWrite:!window.__liveConfig||Boolean(loaded),refetch:()=>refresh(),reminders:window.__liveConfig?loaded?.reminders:{items:[reminder],scheduler:'ready'}};
 return <I18nextProvider i18n={i18n}><main className="p-4"><textarea aria-label="Composer" defaultValue="Keep this composer draft"/><button type="button" onClick={()=>setOpen(true)}>Open task controls</button><TaskDrawer open={open} title="Task progress" onClose={()=>setOpen(false)}><ReminderList view={view} onOpen={setRef}/><p data-testid="opened-ref">{ref}</p><ReminderSection taskRef={window.__liveConfig?.formRef??"sanity:2"} view={view} store={store}/></TaskDrawer></main></I18nextProvider>;
}
createRoot(document.getElementById('root')).render(<App/>);
`;
const js = await build({
  stdin: {
    contents: entry,
    resolveDir: root,
    loader: "tsx",
    sourcefile: "reminder-browser-fixture.tsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  alias: { "@": root },
  define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
  plugins: [
    {
      name: "owned-hooks",
      setup(b) {
        b.onResolve(
          { filter: /^(?:@\/hooks\/useTaskActions|\.\/useTaskActions)$/ },
          () => ({ path: "hooks", namespace: "fixture" }),
        );
        b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents: fixture,
          loader: "tsx",
          resolveDir: root,
        }));
      },
    },
  ],
});
const css = await postcss([tailwind({ base: root })]).process(
  await readFile(join(root, "app/globals.css"), "utf8"),
  { from: join(root, "app/globals.css") },
);
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const lang of live ? ["en"] : ["en", "ar"])
    for (const width of live ? [390] : [390, 1280]) {
      const actual = live ? await liveSetup() : null;
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        reducedMotion: "reduce",
      });
      page.on("pageerror", (error) =>
        console.error("browser page error", error.message),
      );
      page.on("console", (message) => {
        if (message.type() === "error")
          console.error("browser console", message.text());
      });
      await page.route("**/*", async (route) => {
        if (
          !actual ||
          route.request().url() !== "http://127.0.0.1:3390/reminder-actions"
        )
          return route.abort();
        if (route.request().method() === "OPTIONS")
          return route.fulfill({
            status: 204,
            headers: {
              "access-control-allow-origin": "*",
              "access-control-allow-methods": "POST, OPTIONS",
              "access-control-allow-headers": "content-type",
            },
          });
        const reply = await action(actual.who, route.request().postDataJSON());
        await route.fulfill({
          status: reply.status,
          headers: {
            "content-type": "application/json",
            "access-control-allow-origin": "*",
          },
          body: JSON.stringify(reply.json),
        });
      });
      await page.setContent(
        "<html><head><style>" +
          css.css +
          '</style></head><body><div id="root"></div></body></html>',
      );
      await page.evaluate((locale) => (window.__locale = locale), lang);
      if (actual)
        await page.evaluate(
          (config) => (window.__liveConfig = config),
          actual.config,
        );
      await page.addScriptTag({ content: js.outputFiles[0].text });
      await page.getByRole("button", { name: "Open task controls" }).click();
      const labels = await page.evaluate(() => window.__labels.reminders);
      if (actual)
        await page
          .getByText(labels.due, { exact: true })
          .waitFor({ timeout: 90000 });
      await page
        .getByLabel(labels.instant)
        .fill(
          actual
            ? new Date(Date.now() + 120000)
                .toISOString()
                .replace(/\.\d{3}Z$/, "Z")
            : "2027-11-07T01:30-04:00",
        );
      await page
        .getByLabel(labels.zone, { exact: true })
        .fill(actual ? "Etc/UTC" : "America/New_York");
      const date = page.getByLabel(labels.instant);
      await date.focus();
      assert.equal(
        await date.evaluate((el) => el === document.activeElement),
        true,
      );
      await page
        .getByRole("button", { name: labels.review, exact: true })
        .press("Enter");
      await page
        .getByRole("button", { name: labels.save, exact: true })
        .waitFor();
      assert.equal(
        await page.evaluate(
          () => window.__calls.filter((c) => c.action === "apply").length,
        ),
        0,
      );
      await page
        .getByRole("button", { name: labels.save, exact: true })
        .press("Enter");
      await page.getByText(labels.saved, { exact: true }).waitFor();
      assert.equal(
        await page.evaluate(() =>
          Boolean(document.activeElement?.closest('[role="dialog"]')),
        ),
        true,
        "focus must remain in the drawer",
      );
      await page
        .getByRole("button", { name: labels.openTask, exact: true })
        .click();
      assert.equal(
        await page.getByTestId("opened-ref").textContent(),
        actual?.config.dueRef ?? "sanity:1",
      );
      if (actual) {
        const saved = await action(actual.who, { action: "read" });
        assert.equal(saved.status, 200);
        assert(
          saved.json.reminders.items.some(
            (r) =>
              r.task_ref === actual.config.formRef && r.status === "pending",
          ),
        );
        await page
          .getByRole("button", {
            name: await page.evaluate(() => window.__labels.taskActions.undo),
            exact: true,
          })
          .click();
        await page
          .getByRole("button", { name: labels.confirmUndo, exact: true })
          .click();
        await page.getByText(labels.stopped, { exact: true }).first().waitFor();
        const stopped = await action(actual.who, { action: "read" });
        assert.equal(stopped.status, 200);
        assert(
          stopped.json.reminders.items.some(
            (r) =>
              r.task_ref === actual.config.formRef && r.status === "cancelled",
          ),
        );
        const task = stopped.json.tasks.find(
          (t) => t.task_ref === actual.config.formRef,
        );
        assert.equal(task.state, "not_started");
        assert.equal(task.revision, actual.before.revision);
        const other = await account();
        const foreign = await action(other, { action: "read" });
        assert.equal(foreign.status, 200);
        assert.deepEqual(foreign.json.reminders.items, []);
        await writeFile(
          join(out, "live-persisted-readback.json"),
          JSON.stringify(
            {
              saved: saved.json.reminders.items,
              stopped: stopped.json.reminders.items,
              taskState: task.state,
              taskRevision: task.revision,
              foreignCount: 0,
            },
            null,
            2,
          ) + "\n",
        );
      }
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        targets: [...document.querySelectorAll('[role="dialog"] button')].map(
          (b) => ({
            text: b.textContent,
            height: b.getBoundingClientRect().height,
            layoutHeight: b.offsetHeight,
          }),
        ),
        dir: document.documentElement.dir,
      }));
      await writeFile(
        join(out, `layout-${lang}-${width}.json`),
        JSON.stringify(layout, null, 2) + "\n",
      );
      await page.screenshot({
        path: join(out, `reminders-${lang}-${width}.png`),
        fullPage: true,
      });
      assert.equal(layout.overflow, false);
      assert(layout.targets.every((t) => t.layoutHeight >= 44));
      await page.screenshot({
        path: join(out, `reminders-${lang}-${width}.png`),
        fullPage: true,
      });
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.equal(
        await page.getByLabel("Composer").inputValue(),
        "Keep this composer draft",
      );
      results.push({
        lang,
        width,
        proof: live
          ? "real local Auth/JWT/action service and rendered fixture"
          : "scripted rendered browser only",
        saved: true,
        stableRef: actual?.config.dueRef ?? "sanity:1",
        focusInside: true,
        composerPreserved: true,
        ...layout,
      });
      await page.close();
    }
  await writeFile(
    join(out, "browser-results.json"),
    JSON.stringify(results, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      passed: results.length,
      proof: live
        ? "real local Auth/JWT/action service and rendered fixture"
        : "scripted rendered browser only",
    }),
  );
} finally {
  await browser.close();
  if (live) {
    for (const id of users) {
      const removed = await http("/auth/v1/admin/users/" + id, {
        key: SERVICE,
        method: "DELETE",
      });
      assert(
        [200, 204].includes(removed.status),
        "owned synthetic account cleanup",
      );
    }
    await writeFile(
      join(out, "live-http-evidence.json"),
      JSON.stringify(httpEvidence, null, 2) + "\n",
    );
  }
}
