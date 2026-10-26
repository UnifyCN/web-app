// Real-browser check that the Companion task cards (ticket #363) wait 300ms before
// they show a transient loading message (design-system/MASTER.md: "Loading states
// wait 300ms before they show"), and that results and errors show at once.
//
// Bundles the actual TaskActionCards, the actual TaskActionStore and the
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
// are in the page from the start; the saved result and a refusal show at once.
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
  status: () => new Promise(() => {}),
};
const store = new TaskActionStore({ client, newOperationId: () => crypto.randomUUID(), onChanged: () => {} });
const proposal = parseTaskProposal({
  proposal_id: "7e1f1f6c-2222-4222-8222-000000000001", proposal_revision: 1, status: "draft",
  operations: [op], context: null, source: { conversation_id: "c1", message_id: 101 },
});
const messages = [
  { id: 100, role: "user", content: "Add task: " + TITLE },
  { id: 101, role: "assistant", content: "Answer." },
  { id: 102, role: "user", content: "Add task: " + TITLE },
];

for (const [k, v] of Object.entries(motionCssVars)) document.documentElement.style.setProperty(k, v);
const i18n = createInstance();
i18n.use(initReactI18next).init({ lng: "en", resources: { en: { translation: en } }, interpolation: { escapeValue: false }, initImmediate: false });

function App() {
  const [control, setControl] = useState(false);
  window.fixture = {
    // The positive control and both loading states start in one commit.
    start: () => flushSync(() => {
      setControl(true);
      void store.applyOperation("command:100", op, { kind: "direct_command", message_id: 100 });
      void store.applyOperation("proposal:" + proposal.proposalId, op, {
        kind: "approved_proposal", proposal_id: proposal.proposalId, proposal_revision: 1,
      });
    }),
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
    <I18nextProvider i18n={i18n}>
      <MotionConfig reducedMotion="user">
        <div style={{ padding: 24, maxWidth: 480 }}>
          {messages.map((m) => (
            <div key={m.id} data-message={m.id}>
              <TaskActionCards message={m} proposals={[proposal]} commands={[]} store={store}
                canWrite onReview={() => {}} onViewTask={() => {}} />
            </div>
          ))}
          {control && <p id="control" className="loading-delayed text-sm">Loading control</p>}
        </div>
      </MotionConfig>
    </I18nextProvider>
  );
}
createRoot(document.getElementById("root")).render(<App />);
`;

async function build() {
  const js = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: root, loader: "tsx", sourcefile: "fixture.tsx" },
    bundle: true,
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
  const label = reducedMotion === "reduce" ? " (reduced motion)" : "";
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  await page.goto(origin);
  await page.waitForFunction(() => Boolean(window.fixture));

  // Start and measure in the same task, before any frame could reveal them.
  const [control, adding, checking, draftTitle] = await measure(
    page, ["Loading control", T.adding, T.checking, TITLE], true,
  );
  check(`control${label}: a shared loading-delayed line is hidden at first (the CSS is live)`, delayed(control), control);
  check(`command card${label}: "adding" waits for the shared delay`, delayed(adding), adding);
  check(`command card${label}: "adding" is in a status region from the start`, adding.present && adding.status, adding);
  check(`draft card${label}: its "checking" status waits for the shared delay`, delayed(checking), checking);
  check(`draft card${label}: the draft's own title shows at once`, draftTitle.present && draftTitle.opacity === 1, draftTitle);

  await page.waitForTimeout(700);
  const later = await measure(page, ["Loading control", T.adding, T.checking]);
  check(`after the delay${label}: the control and both loading lines show`, later.every((m) => m.present && m.opacity === 1), later);

  await page.evaluate(() => window.fixture.finish());
  const [added] = await measure(page, [T.added]);
  check(`result${label}: the saved receipt shows at once, not delayed`, added.present && added.opacity === 1 && !added.animated, added);

  await page.evaluate(() => window.fixture.refuse());
  const [refused] = await measure(page, [T.refused]);
  check(`error${label}: a refusal shows at once, not delayed`, refused.present && refused.opacity === 1 && !refused.animated, refused);
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
