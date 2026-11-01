// Actual reminder component, shared CSS and Reveal in Chromium. The editor is
// controlled. This does not prove service, Next.js, native or screen-reader use.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium } from "playwright";

const root = process.cwd();
const component = resolve(process.env.REMINDER_PRESENTATION_COMPONENT || "components/companion/tasks/ReminderSection.tsx");
const out = resolve(process.env.REMINDER_PRESENTATION_OUT || "docs/evidence/reminder-standards-corrections-r1/browser");
await mkdir(out, { recursive: true });
const entry = `
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {MotionConfig} from 'framer-motion';
import {createInstance} from 'i18next';
import {I18nextProvider} from 'react-i18next';
import en from '@/lib/i18n/locales/en/translation.json';
import {motionCssVars} from '@/lib/motion';
import {parseReceipt} from '@/lib/companionActions/contract';
import {ReminderSection} from '@reminder-component';
const i18n=createInstance();
i18n.init({lng:'en',resources:{en:{translation:en}},initImmediate:false});
window.labels={...en.reminders,...en.taskActions};
window.reveals=[];
const proposal={proposalId:'proposal',proposalRevision:1,kind:'reminder',status:'draft',
 operation:{type:'reminder.schedule',task_ref:'sanity:1',expected_revision:0,
 remind_at:'2027-11-07T01:30:00-04:00',time_zone:'America/New_York',wall_time:'2027-11-07T01:30:00'}};
const receipt=parseReceipt({operation_id:'saved',created_at:'2026-10-29T00:00:00Z',kind:'change',
 operation_type:'reminder.schedule',task_ref:'sanity:1',before_state:'not_started',after_state:'not_started',
 after_revision:0,undone_by:null,undo_of:null,current:true,undoable:true,
 reminder:{reminder_id:'r1',remind_at:'2027-11-07T01:30:00-04:00',time_zone:'America/New_York',scheduling:'registered'}});
const view={status:'ready',byRef:new Map(),stepsByRef:new Map(),details:[],stale:false,canWrite:true,
 refetch(){},reminders:{items:[],scheduler:'ready'}};
function App(){
 const [value,setValue]=useState({phase:{phase:'idle'},proposal:null,confirm:null});
 const [control,setControl]=useState(0);
 const editor={...value,draft:{instant:'2027-11-07T01:30-04:00',zone:'America/New_York'},
 active:true,canSchedule:true,canWrite:true,isOwned:()=>true,change(){},save(){},clearReview(){},
 prepare:()=>new Promise(resolve=>{window.finish=()=>{flushSync(()=>setValue(v=>({...v,proposal})));resolve();};}),
 cancel:()=>new Promise(resolve=>{window.finish=()=>{flushSync(()=>setValue(v=>({...v,proposal:{...proposal,
 operation:{type:'reminder.cancel',task_ref:'sanity:1',expected_revision:0,reminder_id:'r1',expected_reminder_revision:0}}})));resolve();};}),
 setConfirm:confirm=>setValue(v=>({...v,confirm})),undo(){},lookup(){},retry(){}};
 window.editor=editor;
 window.fixture={phase(phase){flushSync(()=>{setValue({phase:{phase},proposal:null,confirm:null});setControl(n=>n+1);});},
 reset(undo=false){flushSync(()=>setValue({phase:undo?{phase:'saved',receipt}:{phase:'idle'},proposal:null,confirm:null}));window.reveals=[];},
 complete(){window.reveals=[];window.finish();}};
 return <I18nextProvider i18n={i18n}><MotionConfig reducedMotion="user"><div style={motionCssVars}>
 <ReminderSection taskRef="sanity:1" view={view} store={null}/>
 {control>0&&<p id="control" key={control} className="loading-delayed">Positive delay control</p>}
 </div></MotionConfig></I18nextProvider>;
}
createRoot(document.getElementById('root')).render(<App/>);
`;
const js = await build({
  stdin: { contents: entry, loader: "tsx", resolveDir: root }, bundle: true, write: false,
  format: "iife", platform: "browser", jsx: "automatic", alias: { "@": root },
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "controlled-reminder-editor", setup(builder) {
    builder.onResolve({ filter: /^@reminder-component$/ }, () => ({ path: component, namespace: "pinned-component" }));
    builder.onLoad({ filter: /.*/, namespace: "pinned-component" }, async () => ({
      contents: await readFile(component, "utf8"), resolveDir: root, loader: "tsx",
    }));
    builder.onResolve({ filter: /^@\/hooks\/useReminderEditor$/ }, () => ({ path: "editor", namespace: "fixture" }));
    builder.onResolve({ filter: /^@\/components\/ui\/Reveal$/ }, () => ({ path: "reveal", namespace: "fixture" }));
    builder.onLoad({ filter: /^editor$/, namespace: "fixture" }, () => ({ contents: "export const useReminderEditor=()=>window.editor;" }));
    builder.onLoad({ filter: /^reveal$/, namespace: "fixture" }, () => ({ resolveDir: root, loader: "tsx",
      contents: `import {Reveal as Actual} from ${JSON.stringify(join(root,"components/ui/Reveal.tsx"))};
      export function Reveal(props){window.reveals.push({open:props.open,instant:props.instant??false});return <Actual {...props}/>;}` }));
  } }], logLevel: "error",
});
const css = await postcss([tailwind({ base: root })]).process(await readFile(join(root,"app/globals.css"),"utf8"), {from:join(root,"app/globals.css")});
const checks = [];
const check = (name, passed, detail) => checks.push({ name, passed: Boolean(passed), detail });
async function fixturePage(context) {
  const page = await context.newPage();
  await page.route("**/*", route => route.abort());
  await page.setContent(`<html><head><style>${css.css}</style></head><body style="background:white;padding:16px"><div id="root"></div></body></html>`);
  await page.addScriptTag({ content: js.outputFiles[0].text });
  await page.waitForFunction(() => Boolean(window.fixture));
  return page;
}
const browser = await chromium.launch({ headless: true });
try {
  for (const reducedMotion of ["no-preference", "reduce"]) {
    const context = await browser.newContext({ viewport: {width:390,height:844}, reducedMotion });
    let page = await fixturePage(context);
    const labels = await page.evaluate(() => window.labels);
    const measure = phase => page.evaluate(phase => {
      window.fixture.phase(phase);
      const status=document.querySelector('[role="status"]');
      const sample=node=>({opacity:getComputedStyle(node).opacity,delay:getComputedStyle(node).animationDelay,
        animation:getComputedStyle(node).animationName,text:node.textContent});
      return {status:sample(status),control:sample(document.getElementById('control'))};
    },phase);
    for (const phase of ["saving","checking"]) {
      const first = await measure(phase);
      const control = first.control.opacity === "0" && first.control.delay === "0.3s";
      assert(control, "The same-frame positive CSS control must be hidden or no product result counts.");
      check(`${reducedMotion}: ${phase} status exists immediately`, Boolean(first.status.text), first);
      check(`${reducedMotion}: ${phase} waits 300 ms`, first.status.opacity === "0" && first.status.delay === "0.3s",first);
      await page.waitForFunction(() => getComputedStyle(document.getElementById('control')).opacity === "1");
      const visible = await page.locator('[role="status"]').evaluate(node=>getComputedStyle(node).opacity);
      check(`${reducedMotion}: ${phase} becomes visible`, visible === "1",visible);
    }
    for (const phase of ["pending","lookup_failed","not_applied"]) {
      const value = await measure(phase);
      const label = phase === "not_applied" ? labels.retry : labels.checkAgain;
      const control = page.getByRole('button',{name:label,exact:true});
      check(`${reducedMotion}: ${phase} recovery is immediate`, value.status.opacity === "1" && await control.isEnabled(),value);
    }
    for (const action of ["schedule","cancel","undo"]) {
      for (const keyboard of [true,false]) {
        await page.close();
        page = await fixturePage(context);
        await page.evaluate(undo=>window.fixture.reset(undo),action === "undo");
        const label = action === "schedule" ? labels.review : action === "cancel" ? labels.cancel : labels.undo;
        const button = action === "undo"
          ? page.getByRole('status').getByRole('button',{name:label,exact:true})
          : page.getByRole('button',{name:label,exact:true});
        if (await button.count() !== 1) {
          await writeFile(join(out,'ambiguous-control.html'),await page.content());
          await writeFile(join(out,'ambiguous-control.json'),JSON.stringify(await page.evaluate(()=>({
            phase:window.editor.phase,confirm:window.editor.confirm,reveals:window.reveals,
            statuses:[...document.querySelectorAll('[role="status"]')].map(n=>n.outerHTML),
          })),null,2)+'\n');
          throw new Error(`Ambiguous fixture control: ${reducedMotion}/${action}/${keyboard}`);
        }
        if (keyboard) { await button.focus(); await button.press('Enter'); } else await button.click();
        let result;
        if (action !== "undo") {
          result = await page.evaluate(()=>{window.fixture.complete();return window.reveals.filter(r=>r.open);});
        } else result = await page.evaluate(()=>window.reveals.filter(r=>r.open));
        check(`${reducedMotion}: ${action} ${keyboard?'keyboard':'pointer'} modality`,result.length>0 && result.at(-1).instant===keyboard,result);
      }
    }
    await page.close();
    page = await fixturePage(context);
    const colors=await page.evaluate(()=>({heading:getComputedStyle(document.querySelector('h3')).color,
      help:getComputedStyle([...document.querySelectorAll('p')].find(p=>p.textContent===window.labels.timeHelp)).color,
      border:getComputedStyle(document.querySelector('section')).borderTopColor,
      overflow:document.documentElement.scrollWidth>390}));
    check(`${reducedMotion}: approved heading ink`,colors.heading==='rgb(23, 22, 22)',colors);
    check(`${reducedMotion}: approved body ink`,colors.help==='rgb(104, 100, 100)',colors);
    check(`${reducedMotion}: approved border`,colors.border==='rgb(205, 203, 203)',colors);
    check(`${reducedMotion}: narrow layout fits`,!colors.overflow,colors);
    await page.screenshot({path:join(out,`reminder-${reducedMotion}.png`),fullPage:true});
    await context.close();
  }
} finally { await browser.close(); }
const result={component,componentSha256:createHash('sha256').update(await readFile(component)).digest('hex'),
  boundary:'Chromium actual component/shared CSS/Reveal with a controlled editor; no service, Next.js, native or screen reader',
  passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length,checks};
await writeFile(join(out,'results.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:result.passed,failed:result.failed}));
process.exitCode=result.failed?1:0;
