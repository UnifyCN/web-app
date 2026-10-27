// Real-browser check of task steps on web (ticket #366) against a real local action
// service. Bundles the actual TaskStatePanel (with its steps section), the real
// useTaskProgress / useTaskActionStore hooks, client, store, real translations and
// the real Tailwind CSS, and drives them in headless Chromium by keyboard and mouse.
// Requests go to /api/companion/actions on this fixture server, which forwards them
// with the signed-in synthetic account's JWT to the real companion-actions edge
// function of the disposable local stack (as the Next.js proxy does with the cookie
// session). The same server answers the edge function's published-content read
// (/content), so it must listen on the port the stack's run.sh was started with.
//
// Proves, in a real browser with real persistence: steps added and checked by
// keyboard save once and read back; focus stays on the same checkbox through its
// save and the re-read; checking every step leaves the task Not started and offers
// completion; Keep after Remove sends nothing; Remove and its Undo work; explicit
// completion keeps the unfinished step; another account reads none of it; the 390px
// layout has no horizontal overflow; Arabic renders right to left; measured control
// sizes. Does not prove: the Next.js app shell, Safari/Firefox, screen readers,
// 200% zoom, native apps or a hosted stack.
//
// Usage (after `ACTIONS_KEEP=1 ./run.sh` in supabase/tests/companion-actions with
// the #366 migration applied and ACTIONS_* exported):
//   COMPANION_TASK_STEPS_PORT=<the stack's ACTIONS_CONTENT_PORT> node scripts/verify-companion-task-steps.mjs
//   COMPANION_TASK_STEPS_OUT=<json path> writes the results; PLAYWRIGHT_MODULE=<path> as in the
//   other verify scripts.
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.COMPANION_TASK_STEPS_PORT || 60675);
const origin = `http://127.0.0.1:${port}`;
const API = process.env.ACTIONS_API_URL ?? "";
const ANON = process.env.ACTIONS_ANON_KEY ?? "";
const SERVICE = process.env.ACTIONS_SERVICE_ROLE_KEY ?? "";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(API) || !ANON || !SERVICE) {
  console.error(
    "ACTIONS_API_URL (127.0.0.1 only), ACTIONS_ANON_KEY and ACTIONS_SERVICE_ROLE_KEY are required",
  );
  process.exit(2);
}
const esbuild = await import("esbuild");
const postcss = (await import("postcss")).default;
const tailwind = (await import("@tailwindcss/postcss")).default;
const en = JSON.parse(
  await readFile(join(root, "lib/i18n/locales/en/translation.json"), "utf8"),
);

// ------------------------------------------------------------------ accounts

async function http(path, { key = ANON, jwt, body, method = "POST" } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      apikey: key,
      authorization: `Bearer ${jwt ?? key}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}
async function account(label) {
  const email = `${label}-${Date.now()}@steps366.invalid`;
  const password = "steps-browser-1";
  const made = await http("/auth/v1/admin/users", {
    key: SERVICE,
    body: { email, password, email_confirm: true },
  });
  if (made.status !== 200) throw new Error(`createUser ${made.status}`);
  const token = await http("/auth/v1/token?grant_type=password", {
    body: { email, password },
  });
  if (token.status !== 200) throw new Error(`signIn ${token.status}`);
  return { id: made.json.id, jwt: token.json.access_token };
}
const read = async (who) =>
  (
    await http("/functions/v1/companion-actions", {
      jwt: who.jwt,
      body: {
        contract_version: 1,
        client: { platform: "web", app_version: "browser-check" },
        action: "read",
      },
    })
  ).json;

// ------------------------------------------------------------------ fixture

const ENTRY = String.raw`
import { createRoot } from "react-dom/client";
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import en from "@/lib/i18n/locales/en/translation.json";
import ar from "@/lib/i18n/locales/ar/translation.json";
import { motionCssVars } from "@/lib/motion";
import { TaskStatePanel } from "@/components/companion/tasks/TaskStatePanel";
import { useTaskActionStore, useTaskProgress } from "@/hooks/useTaskActions";

const lang = new URLSearchParams(location.search).get("lang") || "en";
document.documentElement.lang = lang;
document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
for (const [k, v] of Object.entries(motionCssVars)) document.documentElement.style.setProperty(k, v);
const i18n = createInstance();
i18n.use(initReactI18next).init({ lng: lang, resources: { en: { translation: en }, ar: { translation: ar } }, interpolation: { escapeValue: false }, initImmediate: false });
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Panel() {
  const view = useTaskProgress();
  const store = useTaskActionStore("checklist");
  return <TaskStatePanel title="Get a SIN" taskRef="sanity:sin" view={view} store={store} />;
}
createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={queryClient}><I18nextProvider i18n={i18n}>
    <main style={{ padding: 16, maxWidth: 480 }} className="bg-surface"><Panel /></main>
  </I18nextProvider></QueryClientProvider>,
);
`;

async function build() {
  const js = await esbuild.build({
    stdin: {
      contents: ENTRY,
      resolveDir: root,
      loader: "tsx",
      sourcefile: "steps-fixture.tsx",
    },
    bundle: true,
    plugins: [
      {
        name: "task-steps-fixture-adapters",
        setup(b) {
          b.onResolve(
            { filter: /^@\/(hooks\/useAuthUser|lib\/posthog)$/ },
            ({ path }) => ({ path, namespace: "steps-fixture" }),
          );
          b.onLoad(
            { filter: /.*/, namespace: "steps-fixture" },
            ({ path }) => ({
              // The signed-in account is the one the fixture server holds the session of.
              contents: path.endsWith("useAuthUser")
                ? 'export const AUTH_USER_KEY = ["auth-user"]; export const useAuthUser = () => ({data:{id:window.__accountId},isPending:false});'
                : "export const isPostHogConfigured = () => false; export const posthog = {capture(){}};",
              loader: "js",
            }),
          );
        },
      },
    ],
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
  const css = await postcss([tailwind({ base: root })]).process(
    await readFile(cssFrom, "utf8"),
    { from: cssFrom },
  );
  return { js: js.outputFiles[0].text, css: css.css };
}

// ------------------------------------------------------------------ server

let session = null; // { id, jwt } of the signed-in synthetic account
const writes = [];
async function serve(js, css) {
  const html = (id) =>
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><script>window.__accountId=${JSON.stringify(id)}</script></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, origin);
    if (url.pathname === "/content") {
      // The published-content read of the edge function: one Checklist document exists.
      let id = null;
      try {
        id = JSON.parse(url.searchParams.get("$id") ?? "null");
      } catch {
        id = null;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ result: id === "sin" ? "sin" : null }));
      return;
    }
    if (url.pathname === "/api/companion/actions" && req.method === "POST") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks).toString("utf8");
      if (!session) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end('{"error":"unauthorized"}');
        return;
      }
      const parsed = JSON.parse(body);
      if (parsed.action === "apply" || parsed.action === "undo")
        writes.push(parsed);
      const upstream = await fetch(`${API}/functions/v1/companion-actions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: ANON,
          authorization: `Bearer ${session.jwt}`,
        },
        body,
      });
      res.writeHead(upstream.status, { "content-type": "application/json" });
      res.end(await upstream.text());
      return;
    }
    const [type, out] =
      url.pathname === "/app.js"
        ? ["text/javascript", js]
        : url.pathname === "/app.css"
          ? ["text/css", css]
          : ["text/html", html(session?.id ?? null)];
    res.writeHead(200, { "content-type": `${type}; charset=utf-8` });
    res.end(out);
  });
  await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
  return server;
}

// ------------------------------------------------------------------ checks

const results = [];
const check = (name, ok, detail) =>
  results.push({ name, ok: Boolean(ok), detail });
const STEPS = [
  "Review the official requirements",
  "Prepare the required documents",
  "Submit the application yourself",
];
const steps = (r) =>
  (r.steps ?? [])
    .filter((s) => s.task_ref === "sanity:sin")
    .map((s) => [s.title, s.done]);
const sin = (r) =>
  r.tasks.find((t) => t.task_ref === "sanity:sin") ?? { state: "not_started" };

async function open(page, lang = "en") {
  await page.goto(`${origin}/?lang=${lang}`);
  await page.waitForSelector('input[type="text"]');
  // Controls turn on after the panel's own fresh read.
  await page.waitForFunction(() => {
    const radio = document.querySelector('[role="radio"]');
    return radio && radio.getAttribute("aria-disabled") === "false";
  });
}
const checkbox = (page, name) => page.getByRole("checkbox", { name });

async function addByKeyboard(page, title) {
  const input = page.getByRole("textbox", { name: en.taskSteps.newStepLabel });
  await input.focus();
  await page.keyboard.type(title);
  await page.keyboard.press("Enter");
  await checkbox(page, title).waitFor();
}

async function run(browser) {
  const owner = await account("steps-browser-owner");
  const stranger = await account("steps-browser-stranger");
  session = owner;
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await open(page);

  for (const title of STEPS) await addByKeyboard(page, title);
  const afterAdd = await read(owner);
  check(
    "keyboard: three steps added once each and read back",
    JSON.stringify(steps(afterAdd)) ===
      JSON.stringify(STEPS.map((t) => [t, false])),
    steps(afterAdd),
  );
  check(
    "typed step field is empty after its save",
    (await page
      .getByRole("textbox", { name: en.taskSteps.newStepLabel })
      .inputValue()) === "",
    null,
  );

  // Focus: mark the checkbox element, toggle it by Space, wait for its save and re-read.
  for (const title of STEPS) {
    const box = checkbox(page, title);
    await page.waitForFunction((name) => {
      const el = [...document.querySelectorAll('input[type="checkbox"]')].find(
        (i) => i.labels?.[0]?.textContent.trim() === name,
      );
      return el && el.getAttribute("aria-disabled") === "false";
    }, title);
    await box.focus();
    await page.evaluate(() => {
      document.activeElement.__mark = "same-control";
    });
    await page.keyboard.press("Space");
    await page
      .getByText(en.taskSteps.receiptChecked.replace("{{title}}", title))
      .waitFor();
    await page.waitForFunction(() => document.activeElement?.checked === true);
    const focus = await page.evaluate(() => ({
      same: document.activeElement?.__mark === "same-control",
      checked: document.activeElement?.checked,
    }));
    check(
      `focus stays on the same checkbox after saving "${title}"`,
      focus.same && focus.checked,
      focus,
    );
  }
  await page
    .getByText(
      en.taskSteps.allDone.replace(
        "{{state}}",
        en.taskActions.state.not_started,
      ),
    )
    .waitFor();
  const allDone = await read(owner);
  check(
    "checking every step leaves the task Not started",
    sin(allDone).state === "not_started",
    sin(allDone),
  );
  check(
    "an explicit completion is offered",
    await page
      .getByRole("button", { name: en.taskSteps.markComplete })
      .isVisible(),
    null,
  );

  // Removal by keyboard: Keep sends nothing; Remove and Undo go through the service.
  const before = writes.length;
  await page
    .getByRole("button", {
      name: en.taskSteps.removeA11y.replace("{{title}}", STEPS[0]),
    })
    .focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: en.taskSteps.keep }).focus();
  await page.keyboard.press("Enter");
  check("Keep after Remove sends nothing", writes.length === before, {
    before,
    after: writes.length,
  });
  await page
    .getByRole("button", {
      name: en.taskSteps.removeA11y.replace("{{title}}", STEPS[0]),
    })
    .click();
  await page
    .getByRole("button", { name: en.taskSteps.remove, exact: true })
    .click();
  await page
    .getByText(en.taskSteps.receiptRemoved.replace("{{title}}", STEPS[0]))
    .waitFor();
  await checkbox(page, STEPS[0]).waitFor({ state: "detached" });
  const removed = await read(owner);
  check(
    "a confirmed removal removes exactly that step",
    JSON.stringify(steps(removed).map((s) => s[0])) ===
      JSON.stringify(STEPS.slice(1)),
    steps(removed),
  );
  // Each Undo names its own change, so this one is told apart from the step receipts.
  const undoName = en.taskSteps.undoA11y.replace(
    "{{change}}",
    en.taskSteps.receiptRemoved.replace("{{title}}", STEPS[0]),
  );
  const undo = page.getByRole("button", { name: undoName, exact: true });
  check(
    "each step Undo has its own accessible name",
    (await undo.count()) === 1,
    await undo.count(),
  );
  await page.waitForFunction(
    (label) =>
      document
        .querySelector(`button[aria-label="${label}"]`)
        ?.getAttribute("aria-disabled") !== "true",
    undoName,
  );
  await undo.click();
  await checkbox(page, STEPS[0]).waitFor();
  const restored = await read(owner);
  check(
    "Undo of the removal restores the step",
    steps(restored).length === 3,
    steps(restored),
  );

  // Completion with an unfinished step.
  await page.waitForFunction((name) => {
    const el = [...document.querySelectorAll('input[type="checkbox"]')].find(
      (i) => i.labels?.[0]?.textContent.trim() === name,
    );
    return el && el.getAttribute("aria-disabled") === "false";
  }, STEPS[2]);
  await checkbox(page, STEPS[2]).click();
  await page.waitForFunction((name) => {
    const el = [...document.querySelectorAll('input[type="checkbox"]')].find(
      (i) => i.labels?.[0]?.textContent.trim() === name,
    );
    return el && !el.checked && el.getAttribute("aria-disabled") === "false";
  }, STEPS[2]);
  await page.waitForFunction(
    () =>
      document
        .querySelector('[role="radio"]')
        ?.getAttribute("aria-disabled") === "false",
  );
  await page
    .getByRole("radio", { name: en.taskActions.state.completed })
    .click();
  await page
    .getByText(
      en.taskSteps.completedSummary
        .replace("{{done}}", "2")
        .replace("{{total}}", "3"),
    )
    .waitFor();
  const done = await read(owner);
  check(
    "completion keeps the unfinished step unfinished",
    sin(done).state === "completed" &&
      JSON.stringify(
        steps(done)
          .map((s) => s[1])
          .sort(),
      ) === JSON.stringify([false, true, true]),
    { state: sin(done).state, steps: steps(done) },
  );
  const other = await read(stranger);
  check(
    "another account reads none of these steps",
    Array.isArray(other.steps) && other.steps.length === 0,
    other.steps,
  );

  // Layout at 390px.
  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    rows: [...document.querySelectorAll('input[type="checkbox"]')].map((i) =>
      Math.round(i.closest("label").getBoundingClientRect().height),
    ),
  }));
  check("390px: no horizontal overflow", layout.overflow <= 0, layout);
  check(
    "390px: each step row is at least 44px tall",
    layout.rows.every((h) => h >= 44),
    layout.rows,
  );
  await context.close();

  // Reopen the task to measure the edit and remove controls, then Arabic RTL.
  session = owner;
  const ctx2 = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const p2 = await ctx2.newPage();
  await open(p2);
  await p2.waitForFunction(
    () =>
      document
        .querySelector('[role="radio"]')
        ?.getAttribute("aria-disabled") === "false",
  );
  await p2
    .getByRole("radio", { name: en.taskActions.state.not_started })
    .click();
  await p2
    .getByRole("button", {
      name: en.taskSteps.removeA11y.replace("{{title}}", STEPS[1]),
    })
    .waitFor();
  const sizes = await p2.evaluate(() =>
    [...document.querySelectorAll("button[aria-label]")]
      .filter((b) => /step/i.test(b.getAttribute("aria-label")))
      .map((b) => {
        const r = b.getBoundingClientRect();
        return {
          label: b.getAttribute("aria-label"),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      }),
  );
  check(
    "edit and remove controls are at least 44x44",
    sizes.length > 0 && sizes.every((s) => s.w >= 44 && s.h >= 44),
    sizes,
  );
  await ctx2.close();

  const ctx3 = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const p3 = await ctx3.newPage();
  await open(p3, "ar");
  const ar = JSON.parse(
    await readFile(join(root, "lib/i18n/locales/ar/translation.json"), "utf8"),
  );
  await p3.getByText(ar.taskSteps.title, { exact: true }).waitFor();
  const rtl = await p3.evaluate(() => ({
    dir: document.documentElement.dir,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    inputDir: getComputedStyle(document.querySelector('input[type="text"]'))
      .direction,
  }));
  check(
    "Arabic: right to left, Arabic step copy, no overflow",
    rtl.dir === "rtl" && rtl.inputDir === "rtl" && rtl.overflow <= 0,
    rtl,
  );
  await ctx3.close();
}

// ------------------------------------------------------------------ main

const { js, css } = await build();
const server = await serve(js, css);
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  await run(browser);
} catch (error) {
  errors.push(String(error?.stack ?? error));
} finally {
  await browser.close();
  server.close();
}
for (const r of results)
  console.log(
    `${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : `  ${JSON.stringify(r.detail)}`}`,
  );
for (const e of errors) console.log(`ERROR (not an assertion)  ${e}`);
const failed = results.filter((r) => !r.ok).length;
console.log(
  `\n${results.length - failed} passed, ${failed} failed, ${errors.length} errors`,
);
if (process.env.COMPANION_TASK_STEPS_OUT) {
  await writeFile(
    process.env.COMPANION_TASK_STEPS_OUT,
    JSON.stringify({ results, errors }, null, 2),
  );
}
process.exit(failed || errors.length ? 1 : 0);
