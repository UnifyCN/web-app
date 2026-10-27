// Real-browser check that the Companion task cards and draft panel (ticket #363) wait 300ms before
// they show a transient loading message (design-system/MASTER.md: "Loading states
// wait 300ms before they show"), and that results and errors show at once.
//
// Bundles the actual TaskActionCards, TaskProposalPanel, TaskActionStore and the
// useTaskActionPhase hook, the real English translations, the real Tailwind CSS
// (app/globals.css) and the motion config, and measures computed styles in
// headless Chromium. The action client is an in-page stand-in whose replies the
// script releases, so each state is held while it is measured. A plain
// `loading-delayed` paragraph started in the same frame is the positive control:
// if it is visible at once, the CSS did not load and no result counts.
//
// Proves, in a real browser: a command card that is adding its task and a draft
// card's status line while its approval is saving are invisible at first, carry
// the shared `loading-appear` delay and then appear; their text and status role
// are in the page from the start; Saving and Checking each restart the delay in
// the draft panel; the saved result and a refusal show at once.
// Does not prove: the Next.js app, real requests, Safari/Firefox, screen-reader
// timing or native apps.
//
// Usage: node scripts/verify-companion-task-loading.mjs
//   COMPANION_TASK_LOADING_PORT (default 3049), COMPANION_TASK_LOADING_OUT=<json path>,
//   COMPANION_TASK_LOADING_SERVE=1 to keep the fixture served for a manual browser,
//   PLAYWRIGHT_MODULE=<path> when playwright is not installed locally.
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.COMPANION_TASK_LOADING_PORT || 3049);
const origin = `http://127.0.0.1:${port}`;
const esbuild = await import("esbuild");
const postcss = (await import("postcss")).default;
const tailwind = (await import("@tailwindcss/postcss")).default;

const en = JSON.parse(await readFile(join(root, "lib/i18n/locales/en/translation.json"), "utf8"));
const TITLE = "Set up phone service";
const T = {
  adding: en.taskCreate.commandAdding.replace("{{title}}", TITLE),
  checking: en.taskActions.checking,
  saving: en.taskActions.saving,
  added: en.taskCreate.added.replace("{{title}}", TITLE),
  refused: en.taskActions.refused,
};

// ------------------------------------------------------------------ fixture

const ENTRY = String.raw`
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { MotionConfig } from "framer-motion";
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import en from "@/lib/i18n/locales/en/translation.json";
import { motionCssVars } from "@/lib/motion";
import { TaskActionCards } from "@/components/companion/tasks/TaskActionCards";
import { TaskProposalPanel } from "@/components/companion/tasks/TaskProposalPanel";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { taskProposalKey } from "@/lib/companionActions/queryKeys";
import { TaskActionStore } from "@/lib/companionActions/taskActionStore";
import { parseTaskProposal } from "@/lib/companionActions/contract";

const TITLE = ${JSON.stringify(TITLE)};
const op = { type: "task.create_custom", title: TITLE, priority: "Do soon" };
const receipt = {
  kind: "change", operationType: "task.create_custom", title: TITLE, taskRef: "custom:500",
  operationId: "11111111-1111-4111-8111-111111111111", createdAt: "2026-10-26T10:00:00Z",
  undoOf: null, beforeState: "not_started", afterState: "not_started", afterRevision: 1,
  undoneBy: null, current: true, undoable: true,
};
// The action client: each apply is held until the script releases it.
const held = [];
const client = {
  apply: () => new Promise((resolve) => held.push(resolve)),
  status: () => new Promise((resolve) => held.push(resolve)),
};
const store = new TaskActionStore({ client, newOperationId: () => crypto.randomUUID(), onChanged: () => {} });
const rawProposal = {
  proposal_id: "7e1f1f6c-2222-4222-8222-000000000001", proposal_revision: 1, status: "draft",
  operations: [op], context: null, source: { conversation_id: "c1", message_id: 101 },
};
const proposal = parseTaskProposal(rawProposal);
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
queryClient.setQueryData(taskProposalKey("fixture-owner", proposal.proposalId), proposal);
window.fetch = async (url, options) => {
  const body = JSON.parse(options.body);
  if (url !== "/api/companion/actions" || body.action !== "proposal") throw new Error("Unexpected external request: " + url);
  return new Response(JSON.stringify({ proposal: rawProposal }), {status: 200});
};
const messages = [
  { id: 100, role: "user", content: "Add task: " + TITLE },
  { id: 101, role: "assistant", content: "Answer." },
  { id: 102, role: "user", content: "Add task: " + TITLE },
];

for (const [k, v] of Object.entries(motionCssVars)) document.documentElement.style.setProperty(k, v);
const i18n = createInstance();
i18n.use(initReactI18next).init({ lng: "en", resources: { en: { translation: en } }, interpolation: { escapeValue: false }, initImmediate: false });

function App() {
  const [control, setControl] = useState(0);
  window.fixture = {
    // The positive control and both loading states start in one commit.
    start: () => flushSync(() => {
      setControl(1);
      void store.applyOperation("command:100", op, { kind: "direct_command", message_id: 100 });
      document.querySelector('#panel button[aria-label]').click();
    }),
    check: async () => {
      flushSync(() => setControl(2));
      held.splice(0).forEach((resolve) => resolve({ kind: "unknown" }));
      await new Promise((r) => setTimeout(r, 0));
    },
    // The first two writes save; a third is refused at once.
    finish: async () => {
      held.splice(0).forEach((resolve) => resolve({ kind: "applied", replayed: false, receipt }));
      await new Promise((r) => setTimeout(r, 0));
    },
    refuse: async () => {
      void store.applyOperation("command:102", op, { kind: "direct_command", message_id: 102 });
      held.splice(0).forEach((resolve) => resolve({ kind: "refused", status: 403, error: "forbidden" }));
      await new Promise((r) => setTimeout(r, 0));
    },
  };
  return (
    <QueryClientProvider client={queryClient}><I18nextProvider i18n={i18n}>
      <MotionConfig reducedMotion="user">
        <div style={{ padding: 24, maxWidth: 480 }}>
          {messages.map((m) => (
            <div key={m.id} data-message={m.id}>
              <TaskActionCards message={m} proposals={[proposal]} commands={[]} store={store}
                canWrite onReview={() => {}} onViewTask={() => {}} />
            </div>
          ))}
          <div id="panel"><TaskProposalPanel proposalId={proposal.proposalId} store={store}
            view={{ status: "ready", byRef: new Map(), stale: false, canWrite: true, refetch: () => {} }} /></div>
          {control > 0 && <p key={control} id="control" className="loading-delayed text-sm">Loading control</p>}
        </div>
      </MotionConfig>
    </I18nextProvider></QueryClientProvider>
  );
}
createRoot(document.getElementById("root")).render(<App />);
`;

async function build() {
  const js = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: root, loader: "tsx", sourcefile: "fixture.tsx" },
    bundle: true,
    plugins: [{
      name: "task-loading-fixture-adapters",
      setup(build) {
        build.onResolve({ filter: /^@\/(hooks\/useAuthUser|lib\/posthog)$/ }, ({ path }) => ({ path, namespace: "task-loading-fixture" }));
        build.onLoad({ filter: /.*/, namespace: "task-loading-fixture" }, ({ path }) => ({
          contents: path.endsWith("useAuthUser")
            ? 'export const AUTH_USER_KEY = ["auth-user"]; export const useAuthUser = () => ({data:{id:"fixture-owner"},isPending:false});'
            : 'export const isPostHogConfigured = () => false; export const posthog = {capture(){}};',
          loader: "js",
        }));
      },
    }],
    write: false,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    loader: { ".json": "json" },
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.NEXT_PUBLIC_SUPABASE_URL": '"https://fixture.invalid"',
      "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": '"fixture-public-key"',
      "process.env": "{}",
    },
    logLevel: "error",
  });
  const cssFrom = join(root, "app/globals.css");
  const css = await postcss([tailwind({ base: root })]).process(await readFile(cssFrom, "utf8"), { from: cssFrom });
  return { js: js.outputFiles[0].text, css: css.css };
}

// ------------------------------------------------------------------ checks

// In the page: the element whose own text is `text`, its opacity as shown (its own
// times every ancestor's), its animation, and whether a status role announces it.
const MEASURE = String.raw`(texts) => texts.map((text) => {
  const el = [...document.querySelectorAll("p")].find((p) => p.textContent.trim() === text);
  if (!el) return { text, present: false };
  let opacity = 1;
  let animated = null;
  for (let n = el; n; n = n.parentElement) {
    const s = getComputedStyle(n);
    opacity *= Number(s.opacity);
    if (!animated && s.animationName !== "none") animated = { name: s.animationName, delay: s.animationDelay };
  }
  return { text, present: true, opacity, animated, status: Boolean(el.closest('[role="status"]')) };
})`;

const measure = (page, texts, start = false) =>
  page.evaluate(([fn, list, first]) => {
    if (first) window.fixture.start();
    return new Function(`return ${fn}`)()(list);
  }, [MEASURE, texts, start]);

const results = [];
const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });
const delayed = (m) => m.present && m.opacity === 0 && m.animated?.name === "loading-appear" && m.animated.delay === "0.3s";

async function run(browser, reducedMotion) {
  const label = reducedMotion;
  const context = await browser.newContext({viewport:{width:390,height:844},reducedMotion});
  const page = await context.newPage();
  await page.goto(origin);
  await page.waitForFunction(() => Boolean(window.fixture) && document.querySelector('#panel button[aria-label]'));
  const panelMeasure = async (text, start = false, checking = false) => page.evaluate(async ({text,start,checking}) => {
    if (start) window.fixture.start();
    if (checking) await window.fixture.check();
    const measure = (el) => {
      if (!el) return {present:false};
      let opacity=1, animated=null;
      for(let n=el;n;n=n.parentElement) { const c=getComputedStyle(n); opacity*=Number(c.opacity); if(!animated && c.animationName!=="none") animated={name:c.animationName,delay:c.animationDelay}; }
      return {present:true,text:el.textContent,opacity,animated,status:Boolean(el.closest('[role="status"]'))};
    };
    const p=[...document.querySelectorAll('#panel p')].find(p=>p.textContent.trim()===text);
    return {panel:measure(p),control:measure(document.querySelector('#control')),visibility:document.visibilityState};
  },{text,start,checking});
  const first = await panelMeasure(en.taskActions.saving,true);
  check(label+": simultaneous shared control hidden",delayed(first.control),first);
  check(label+": panel saving waits 300ms",delayed(first.panel),first);
  check(label+": panel saving has status role immediately",first.panel.present && first.panel.status,first);
  const [adding, cardChecking, draftTitle] = await measure(page,[T.adding,T.checking,TITLE]);
  check(label+": command card remains delayed",delayed(adding),adding);
  check(label+": command card status exists immediately",adding.present && adding.status,adding);
  check(label+": draft card remains delayed",delayed(cardChecking),cardChecking);
  check(label+": draft title is immediate",draftTitle.present && draftTitle.opacity===1,draftTitle);
  await page.waitForTimeout(700);
  const later = await panelMeasure(en.taskActions.saving);
  check(label+": positive control becomes visible",later.control.opacity===1,later);
  check(label+": panel saving becomes visible",later.panel.present && later.panel.opacity===1,later);
  const visibleCards = await measure(page,[T.adding,T.checking]);
  check(label+": cards become visible",visibleCards.every(m=>m.present && m.opacity===1),visibleCards);
  const checking = await panelMeasure(T.checking,false,true);
  check(label+": lookup control starts hidden",delayed(checking.control),checking);
  check(label+": panel checking waits 300ms",delayed(checking.panel),checking);
  check(label+": panel checking has status role immediately",checking.panel.present && checking.panel.status,checking);
  await page.waitForTimeout(700);
  const afterCheckDelay = await panelMeasure(T.checking);
  check(label+": lookup control becomes visible",afterCheckDelay.control.opacity===1,afterCheckDelay);
  check(label+": panel checking becomes visible",afterCheckDelay.panel.present && afterCheckDelay.panel.opacity===1,afterCheckDelay);
  await page.evaluate(()=>window.fixture.finish());
  const saved = await panelMeasure(T.added);
  check(label+": panel saved receipt immediate",saved.panel.present && saved.panel.opacity===1 && !saved.panel.animated,saved);
  await page.evaluate(()=>window.fixture.refuse());
  const [refused] = await measure(page,[T.refused]);
  check(label+": refusal immediate",refused.present && refused.opacity===1 && !refused.animated,refused);
  await context.close();
}

// ------------------------------------------------------------------ main

const { js, css } = await build();
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;
const server = createServer((req, res) => {
  const path = new URL(req.url, origin).pathname;
  const [type, body] =
    path === "/app.js" ? ["text/javascript", js] : path === "/app.css" ? ["text/css", css] : ["text/html", html];
  res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
  res.end(body);
});
await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
if (process.env.COMPANION_TASK_LOADING_SERVE === "1") {
  console.log(`fixture served at ${origin} (Ctrl-C to stop)`);
} else {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    await run(browser, "no-preference");
    await run(browser, "reduce");
  } catch (error) {
    errors.push(String(error?.stack ?? error));
  } finally {
    await browser.close();
    server.close();
  }
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : `  ${JSON.stringify(r.detail)}`}`);
  for (const e of errors) console.log(`ERROR (not an assertion)  ${e}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed, ${errors.length} errors`);
  if (process.env.COMPANION_TASK_LOADING_OUT) {
    await writeFile(process.env.COMPANION_TASK_LOADING_OUT, JSON.stringify({ results, errors }, null, 2));
  }
  process.exit(failed || errors.length ? 1 : 0);
}
