// Headless rendered-component evidence with a scripted service. No Auth/database proof.
// Runs actual drawer, reminder controls, controller, action client/store and translations.
// No web server or external network. Real-service acceptance remains a separate gate.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium } from "playwright";
const root = process.cwd();
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
import React,{useState} from 'react';
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
noteAccount('browser-fixture');window.__calls=[];let count=0;
const client=createTaskActionClient({platform:'web',appVersion:'browser-fixture',transport:async body=>{
 window.__calls.push(body);
 if(body.action==='prepare')return {status:200,body:{proposal:{proposal_id:'fixture-review',proposal_revision:1,kind:'reminder',status:'draft',operations:[body.operation]}}};
 if(body.action==='apply'){const op=body.operations[0];return {status:200,body:{receipt:{operation_id:body.operation_id,created_at:new Date().toISOString(),kind:'change',operation_type:op.type,task_ref:op.task_ref,before_state:'not_started',after_state:'not_started',after_revision:0,undone_by:null,undo_of:null,current:true,undoable:true,reminder:{reminder_id:'fixture',remind_at:op.remind_at,time_zone:op.time_zone,scheduling:'registered'}}}};}
 return {status:200,body:{status:'not_applied'}};
}});
window.__bound={client,owner:ownAccountWork()};
const store=new TaskActionStore({client,newOperationId:()=>String(++count),onChanged:()=>{}});
const reminder={reminderId:'due-fixture',taskRef:'sanity:1',title:'Content task with the same numeric id',remindAt:'2027-11-07T05:30:00Z',timeZone:'America/New_York',wallTime:'2027-11-07T01:30:00',revision:1,status:'pending',due:true,dueAt:'2027-11-07T05:30:01Z',cancelledReason:null,history:[]};
function App(){const [open,setOpen]=useState(false),[ref,setRef]=useState('');const view={status:'ready',byRef:new Map(),stepsByRef:new Map(),details:[],stale:false,canWrite:true,refetch:()=>{},reminders:{items:[reminder],scheduler:'ready'}};
 return <I18nextProvider i18n={i18n}><main className="p-4"><textarea aria-label="Composer" defaultValue="Keep this composer draft"/><button type="button" onClick={()=>setOpen(true)}>Open task controls</button><TaskDrawer open={open} title="Task progress" onClose={()=>setOpen(false)}><ReminderList view={view} onOpen={setRef}/><p data-testid="opened-ref">{ref}</p><ReminderSection taskRef="sanity:2" view={view} store={store}/></TaskDrawer></main></I18nextProvider>;
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
  for (const lang of ["en", "ar"])
    for (const width of [390, 1280]) {
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
      await page.route("**/*", (route) => route.abort());
      await page.setContent(
        "<html><head><style>" +
          css.css +
          '</style></head><body><div id="root"></div></body></html>',
      );
      await page.evaluate((locale) => (window.__locale = locale), lang);
      await page.addScriptTag({ content: js.outputFiles[0].text });
      await page.getByRole("button", { name: "Open task controls" }).click();
      const labels = await page.evaluate(() => window.__labels.reminders);
      await page.getByLabel(labels.instant).fill("2027-11-07T01:30-04:00");
      await page
        .getByLabel(labels.zone, { exact: true })
        .fill("America/New_York");
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
        "sanity:1",
      );
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
        proof: "scripted rendered browser only",
        saved: true,
        stableRef: "sanity:1",
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
      proof: "scripted rendered browser only",
    }),
  );
} finally {
  await browser.close();
}
