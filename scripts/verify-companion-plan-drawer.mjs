// Real-browser check of the settlement plan review in the direction B drawer (ticket #364):
// the actual TaskDrawer and PlanPanel with the real Arabic and English translations, the
// real Tailwind CSS (app/globals.css), the real plan client, store and hooks. The action
// service is an in-page stand-in for /api/companion/actions whose plan draft carries a long
// goal and title; a revise reply is held until the script releases it.
//
// Proves, in headless Chromium: at 390px (narrow) and at 640px (1280px at 200% zoom) the
// drawer takes the full width with no horizontal overflow; at 1280px it opens at the inline
// end (right in English, left in Arabic RTL); every control in the drawer is at least 44px
// tall (the web controls rule used by the task drawer); Tab stays inside the drawer; a
// Space on the "Add" checkbox sends one draft edit, keeps focus on that checkbox while the
// edit is pending and after it lands, and the approval control names the new count.
// Does not prove: the Next.js app, real requests (see PlanLocalStack.test.tsx for those),
// Safari/Firefox, screen-reader output or native apps.
//
// Usage: node scripts/verify-companion-plan-drawer.mjs
//   COMPANION_PLAN_DRAWER_PORT (default 3074), COMPANION_PLAN_DRAWER_OUT=<json path>.
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.COMPANION_PLAN_DRAWER_PORT || 3074);
const origin = `http://127.0.0.1:${port}`;
const esbuild = await import("esbuild");
const postcss = (await import("postcss")).default;
const tailwind = (await import("@tailwindcss/postcss")).default;

const ENTRY = String.raw`
import { createRoot } from "react-dom/client";
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import en from "@/lib/i18n/locales/en/translation.json";
import ar from "@/lib/i18n/locales/ar/translation.json";
import { TaskDrawer } from "@/components/companion/tasks/TaskDrawer";
import { PlanPanel } from "@/components/companion/plans/PlanPanel";

const lang = new URLSearchParams(location.search).get("lang") || "en";
document.documentElement.lang = lang;
document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
const GOAL = lang === "ar" ? "أسبوعك الأول في فانكوفر مع كل ما تحتاج إليه من خطوات الاستقرار والتسجيل" : "Your first week in Vancouver, with every settlement and registration step you need";
const LONG = lang === "ar" ? "إعداد خدمة الهاتف المحمول وخطة البيانات المناسبة للوصول" : "Set up mobile phone service and a data plan that suits your arrival";
const id = "7e1f1f6c-3333-4333-8333-000000000001";
let revision = 1;
let include = true;
const view = () => ({
  plan_proposal_id: id, proposal_revision: revision, status: "draft", kind: "plan", goal: GOAL,
  items: [
    { kind: "existing", task_ref: "sanity:sin-number", label: lang === "ar" ? "احصل على رقم التأمين الاجتماعي" : "Get your SIN" },
    { kind: "existing", task_ref: "sanity:bank-account", label: lang === "ar" ? "افتح حسابًا مصرفيًا" : "Open a bank account" },
    { kind: "new", key: "n1", title: LONG, priority: "Do soon", include },
  ],
  context: { profile: { city: "Vancouver", province: "British Columbia", arrival_date: "2026-11-02" }, existing: [], matches: {} },
  previous_context: null, review_reason: revision > 1 ? "edited" : null, source: null, undo_of: null,
  change_count: include ? 1 : 0, unresolved: [],
  tasks: [
    { task_ref: "sanity:sin-number", source: "sanity", state: "in_progress", revision: 2, removed: false, waiting_reason: null },
    { task_ref: "sanity:bank-account", source: "sanity", state: "not_started", revision: 1, removed: false, waiting_reason: null },
  ],
  plan_id: null, receipt: null, created_at: "2026-10-27T10:00:00Z", updated_at: "2026-10-27T10:00:00Z",
});
window.sent = [];
let releaseRevise = null;
window.releaseRevise = () => releaseRevise && releaseRevise();
window.fetch = async (url, options) => {
  if (url !== "/api/companion/actions") throw new Error("Unexpected external request: " + url);
  const body = JSON.parse(options.body);
  window.sent.push(body.action);
  const reply = (b) => new Response(JSON.stringify(b), { status: 200 });
  if (body.action === "read") return reply({ contract_version: 1, tasks: [] });
  if (body.action === "plans") return reply({ contract_version: 1, plans: [], drafts: [view()] });
  if (body.action === "plan_proposal") return reply({ plan_proposal: view() });
  if (body.action === "plan_revise") {
    await new Promise((r) => (releaseRevise = r));
    include = body.items[2].include;
    revision++;
    return reply({ plan_proposal: view() });
  }
  return new Response(JSON.stringify({ error: "unexpected" }), { status: 400 });
};
const i18n = createInstance();
i18n.use(initReactI18next).init({ lng: lang, fallbackLng: "en", resources: { en: { translation: en }, ar: { translation: ar } },
  interpolation: { escapeValue: false }, compatibilityJSON: "v3", initImmediate: false });
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={queryClient}><I18nextProvider i18n={i18n}>
    <main><button id="opener">Open</button></main>
    <TaskDrawer open title={i18n.t("plans.reviewTitle")} onClose={() => {}}>
      <PlanPanel target={{ proposalId: id }} onOpenTask={() => {}} />
    </TaskDrawer>
  </I18nextProvider></QueryClientProvider>
);
`;

async function build() {
  const js = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: root, loader: "tsx", sourcefile: "fixture.tsx" },
    bundle: true,
    plugins: [{
      name: "plan-drawer-fixture-adapters",
      setup(b) {
        b.onResolve({ filter: /^@\/(hooks\/useAuthUser|lib\/posthog)$/ }, ({ path }) => ({ path, namespace: "plan-fixture" }));
        b.onLoad({ filter: /.*/, namespace: "plan-fixture" }, ({ path }) => ({
          contents: path.endsWith("useAuthUser")
            ? 'export const AUTH_USER_KEY = ["auth-user"]; export const useAuthUser = () => ({data:{id:"fixture-owner"},isPending:false});'
            : "export const isPostHogConfigured = () => false; export const posthog = {capture(){}};",
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

const results = [];
const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });

const GEOMETRY = String.raw`() => {
  const panel = document.querySelector('[role="dialog"]');
  const r = panel.getBoundingClientRect();
  const controls = [...panel.querySelectorAll('button, label:has(input[type="checkbox"])')]
    .map((el) => ({ text: (el.getAttribute("aria-label") || el.textContent).trim().slice(0, 40), h: Math.round(el.getBoundingClientRect().height) }));
  return { vw: innerWidth, left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width),
    overflow: document.scrollingElement.scrollWidth - innerWidth, panelOverflow: panel.scrollWidth - panel.clientWidth,
    small: controls.filter((c) => c.h < 44), count: controls.length, dir: getComputedStyle(panel).direction };
}`;

async function run(browser, lang, width) {
  const label = `${lang} ${width}px`;
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${origin}/?lang=${lang}`);
  const t = JSON.parse(await readFile(join(root, `lib/i18n/locales/${lang}/translation.json`), "utf8")).plans;
  await page.getByRole("checkbox").waitFor();
  // Measure the settled drawer: after its opening motion (no transform left on the panel).
  await page.waitForFunction(() => {
    const panel = document.querySelector('[role="dialog"]');
    return panel && panel.getAnimations({ subtree: true }).every((a) => a.playState !== "running");
  });
  await page.waitForTimeout(800);
  const g = await page.evaluate(new Function(`return ${GEOMETRY}`)());
  check(`${label}: no horizontal page overflow`, g.overflow <= 0, g);
  check(`${label}: no overflow inside the drawer`, g.panelOverflow <= 0, g);
  check(`${label}: every drawer control is at least 44px tall`, g.small.length === 0 && g.count >= 4, g);
  if (width <= 640) check(`${label}: drawer takes the full width`, g.left === 0 && g.right === width, g);
  else check(`${label}: drawer opens at the inline end`, lang === "ar" ? g.left === 0 && g.right < width : g.right === width && g.left > 0, g);
  if (lang === "ar") check(`${label}: drawer content is right-to-left`, g.dir === "rtl", g);

  // Keyboard: Tab stays in the drawer.
  const inside = [];
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    inside.push(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))));
  }
  check(`${label}: Tab stays inside the drawer`, inside.every(Boolean), inside);

  // Space on the checkbox: one edit; focus stays on it while pending and after it lands.
  const box = page.getByRole("checkbox");
  await box.focus();
  await page.keyboard.press("Space");
  await page.waitForFunction(() => window.sent.includes("plan_revise"));
  const pending = await page.evaluate(() => document.activeElement?.getAttribute("type"));
  await page.evaluate(() => window.releaseRevise());
  const save = t.saveExisting;
  await page.getByRole("button", { name: save }).waitFor();
  const after = await page.evaluate(() => ({
    type: document.activeElement?.getAttribute("type"),
    checked: document.activeElement?.checked,
    revises: window.sent.filter((a) => a === "plan_revise").length,
  }));
  check(`${label}: focus stays on the checkbox while the edit is pending`, pending === "checkbox", pending);
  check(`${label}: focus stays on the checkbox after the edit, which is unchecked`, after.type === "checkbox" && after.checked === false, after);
  check(`${label}: one draft edit per keypress`, after.revises === 1, after);
  await context.close();
}

const { js, css } = await build();
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
const server = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}).listen(port, "127.0.0.1");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch();
try {
  for (const lang of ["en", "ar"]) for (const width of [390, 640, 1280]) await run(browser, lang, width);
} finally {
  await browser.close();
  server.close();
}
for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.name}${r.ok ? "" : ` ${JSON.stringify(r.detail)}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed} passed, ${failed} failed`);
if (process.env.COMPANION_PLAN_DRAWER_OUT) await writeFile(process.env.COMPANION_PLAN_DRAWER_OUT, JSON.stringify(results, null, 2));
process.exit(failed ? 1 : 0);
