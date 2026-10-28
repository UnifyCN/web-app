// Real-browser check of the self-hosted fonts in a production build (app/fonts).
//
// Serves the built CSS chunk that holds the @font-face rules and the emitted
// font files from one or more `next build` output folders, renders a real app
// string per supported language at several weights, and asks Chromium which
// fonts drew each glyph (CDP CSS.getPlatformFontsForNode). Every case runs in a
// new browser context, so no font comes from an earlier case's cache.
//
// Two modes per language and weight:
// - direct: the text uses only the language's own family. It passes when that
//   web font drew every glyph, so a missing or wrong file fails it.
// - stack: the text uses the app's font-sans chain. It passes when no system
//   font drew a glyph and the script's family drew glyphs. Exception kept from
//   the next/font/google setup: "Inter Fallback" (local Arial, no
//   unicode-range) comes before Noto Sans Arabic, so where Arial has Arabic
//   glyphs (macOS, Windows) Arial draws Arabic text. For Arabic, the stack mode
//   therefore also accepts Arial.
// Every font request must return 200. With two builds, the same cases must
// also give the same text size, the same fonts with the same glyph counts and
// the same requested files (by content hash). Inter's variable weight is
// checked by width changes across 100/400/900.
//
// Proves: the built CSS routes each script to its face and the files exist,
// load and contain the glyphs. Does not prove: the Next.js server, preload
// timing, Safari/Firefox, native apps or screen readers.
//
// Usage: node scripts/verify-local-fonts.mjs [label=<.next dir> ...]
//   (default: candidate=.next; the first label is the reference for comparison)
//   LOCAL_FONTS_PORT (default 3126), LOCAL_FONTS_OUT=<json path>,
//   LOCAL_FONTS_BLOCK=<substring> aborts matching font requests (negative control),
//   PLAYWRIGHT_MODULE=<path> when playwright is not installed locally.
import { createServer } from "node:http";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.LOCAL_FONTS_PORT || 3126);
const origin = `http://127.0.0.1:${port}`;
const block = process.env.LOCAL_FONTS_BLOCK || "";
const builds = (process.argv.slice(2).length ? process.argv.slice(2) : ["candidate=.next"]).map(
  (arg) => {
    const [label, dir] = arg.split("=");
    return { label, dir: resolve(root, dir) };
  },
);

// Real UI strings: the Companion welcome title plus the tab labels.
const LANGS = { en: "ltr", "fr-CA": "ltr", es: "ltr", vi: "ltr", hi: "ltr", ar: "rtl", pa: "ltr" };
const SCRIPT_FAMILY = {
  en: "Inter", "fr-CA": "Inter", es: "Inter", vi: "Inter",
  hi: "Noto Sans Devanagari", ar: "Noto Sans Arabic", pa: "Noto Sans Gurmukhi",
};
const WEIGHTS = [400, 500, 600, 700];
const INTER_WEIGHTS = [100, 900];

async function sample(lang) {
  const t = JSON.parse(await readFile(join(root, `lib/i18n/locales/${lang}/translation.json`), "utf8"));
  return [t.companion.welcomeTitle, ...Object.values(t.tabs)].join(" ");
}

async function fontChunk(dir) {
  const chunks = join(dir, "static/chunks");
  for (const name of await readdir(chunks)) {
    if (!name.endsWith(".css")) continue;
    const css = await readFile(join(chunks, name), "utf8");
    if (css.includes("@font-face")) {
      // next/font sets the variables through classes on <html>; self-hosted
      // CSS sets them on :root. Apply whichever classes the build defines.
      const classes = [...css.matchAll(/\.([\w-]+__variable)\{--font-/g)].map((m) => m[1]);
      return { name, classes };
    }
  }
  throw new Error(`no @font-face chunk in ${chunks}`);
}

const contentHash = (url) => {
  const stem = url.split("/").pop().replace(/\.woff2$/, "");
  return stem.match(/^[0-9a-f]{16}-s\.(?:p\.)?(.+)$/)?.[1] ?? stem.split(".").slice(1).join(".");
};

function serve(state) {
  return createServer(async (req, res) => {
    const url = new URL(req.url, origin);
    const m = url.pathname.match(/^\/b\/([^/]+)\/(.*)$/);
    const build = m && state.builds.find((b) => b.label === m[1]);
    if (!build) return res.writeHead(404).end();
    if (m[2] === "fixture") {
      const lang = url.searchParams.get("lang");
      const weight = url.searchParams.get("w");
      const family = url.searchParams.get("mode") === "direct" ? `font-family:'${SCRIPT_FAMILY[lang]}';` : "";
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(`<!doctype html><html lang="${lang}" dir="${LANGS[lang]}" class="${[...build.chunk.classes, "h-full", "antialiased"].join(" ")}"><head><meta charset="utf-8"><link rel="stylesheet" href="/b/${build.label}/_next/static/chunks/${build.chunk.name}"></head><body class="min-h-full flex flex-col font-sans"><p><span id="s" style="${family}font-size:32px;font-weight:${weight};white-space:nowrap">${state.samples[lang]}</span></p></body></html>`);
    }
    if (!m[2].startsWith("_next/static/")) return res.writeHead(404).end();
    try {
      const body = await readFile(join(build.dir, m[2].slice("_next/".length)));
      const type = { ".css": "text/css", ".woff2": "font/woff2" }[extname(m[2])] || "application/octet-stream";
      res.writeHead(200, { "content-type": type }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
}

async function runCase(browser, build, lang, weight, mode) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 400 } });
  const page = await context.newPage();
  const requests = [];
  if (block) {
    await page.route((u) => u.href.includes(block), (route) => route.abort());
  }
  page.on("requestfinished", async (r) => {
    if (r.url().endsWith(".woff2")) requests.push({ url: r.url(), status: (await r.response())?.status() ?? null });
  });
  page.on("requestfailed", (r) => {
    if (r.url().endsWith(".woff2")) requests.push({ url: r.url(), status: null, failure: r.failure()?.errorText });
  });
  await page.goto(`${origin}/b/${build.label}/fixture?lang=${lang}&w=${weight}&mode=${mode}`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(100);
  const rect = await page.evaluate(() => {
    const r = document.getElementById("s").getBoundingClientRect();
    return { width: r.width, height: r.height };
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root: doc } = await cdp.send("DOM.getDocument", { depth: -1 });
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: doc.nodeId, selector: "#s" });
  const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
  await context.close();
  const families = fonts
    .map((f) => ({ family: f.familyName, custom: f.isCustomFont, glyphs: f.glyphCount }))
    .sort((a, b) => a.family.localeCompare(b.family));
  const failures = [];
  const arialArabic = mode === "stack" && lang === "ar";
  for (const f of families)
    if (!f.custom && !(arialArabic && f.family === "Arial"))
      failures.push(`system font drew ${f.glyphs} glyphs: ${f.family}`);
  if (mode === "direct" && families.some((f) => f.family !== SCRIPT_FAMILY[lang]))
    failures.push(`not only ${SCRIPT_FAMILY[lang]}`);
  const drew = (name) => families.some((f) => f.family === name && f.glyphs > 0);
  if (!drew(SCRIPT_FAMILY[lang]) && !(arialArabic && drew("Arial")))
    failures.push(`${SCRIPT_FAMILY[lang]} drew no glyphs`);
  for (const r of requests) if (r.status !== 200) failures.push(`font request ${r.status ?? r.failure}: ${r.url}`);
  if (!requests.length) failures.push("no font request");
  return {
    build: build.label, lang, weight, mode, rect, families,
    files: [...new Set(requests.map((r) => contentHash(r.url)))].sort(),
    requests, failures,
  };
}

async function main() {
  const state = { builds: [], samples: {} };
  for (const b of builds) state.builds.push({ ...b, chunk: await fontChunk(b.dir) });
  for (const lang of Object.keys(LANGS)) state.samples[lang] = await sample(lang);
  const server = serve(state);
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const build of state.builds) {
      for (const lang of Object.keys(LANGS)) {
        const weights = lang === "en" ? [...INTER_WEIGHTS, ...WEIGHTS] : WEIGHTS;
        for (const w of weights)
          for (const mode of ["stack", "direct"]) results.push(await runCase(browser, build, lang, w, mode));
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  const comparisons = [];
  const [ref, ...others] = state.builds;
  for (const other of others) {
    for (const a of results.filter((r) => r.build === ref.label)) {
      const b = results.find((r) => r.build === other.label && r.lang === a.lang && r.weight === a.weight && r.mode === a.mode);
      const diffs = [];
      if (Math.abs(a.rect.width - b.rect.width) > 0.01 || Math.abs(a.rect.height - b.rect.height) > 0.01)
        diffs.push(`size ${JSON.stringify(a.rect)} vs ${JSON.stringify(b.rect)}`);
      if (JSON.stringify(a.families) !== JSON.stringify(b.families))
        diffs.push(`fonts ${JSON.stringify(a.families)} vs ${JSON.stringify(b.families)}`);
      if (JSON.stringify(a.files) !== JSON.stringify(b.files))
        diffs.push(`files ${a.files.join(",")} vs ${b.files.join(",")}`);
      comparisons.push({ ref: ref.label, other: other.label, lang: a.lang, weight: a.weight, mode: a.mode, diffs });
    }
  }
  const variable = state.builds.map((build) => {
    const w = (n) => results.find((r) => r.build === build.label && r.lang === "en" && r.weight === n && r.mode === "stack").rect.width;
    const ok = w(100) < w(400) && w(400) < w(900);
    return { build: build.label, widths: { 100: w(100), 400: w(400), 900: w(900) }, ok };
  });
  const failed = results.filter((r) => r.failures.length);
  const differing = comparisons.filter((c) => c.diffs.length);
  for (const r of results)
    console.log(`${r.failures.length ? "FAIL" : "ok  "} ${r.build} ${r.mode} ${r.lang} ${r.weight} ${r.rect.width.toFixed(2)}x${r.rect.height.toFixed(2)} ${r.families.map((f) => `${f.family}:${f.glyphs}`).join(" ")} files=${r.files.length}${r.failures.length ? " :: " + r.failures.join("; ") : ""}`);
  for (const c of comparisons) if (c.diffs.length) console.log(`DIFF ${c.ref}/${c.other} ${c.mode} ${c.lang} ${c.weight}: ${c.diffs.join("; ")}`);
  for (const v of variable) console.log(`${v.ok ? "ok  " : "FAIL"} ${v.build} Inter variable widths ${JSON.stringify(v.widths)}`);
  console.log(`cases=${results.length} failed=${failed.length} compared=${comparisons.length} differing=${differing.length} block=${JSON.stringify(block)}`);
  if (process.env.LOCAL_FONTS_OUT)
    await writeFile(process.env.LOCAL_FONTS_OUT, JSON.stringify({ block, builds, samples: state.samples, results, comparisons, variable }, null, 2));
  process.exit(failed.length || differing.length || variable.some((v) => !v.ok) ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
