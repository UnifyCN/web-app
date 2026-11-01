// Real-browser check of task removal on web (ticket #367) against a real local action
// service. Bundles the actual TaskStatePanel (with its removal section), the real
// useTaskProgress / useTaskActionStore hooks, client, store, real translations and the
// real Tailwind CSS, and drives them in headless Chromium by keyboard. Requests go to
// /api/companion/actions on this fixture server, which forwards them with the signed-in
// synthetic account's JWT to the real companion-actions edge function of the disposable
// local stack (as the Next.js proxy does with the cookie session). The same server
// answers the edge function's published-content read (/content), so it must listen on
// the port the stack's run.sh was started with.
//
// Proves, in a real browser with real persistence: "Remove task" opens a review by
// keyboard and focus moves to its heading; Cancel sends nothing and returns focus to
// "Remove task"; the confirmation removes once and focus stays in the panel; the Undo
// of that receipt restores; another account reads none of it; the 390px layout has no
// horizontal overflow and the controls are at least 44px tall; Arabic renders the
// review right to left. The panel is inside the real overlay drawer. Does not prove: the
// Next.js app shell, Safari/Firefox, screen readers, 200% zoom, native apps or a hosted stack.
//
// Usage (after `ACTIONS_KEEP=1 ./run.sh` in supabase/tests/companion-actions with the
// #361-#367 migrations applied and ACTIONS_* exported):
//   COMPANION_TASK_REMOVE_PORT=<the stack's ACTIONS_CONTENT_PORT> node scripts/verify-companion-task-remove.mjs
//   COMPANION_TASK_REMOVE_OUT=<json path> writes the results; PLAYWRIGHT_MODULE=<path> as in the
//   other verify scripts.
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.COMPANION_TASK_REMOVE_PORT || 60675);
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
  const email = `${label}-${Date.now()}@remove367.invalid`;
  const password = "remove-browser-1";
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
import { TaskDrawer } from "@/components/companion/tasks/TaskDrawer";
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
    <main><TaskDrawer open title="Task progress" onClose={() => {}}><Panel /></TaskDrawer></main>
  </I18nextProvider></QueryClientProvider>,
);
`;

async function build() {
  const js = await esbuild.build({
    stdin: {
      contents: ENTRY,
      resolveDir: root,
      loader: "tsx",
      sourcefile: "remove-fixture.tsx",
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
const sin = (r) =>
  r.tasks.find((t) => t.task_ref === "sanity:sin") ?? { removed: false };
const fill = (s, vars) =>
  Object.entries(vars).reduce((out, [k, v]) => out.replace(`{{${k}}}`, v), s);
const TITLE = "Get a SIN";

async function open(page, lang = "en") {
  await page.goto(`${origin}/?lang=${lang}`);
  // Controls turn on after the panel's own fresh read.
  await page.waitForFunction(() => {
    const radio = document.querySelector('[role="radio"]');
    return radio && radio.getAttribute("aria-disabled") === "false";
  });
}
const focusText = (page) =>
  page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    text: document.activeElement?.textContent?.trim(),
    label: document.activeElement?.getAttribute("aria-label"),
  }));

async function run(browser) {
  const owner = await account("remove-browser-owner");
  const stranger = await account("remove-browser-stranger");
  session = owner;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await open(page);

  const removeName = fill(en.taskRemove.removeTaskA11y, { title: TITLE });
  const heading = fill(en.taskRemove.reviewTitle, { title: TITLE });
  const remove = page.getByRole("button", { name: removeName });
  await page.waitForFunction(
    (name) => [...document.querySelectorAll("button")].some((b) => b.getAttribute("aria-label") === name && b.getAttribute("aria-disabled") === "false"),
    removeName,
  );
  await remove.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: heading }).waitFor();
  await page.waitForFunction((h) => document.activeElement?.textContent?.trim() === h, heading);
  check("keyboard: Remove task opens the review and focus moves to its heading", true, await focusText(page));
  check("opening the review sends no write", writes.length === 0, writes);

  await page.getByRole("button", { name: en.taskRemove.cancel, exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction((name) => document.activeElement?.getAttribute("aria-label") === name, removeName);
  check("Cancel sends nothing and returns focus to Remove task", writes.length === 0 && !sin(await read(owner)).removed, await focusText(page));

  await remove.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: heading }).waitFor();
  const confirm = page.getByRole("button", { name: en.taskRemove.confirm, exact: true });
  await confirm.focus();
  await page.keyboard.press("Enter");
  const removedText = fill(en.taskRemove.receiptRemoved, { title: TITLE });
  await page.getByText(removedText).waitFor();
  const afterRemove = await read(owner);
  const focusAfter = await page.evaluate(() => document.activeElement !== document.body && Boolean(document.querySelector('[role="dialog"]')?.contains(document.activeElement)));
  check("the confirmation removes once and reads back removed", writes.length === 1 && sin(afterRemove).removed === true, { writes: writes.length, task: sin(afterRemove) });
  check("focus stays inside the drawer after the removal", focusAfter, await focusText(page));

  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    undo: Math.round([...document.querySelectorAll("button")].find((b) => /^Undo/.test(b.getAttribute("aria-label") ?? ""))?.getBoundingClientRect().height ?? 0),
  }));
  check("390px: no horizontal overflow after removal; Undo at least 44px tall", layout.overflow <= 0 && layout.undo >= 44, layout);

  const undoName = fill(en.taskRemove.undoRemovalA11y, { change: removedText });
  await page.waitForFunction(
    (name) => [...document.querySelectorAll("button")].some((b) => b.getAttribute("aria-label") === name && b.getAttribute("aria-disabled") === "false"),
    undoName,
  );
  await page.getByRole("button", { name: undoName }).focus();
  await page.keyboard.press("Enter");
  await page.getByText(fill(en.taskRemove.receiptRestored, { title: TITLE })).waitFor();
  check("keyboard: the Undo of the removal receipt restores the task", !sin(await read(owner)).removed && writes.length === 2, writes.map((w) => w.action));
  const other = await read(stranger);
  check("another account reads none of it", other.tasks.every((t) => t.task_ref !== "sanity:sin" || !t.removed) && (other.tasks.find((t) => t.task_ref === "sanity:sin")?.revision ?? 0) === 0, other.tasks);

  const sizes = await page.evaluate((name) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.getAttribute("aria-label") === name);
    const r = b?.getBoundingClientRect();
    return r ? { w: Math.round(r.width), h: Math.round(r.height) } : null;
  }, removeName);
  check("Remove task is at least 44px tall", sizes && sizes.h >= 44, sizes);
  await remove.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: heading }).waitFor();
  const reviewSizes = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="task-removal-review"] button')].map((b) => Math.round(b.getBoundingClientRect().height)),
  );
  check("review buttons are at least 44px tall", reviewSizes.length === 2 && reviewSizes.every((h) => h >= 44), reviewSizes);
  await context.close();

  // Arabic: the review renders right to left without overflow.
  const ar = JSON.parse(await readFile(join(root, "lib/i18n/locales/ar/translation.json"), "utf8"));
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await ctx2.newPage();
  await open(p2, "ar");
  const arRemove = fill(ar.taskRemove.removeTaskA11y, { title: TITLE });
  await p2.waitForFunction(
    (name) => [...document.querySelectorAll("button")].some((b) => b.getAttribute("aria-label") === name && b.getAttribute("aria-disabled") === "false"),
    arRemove,
  );
  await p2.getByRole("button", { name: arRemove }).focus();
  await p2.keyboard.press("Enter");
  await p2.getByRole("heading", { name: fill(ar.taskRemove.reviewTitle, { title: TITLE }) }).waitFor();
  const rtl = await p2.evaluate(() => ({
    dir: document.documentElement.dir,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    reviewDir: getComputedStyle(document.querySelector('[data-testid="task-removal-review"]')).direction,
  }));
  check("Arabic: the review is right to left with Arabic copy and no overflow", rtl.dir === "rtl" && rtl.reviewDir === "rtl" && rtl.overflow <= 0, rtl);
  check("Arabic: opening the review sends no write", writes.length === 2, writes.length);
  await ctx2.close();
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
if (process.env.COMPANION_TASK_REMOVE_OUT) {
  await writeFile(
    process.env.COMPANION_TASK_REMOVE_OUT,
    JSON.stringify({ results, errors }, null, 2),
  );
}
process.exit(failed || errors.length ? 1 : 0);
