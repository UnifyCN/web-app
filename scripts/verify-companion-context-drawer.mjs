// Real-browser acceptance check for the Companion "Sources and context" drawer
// (ticket #362, direction B web overlay drawer).
//
// Bundles the actual Companion page (app/(main)/companion/page.tsx) with its
// actual ConversationList, ChatPanel, MessageBubble, ContextSummary, ChatInput
// and CompanionContextDrawer, the real translations, the real Tailwind CSS
// (app/globals.css) and the motion config, and drives it in headless Chromium.
// Only the data hooks (@/hooks/useCompanion, @/hooks/useProfile, @/hooks/useAuthUser) are replaced
// by an in-page store holding the pinned rag-query context fixtures, so the
// test can sign in as account A, update the same account, switch to account B
// or lose access to the conversation.
//
// Proves, in a real browser: text contrast of the added UI against its actual
// backgrounds, enter/exit motion and reduced motion, focus on open, Tab trap,
// focus kept through a parent update, Escape and backdrop close, focus return,
// an inert background while open (no script focus, not in Chromium's
// accessibility tree) and its earlier state restored on close, other shared
// dialogs opened above the drawer (mounted closed earlier or mounted on open)
// staying usable, and every hold released in either close order,
// the composer draft kept for the same account and cleared for another, and
// no prior-account context after an account change or access loss; RTL places
// the drawer at the inline end.
// Does not prove: login, Supabase/RLS, the live rag-query, Next.js routing,
// Safari/Firefox, screen-reader output or native apps.
//
// Usage: node scripts/verify-companion-context-drawer.mjs
//   COMPANION_DRAWER_PORT (default 3012), COMPANION_DRAWER_OUT=<json path>,
//   COMPANION_DRAWER_SHOTS=<dir> to save screenshots of the open drawer,
//   PLAYWRIGHT_MODULE=<path> when playwright is not installed locally.
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.COMPANION_DRAWER_PORT || 3012);
const origin = `http://127.0.0.1:${port}`;
const shots = process.env.COMPANION_DRAWER_SHOTS;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const esbuild = await import("esbuild");
const postcss = (await import("postcss")).default;
const tailwind = (await import("@tailwindcss/postcss")).default;

const en = JSON.parse(await readFile(join(root, "lib/i18n/locales/en/translation.json"), "utf8"));
const ar = JSON.parse(await readFile(join(root, "lib/i18n/locales/ar/translation.json"), "utf8"));
const L = {
  en: { open: en.companion.context.openDetails, close: en.companion.context.closeAria },
  ar: { open: ar.companion.context.openDetails, close: ar.companion.context.closeAria },
};
// Background controls that an open modal must hide from focus and assistive tech.
const BACKGROUND = {
  en: [en.companion.messageInputAria, en.companion.searchChats],
  ar: [ar.companion.messageInputAria, ar.companion.searchChats],
};

// ------------------------------------------------------------------ harness

const STUBS = String.raw`
import { useSyncExternalStore } from "react";
import vancouver from "@/supabase/functions/rag-query/fixtures/rag-query-context-vancouver.json";
import conflict from "@/supabase/functions/rag-query/fixtures/rag-query-context-province-conflict.json";
import { parseCompanionContext } from "@/lib/companionContext";

const ctxA = parseCompanionContext(vancouver.context);
const ctxConflict = parseCompanionContext(conflict.context);
const CONV_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONV_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const at = "2026-10-25T17:30:00Z";
const messagesA = () => [
  { id: 1, conversationId: CONV_A, role: "user", content: "I arrive in Vancouver next week. What should I do first?", sources: null, createdAt: at },
  { id: 2, conversationId: CONV_A, role: "assistant", content: "Start with your SIN.", sources: null, companionContext: ctxA, createdAt: at },
  { id: 3, conversationId: CONV_A, role: "user", content: "Actually I might go to Toronto.", sources: null, createdAt: at },
  { id: 4, conversationId: CONV_A, role: "assistant", content: "Which province applies?", sources: null, companionContext: ctxConflict, createdAt: at },
];
const ACCOUNTS = {
  A: { user: { id: "user-a", onboarding: { firstName: "Ana", city: "Vancouver", province: "British Columbia", goals: [], learningInterests: [], stage: 0, persona: "other" } },
       conversations: [{ id: CONV_A, title: "A conversation", updatedAt: at }], messages: { [CONV_A]: messagesA } },
  B: { user: { id: "user-b", onboarding: { firstName: "Ben", city: "Toronto", province: "Ontario", goals: [], learningInterests: [], stage: 2, persona: "skilled_worker" } },
       conversations: [{ id: CONV_B, title: "B conversation", updatedAt: at }], messages: { [CONV_B]: () => [] } },
};
let state = { account: "A", lostAccess: false, version: 0 };
const listeners = new Set();
const set = (patch) => { state = { ...state, ...patch, version: state.version + 1 }; listeners.forEach((l) => l()); };
window.harness = {
  // Same account, new data objects (as a refetch returns): nothing private changes.
  update: () => set({}),
  switchAccount: () => set({ account: "B", lostAccess: false }),
  loseAccess: () => set({ lostAccess: true }),
};
const useStore = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => state);

export const messagesKey = (id) => ["companion", "messages", id];
const mutation = () => ({ mutateAsync: async () => ({ id: CONV_A }), isPending: false });
export function useConversations() {
  const s = useStore();
  const a = ACCOUNTS[s.account];
  return { data: a.conversations.filter((c) => !(s.lostAccess && c.id === CONV_A)).map((c) => ({ ...c })) };
}
export function useConversationMessages(id) {
  const s = useStore();
  const make = ACCOUNTS[s.account].messages[id];
  return { data: make && !(s.lostAccess && id === CONV_A) ? make() : [] };
}
export function useChatbotUsage() { useStore(); return { data: { messageCount: 0 } }; }
export function useCreateConversation() { return mutation(); }
export function useSendMessage() { return mutation(); }
export function useDeleteConversation() { return mutation(); }
export function useCurrentUser() { const s = useStore(); return { data: { ...ACCOUNTS[s.account].user } }; }
export const CURRENT_USER_KEY = ["current-user"];
// The page also carries the #361 task entry and the account-owned composer
// draft, which read the signed-in account from useAuthUser.
export const AUTH_USER_KEY = ["auth-user"];
export function useAuthUser() { const s = useStore(); return { data: { id: ACCOUNTS[s.account].user.id }, isPending: false }; }
`;

const ENTRY = String.raw`
import { createRoot } from "react-dom/client";
import { MotionConfig } from "framer-motion";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import en from "@/lib/i18n/locales/en/translation.json";
import ar from "@/lib/i18n/locales/ar/translation.json";
import { motionCssVars } from "@/lib/motion";
import CompanionPage from "@/app/(main)/companion/page";
import { useState } from "react";
import { DialogPanel, DialogPresence } from "@/components/ui/Dialog";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

// Other shared dialogs on the same page, to check how they stack with the
// drawer: a ConfirmModal and an inert-background DialogPresence that are
// mounted closed from the start, and one mounted only when opened.
function OtherDialogs() {
  const [confirm, setConfirm] = useState(false);
  const [upper, setUpper] = useState(false);
  const [mountedUpper, setMountedUpper] = useState(false);
  window.otherDialogs = { setConfirm, setUpper, setMountedUpper };
  return (
    <>
      <ConfirmModal open={confirm} title="Other confirm" onCancel={() => setConfirm(false)} onConfirm={() => setConfirm(false)} />
      <DialogPresence open={upper} inertBackground>
        <DialogPanel role="dialog" aria-label="Upper dialog" className="fixed inset-10 z-[100] bg-surface">
          <button type="button" onClick={() => setUpper(false)}>Close upper dialog</button>
        </DialogPanel>
      </DialogPresence>
      {mountedUpper && (
        <DialogPresence open inertBackground>
          <DialogPanel role="dialog" aria-label="Mounted upper dialog" className="fixed inset-10 z-[100] bg-surface">
            <button type="button" onClick={() => setMountedUpper(false)}>Close mounted upper dialog</button>
          </DialogPanel>
        </DialogPresence>
      )}
    </>
  );
}

const lang = new URLSearchParams(location.search).get("lang") === "ar" ? "ar" : "en";
document.documentElement.lang = lang;
document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
for (const [k, v] of Object.entries(motionCssVars)) document.documentElement.style.setProperty(k, v);
const i18n = createInstance();
i18n.use(initReactI18next).init({ lng: lang, fallbackLng: "en", resources: { en: { translation: en }, ar: { translation: ar } }, interpolation: { escapeValue: false }, initImmediate: false });
const queryClient = new QueryClient();
// Same provider order as app/providers.tsx.
createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={queryClient}>
    <MotionConfig reducedMotion="user">
      <I18nextProvider i18n={i18n}><CompanionPage /><OtherDialogs /></I18nextProvider>
    </MotionConfig>
  </QueryClientProvider>,
);
`;

async function build() {
  const dir = await mkdtemp(join(tmpdir(), "companion-drawer-"));
  const stubPath = join(dir, "stubs.jsx");
  await writeFile(stubPath, STUBS);
  const js = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: root, loader: "tsx", sourcefile: "harness.tsx" },
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
      // Any other public setting read by the #361 task entry (analytics keys)
      // is absent, as in an unconfigured build.
      "process.env": "{}",
    },
    logLevel: "error",
    plugins: [
      {
        name: "data-hooks",
        setup(b) {
          b.onResolve({ filter: /^@\/hooks\/(useCompanion|useProfile|useAuthUser)$/ }, () => ({ path: stubPath }));
          b.onResolve({ filter: /.*/ }, (args) =>
            args.importer === stubPath && !args.path.startsWith(".")
              ? b.resolve(args.path, { resolveDir: root, kind: args.kind })
              : undefined,
          );
        },
      },
    ],
  });
  const cssFrom = join(root, "app/globals.css");
  const css = await postcss([tailwind({ base: root })]).process(await readFile(cssFrom, "utf8"), { from: cssFrom });
  await rm(dir, { recursive: true, force: true });
  return { js: js.outputFiles[0].text, css: css.css };
}

// ------------------------------------------------------------------ in-page helpers

const PAGE_HELPERS = String.raw`
window.__t = (() => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const rgba = (css) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (top, bottom) => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1);
  const lum = (c) => {
    const l = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
  };
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  function background(el) {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    return layers.reverse().reduce((acc, layer) => over(layer, acc), [255, 255, 255, 1]);
  }
  function hidden(el) {
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === "none" || s.visibility === "hidden") return true;
      if (s.position === "absolute" && n.offsetWidth <= 1 && n.offsetHeight <= 1) return true; // sr-only
    }
    return el.getClientRects().length === 0;
  }
  return {
    // Every visible text run inside root: its contrast against its actual background.
    contrast(root, min) {
      const seen = new Set();
      const out = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        const el = t.parentElement;
        if (!t.textContent.trim() || seen.has(el) || hidden(el)) continue;
        seen.add(el);
        const bg = background(el);
        const fg = over(rgba(getComputedStyle(el).color), bg);
        const r = ratio(fg, bg);
        out.push({ text: t.textContent.trim().slice(0, 40), ratio: Math.round(r * 100) / 100, ok: r >= min });
      }
      return out;
    },
    // Opacity and transform of the drawer panel on each animation frame.
    async frames(ms) {
      const out = [];
      const start = performance.now();
      while (performance.now() - start < ms) {
        await new Promise((r) => requestAnimationFrame(r));
        const d = document.querySelector('[role="dialog"]');
        out.push(d ? { t: Math.round(performance.now() - start), opacity: Number(getComputedStyle(d).opacity), transform: getComputedStyle(d).transform } : null);
      }
      return out;
    },
  };
})();
`;

// ------------------------------------------------------------------ checks

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
}
const moved = (t) => t && t !== "none" && t !== "matrix(1, 0, 0, 1, 0, 0)";

async function openPage(browser, { lang = "en", reducedMotion = "no-preference" } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  await page.goto(`${origin}/?lang=${lang}`);
  await page.addScriptTag({ content: PAGE_HELPERS });
  await page.getByText("A conversation").first().click();
  await page.getByRole("button", { name: L[lang].open, exact: true }).first().waitFor();
  return { context, page };
}

/** Click the first "Sources and context" control and record the drawer's frames. */
const openAndSample = (page, label, ms = 320) =>
  page.evaluate(
    async ({ label, ms }) => {
      const trigger = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === label);
      // A pointer click focuses the button in Chromium; a scripted click does not.
      trigger.focus();
      trigger.click();
      return window.__t.frames(ms);
    },
    { label, ms },
  );

const dialogCount = (page) => page.locator('[role="dialog"]').count();
const activeLabel = (page) =>
  page.evaluate(() => ({
    label: document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent?.trim(),
    href: document.activeElement?.getAttribute("href"),
    inDialog: Boolean(document.activeElement?.closest('[role="dialog"]')),
  }));
/** Background controls Chromium still exposes in its accessibility tree. */
async function exposedBackground(page, names) {
  const cdp = await page.context().newCDPSession(page);
  const { nodes } = await cdp.send("Accessibility.getFullAXTree");
  await cdp.detach();
  return nodes
    .filter((n) => !n.ignored && names.includes(n.name?.value))
    .map((n) => `${n.role?.value}: ${n.name?.value}`);
}
/** Try to focus each background control from script; report any that took focus. */
const focusBackground = (page, names) =>
  page.evaluate((names) => {
    const took = [];
    for (const el of document.querySelectorAll("textarea, input")) {
      if (!names.includes(el.getAttribute("aria-label"))) continue;
      el.focus();
      if (document.activeElement === el) took.push(el.getAttribute("aria-label"));
    }
    return { took, inDialog: Boolean(document.activeElement?.closest('[role="dialog"]')) };
  }, names);

async function gone(page, ms = 1000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if ((await dialogCount(page)) === 0) return true;
    await page.waitForTimeout(25);
  }
  return false;
}

async function run(browser) {
  // ---- LTR, normal motion
  {
    const { context, page } = await openPage(browser);
    const textbox = page.getByRole("textbox");
    await textbox.fill("Keep my draft");

    const summary = await page.evaluate(({ label }) => {
      const triggers = [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === label);
      return triggers.flatMap((b) => window.__t.contrast(b.parentElement.parentElement, 4.5));
    }, { label: L.en.open });
    check("summary text contrast >= 4.5:1 (answer card)", summary.length > 0 && summary.every((r) => r.ok), summary.filter((r) => !r.ok));

    // An element the app had already made inert must stay inert after the drawer closes.
    await page.evaluate((label) => {
      [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === label).inert = true;
    }, en.companion.newConversation);

    const enter = await openAndSample(page, L.en.open);
    const firstSeen = enter.find(Boolean);
    check("drawer enters with motion (fades and moves in)", firstSeen && firstSeen.opacity < 1 && enter.some((f) => f && moved(f.transform)), enter.slice(0, 4));
    check("drawer settles fully visible", enter.at(-1)?.opacity === 1, enter.at(-1));
    if (shots) await page.screenshot({ path: join(shots, "drawer-en.png") });

    const focus = await activeLabel(page);
    check("focus moves to Close on open", focus.label === L.en.close && focus.inDialog, focus);

    const blocked = await focusBackground(page, BACKGROUND.en);
    check("open drawer: background composer and search cannot take focus", blocked.took.length === 0 && blocked.inDialog, blocked);
    const exposed = await exposedBackground(page, BACKGROUND.en);
    check("open drawer: background controls are not in the accessibility tree", exposed.length === 0, exposed);

    const drawer = await page.evaluate(() => window.__t.contrast(document.querySelector('[role="dialog"]'), 4.5));
    check("drawer text contrast >= 4.5:1 (titles, publishers, addresses, times, sections)", drawer.length > 10 && drawer.every((r) => r.ok), drawer.filter((r) => !r.ok));

    const focusables = await page.locator('[role="dialog"] a[href], [role="dialog"] button').count();
    await page.getByRole("button", { name: L.en.close }).focus();
    const trapped = [];
    for (let i = 0; i < focusables + 2; i++) {
      await page.keyboard.press("Tab");
      trapped.push((await activeLabel(page)).inDialog);
    }
    await page.getByRole("button", { name: L.en.close }).focus();
    await page.keyboard.press("Shift+Tab");
    const wrapped = await activeLabel(page);
    check("Tab and Shift+Tab stay inside the drawer", trapped.every(Boolean) && wrapped.inDialog && Boolean(wrapped.href), { trapped, wrapped });

    const link = page.locator('[role="dialog"] a[href]').first();
    await link.focus();
    const before = await activeLabel(page);
    await page.evaluate(() => window.harness.update());
    await page.waitForTimeout(100);
    const after = await activeLabel(page);
    check("a same-account update keeps focus on the same source link", after.href === before.href && after.inDialog, { before, after });
    check("a same-account update keeps the drawer open", (await dialogCount(page)) === 1);
    const stillBlocked = await focusBackground(page, BACKGROUND.en);
    await link.focus();
    check("a same-account update keeps the background inert", stillBlocked.took.length === 0, stillBlocked);

    const exit = await page.evaluate(async () => {
      document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return window.__t.frames(80);
    });
    check("Escape closes with an exit fade (panel stays briefly, opacity < 1)", exit.some((f) => f && f.opacity < 1), exit.slice(0, 4));
    check("drawer is removed after the exit", await gone(page));
    const back = await activeLabel(page);
    check("focus returns to the Sources and context control", back.label === L.en.open, back);
    check("the draft survives open, update and close", (await textbox.inputValue()) === "Keep my draft");
    const restored = await focusBackground(page, BACKGROUND.en);
    check("after close: the background can take focus again", restored.took.length === BACKGROUND.en.length, restored);
    check("after close: background controls are back in the accessibility tree", (await exposedBackground(page, BACKGROUND.en)).length === BACKGROUND.en.length);
    const keptInert = await page.evaluate((label) => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === label);
      const was = b.inert;
      b.inert = false;
      return was;
    }, en.companion.newConversation);
    check("after close: an element the app made inert before opening stays inert", keptInert === true);

    await page.getByRole("button", { name: L.en.open, exact: true }).first().click();
    await page.getByRole("dialog").waitFor();
    await page.mouse.click(40, 400);
    check("a backdrop click closes the drawer", await gone(page));

    await page.getByRole("button", { name: L.en.open, exact: true }).first().click();
    await page.getByRole("dialog").waitFor();
    await page.evaluate(() => window.harness.switchAccount());
    const closedOnSwitch = await gone(page);
    const body = await page.locator("body").innerText();
    check("account change: the open drawer closes", closedOnSwitch);
    check("account change: no prior-account context is shown", !/Social Insurance Number|Find a family doctor|Open a bank account/.test(body));
    check("account change: the prior account's draft is cleared", (await textbox.inputValue()) === "", await textbox.inputValue());
    const afterSwitch = await focusBackground(page, BACKGROUND.en);
    check("account change: the composer can take focus again", afterSwitch.took.includes(en.companion.messageInputAria), afterSwitch);
    await context.close();
  }

  // ---- access loss on the open drawer
  {
    const { context, page } = await openPage(browser);
    await page.getByRole("textbox").fill("Still mine");
    await page.getByRole("button", { name: L.en.open, exact: true }).first().click();
    await page.getByRole("dialog").waitFor();
    await page.evaluate(() => window.harness.loseAccess());
    const closed = await gone(page);
    const body = await page.locator("body").innerText();
    check("access loss: the open drawer closes", closed);
    check("access loss: the lost conversation's context is not shown", !/Social Insurance Number|Find a family doctor/.test(body));
    check("access loss: the same account's draft is kept", (await page.getByRole("textbox").inputValue()) === "Still mine");
    await context.close();
  }

  // ---- reduced motion
  {
    const { context, page } = await openPage(browser, { reducedMotion: "reduce" });
    const frames = await openAndSample(page, L.en.open);
    // The shared MotionConfig reducedMotion="user" drops movement: a transform
    // is either the start value (held for the first frames while the panel is
    // nearly transparent) or none, never a value in between. The fade stays.
    const start = frames.find(Boolean)?.transform;
    const between = frames.filter((f) => f && moved(f.transform) && f.transform !== start);
    check("reduced motion: the drawer does not move gradually (no in-between transform)", frames.some(Boolean) && between.length === 0, between.slice(0, 3));
    check("reduced motion: the drawer still fades in", frames.some((f) => f && f.opacity > 0 && f.opacity < 1), frames.slice(0, 3));
    await page.keyboard.press("Escape");
    check("reduced motion: Escape still closes", await gone(page));
    await context.close();
  }

  // ---- other shared dialogs opened above the drawer
  {
    const { context, page } = await openPage(browser);
    await page.getByRole("textbox").fill("Draft under dialogs");
    // Elements the app made inert / not inert itself before any dialog opened.
    await page.evaluate(() => {
      for (const [id, inert] of [["app-inert", true], ["app-active", false]]) {
        const b = document.createElement("button");
        b.id = id;
        b.textContent = id;
        b.inert = inert;
        document.body.append(b);
      }
    });
    const tryFocus = (page, name) =>
      page.evaluate((name) => {
        const b = [...document.querySelectorAll("button")].find(
          (x) => x.textContent.trim() === name || x.getAttribute("aria-label") === name,
        );
        if (!b) return { found: false };
        b.focus();
        return { found: true, took: document.activeElement === b, inInert: Boolean(b.closest("[inert]")) };
      }, name);
    const composerBlocked = async () => (await focusBackground(page, BACKGROUND.en)).took.length === 0;
    const sourcesOpen = async () => {
      await page.getByRole("button", { name: L.en.open, exact: true }).first().click();
      await page.getByRole("dialog").waitFor();
      await page.waitForTimeout(250);
    };

    await sourcesOpen();
    // A child added to <body> while the drawer is open is held too, then released.
    await page.evaluate(() => {
      const b = document.createElement("button");
      b.id = "added-while-open";
      b.textContent = "added-while-open";
      document.body.append(b);
    });
    await page.waitForTimeout(100);
    const added = await tryFocus(page, "added-while-open");
    check("a <body> child added while the drawer is open is inert", added.found && !added.took && added.inInert, added);
    for (const [label, open, close, button] of [
      ["ConfirmModal mounted closed", "setConfirm", "setConfirm", "Cancel"],
      ["inert DialogPresence mounted closed", "setUpper", "setUpper", "Close upper dialog"],
      ["inert DialogPresence mounted when opened", "setMountedUpper", "setMountedUpper", "Close mounted upper dialog"],
    ]) {
      await page.evaluate((fn) => window.otherDialogs[fn](true), open);
      await page.waitForTimeout(250);
      const upper = await tryFocus(page, button);
      check(`${label}, opened above the drawer: it takes focus and is not inert`, upper.found && upper.took && !upper.inInert, upper);
      check(`${label}, opened above the drawer: it is in the accessibility tree`, (await exposedBackground(page, [button])).includes(`button: ${button}`));
      check(`${label}, opened above the drawer: the page behind stays inert`, await composerBlocked());
      await page.evaluate((fn) => window.otherDialogs[fn](false), close);
      await page.waitForTimeout(250);
      const back = await tryFocus(page, L.en.close);
      check(`${label}, closed again: the drawer takes focus and the page behind stays inert`, back.took && !back.inInert && (await composerBlocked()), back);
    }

    // Close order: the drawer closes first while an upper dialog stays open.
    await page.evaluate(() => window.otherDialogs.setUpper(true));
    await page.waitForTimeout(250);
    await page.evaluate(() => window.harness.switchAccount()); // closes the drawer underneath
    await page.waitForTimeout(400);
    const stillUpper = await tryFocus(page, "Close upper dialog");
    check("drawer closed under an open upper dialog: the upper dialog stays usable and the page stays inert", stillUpper.took && !stillUpper.inInert && (await composerBlocked()), stillUpper);
    await page.evaluate(() => window.otherDialogs.setUpper(false));
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({
      inert: [...document.querySelectorAll("[inert]")].map((e) => e.id || e.tagName),
      appInert: document.getElementById("app-inert").inert,
      appActive: document.getElementById("app-active").inert,
    }));
    check("all dialogs closed: only the element the app made inert is still inert", after.appInert && !after.appActive && after.inert.length === 1, after);
    const addedAfter = await tryFocus(page, "added-while-open");
    check("all dialogs closed: the child added while open takes focus", addedAfter.took && !addedAfter.inInert, addedAfter);
    const composer = await focusBackground(page, BACKGROUND.en);
    check("all dialogs closed: the composer and search take focus again", composer.took.length === BACKGROUND.en.length, composer);
    await context.close();
  }

  // ---- Arabic, right to left
  {
    const { context, page } = await openPage(browser, { lang: "ar" });
    const summary = await page.evaluate(({ label }) => {
      const triggers = [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === label);
      return triggers.flatMap((b) => window.__t.contrast(b.parentElement.parentElement, 4.5));
    }, { label: L.ar.open });
    await page.getByRole("button", { name: L.ar.open, exact: true }).first().click();
    await page.getByRole("dialog").waitFor();
    await page.waitForTimeout(300);
    const rect = await page.getByRole("dialog").boundingBox();
    if (shots) await page.screenshot({ path: join(shots, "drawer-ar.png") });
    check("RTL: the drawer sits at the inline end (left)", rect && rect.x <= 1 && rect.x + rect.width < 1280 / 2, rect);
    const drawer = await page.evaluate(() => window.__t.contrast(document.querySelector('[role="dialog"]'), 4.5));
    check("RTL: summary and drawer text contrast >= 4.5:1", [...summary, ...drawer].every((r) => r.ok), [...summary, ...drawer].filter((r) => !r.ok));
    const focus = await activeLabel(page);
    check("RTL: focus moves to Close on open", focus.label === L.ar.close, focus);
    const blocked = await focusBackground(page, BACKGROUND.ar);
    check("RTL: background cannot take focus and is not in the accessibility tree", blocked.took.length === 0 && (await exposedBackground(page, BACKGROUND.ar)).length === 0, blocked);
    await context.close();
  }
}

// ------------------------------------------------------------------ main

const { js, css } = await build();
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"></head><body class="min-h-full flex flex-col font-sans"><div id="root" class="h-dvh"></div><script src="/app.js"></script></body></html>`;
const server = createServer((req, res) => {
  const path = new URL(req.url, origin).pathname;
  const [type, body] =
    path === "/app.js" ? ["text/javascript", js] : path === "/app.css" ? ["text/css", css] : ["text/html", html];
  res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
  res.end(body);
});
await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
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

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : `  ${JSON.stringify(r.detail)}`}`);
for (const e of errors) console.log(`ERROR (not an assertion)  ${e}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed, ${errors.length} errors`);
if (process.env.COMPANION_DRAWER_OUT) {
  await writeFile(process.env.COMPANION_DRAWER_OUT, JSON.stringify({ results, errors }, null, 2));
}
process.exit(failed || errors.length ? 1 : 0);
