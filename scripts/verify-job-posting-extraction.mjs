#!/usr/bin/env node
/**
 * Standalone verification for the resume job-posting fetch + extraction.
 *
 * Exercises the REAL `isPublicHttpUrl` (SSRF guard) and `extractJobPosting`
 * (HTML → posting) without a running server, a Supabase stack, or a deploy — the
 * two pure modules import nothing from the app, so we transpile them on the fly
 * with the installed `typescript` and load them via data: URLs. A thin fetch
 * driver (mirrors lib/jobPosting/fetchPosting.ts) drives real URLs end-to-end.
 *
 * Usage:
 *   node scripts/verify-job-posting-extraction.mjs [url1] [url2] ...
 *
 * The hostile-URL + allowlist checks are pure and always run (they HARD-FAIL the
 * script on a regression). Any URLs passed as args are fetched + extracted and
 * printed so you can eyeball extraction quality across real job sites.
 */
import ts from "typescript";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

async function importTs(relPath) {
  const src = readFileSync(join(root, relPath), "utf8");
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: { module: "ESNext", target: "ES2022" },
  });
  const url = "data:text/javascript;base64," + Buffer.from(outputText).toString("base64");
  return import(url);
}

const { isPublicHttpUrl } = await importTs("lib/net/ssrf.ts");
const { extractJobPosting } = await importTs("lib/jobPosting/extract.ts");

let failures = 0;

// ---- SSRF: hostile URLs must ALL be rejected --------------------------------
const HOSTILE = [
  "http://169.254.169.254/latest/meta-data/", // cloud metadata (SSRF classic)
  "http://127.0.0.1:3000/",
  "http://[::1]/",
  "http://10.0.0.1/",
  "http://192.168.0.1/",
  "http://172.16.5.4/",
  "http://100.64.0.1/", // CGNAT
  "http://100.100.100.200/", // Alibaba Cloud metadata (inside CGNAT 100.64/10)
  "http://2130706433/", // decimal 127.0.0.1
  "http://0x7f000001/", // hex 127.0.0.1
  "http://0/", // 0.0.0.0
  "http://localhost:8080/",
  "http://sub.localhost/",
  "file:///etc/passwd",
  "ftp://example.com/resource",
  "gopher://127.0.0.1/",
  "javascript:alert(1)",
  "http://[fd00::1]/", // unique-local
  "http://[fe80::1]/", // link-local
  "http://[::ffff:127.0.0.1]/", // v4-mapped loopback
];

console.log("SSRF — hostile URLs (must be rejected):");
for (const u of HOSTILE) {
  const allowed = isPublicHttpUrl(u);
  if (allowed) {
    failures++;
    console.log(`  ✗ NOT REJECTED: ${u}`);
  } else {
    console.log(`  ✓ rejected: ${u}`);
  }
}

// ---- SSRF: legitimate public URLs must be allowed ---------------------------
const ALLOWED = [
  "https://example.com/jobs/123",
  "https://boards.greenhouse.io/acme/jobs/456",
  "https://jobs.lever.co/acme/abc",
  "http://ca.indeed.com/viewjob?jk=abc",
];
console.log("\nSSRF — public URLs (must be allowed):");
for (const u of ALLOWED) {
  const allowed = isPublicHttpUrl(u);
  if (!allowed) {
    failures++;
    console.log(`  ✗ WRONGLY BLOCKED: ${u}`);
  } else {
    console.log(`  ✓ allowed: ${u}`);
  }
}

// ---- Thin fetch driver (mirrors lib/jobPosting/fetchPosting.ts) --------------
async function fetchHtml(startUrl) {
  let current = startUrl;
  for (let hop = 0; hop <= 3; hop++) {
    if (!isPublicHttpUrl(current)) return { error: "blocked_url" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let res;
    try {
      res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "UnifyResumeBot/1.0 (+https://unifysocial.ca)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
    } catch (e) {
      clearTimeout(timer);
      return { error: "fetch_failed", detail: String(e) };
    }
    if (res.status >= 300 && res.status < 400) {
      clearTimeout(timer);
      const loc = res.headers.get("location");
      if (!loc) return { error: "fetch_failed" };
      current = new URL(loc, current).toString();
      continue;
    }
    clearTimeout(timer);
    if (!res.ok) return { error: "fetch_failed", status: res.status };
    return { html: await res.text(), finalUrl: current };
  }
  return { error: "fetch_failed", detail: "too many redirects" };
}

// ---- Real URLs (from argv): fetch + extract + print -------------------------
const urls = process.argv.slice(2);
if (urls.length) {
  console.log("\nExtraction — real URLs:");
  for (const u of urls) {
    console.log(`\n• ${u}`);
    if (!isPublicHttpUrl(u)) {
      console.log("  → rejected by SSRF guard (not a public http(s) URL)");
      continue;
    }
    const r = await fetchHtml(u);
    if (r.error) {
      console.log(`  → fetch failed: ${r.error}${r.status ? ` (HTTP ${r.status})` : ""}`);
      continue;
    }
    const extracted = extractJobPosting(r.html);
    if (!extracted) {
      console.log("  → extraction_failed (login wall / JS-only / no posting)");
      continue;
    }
    console.log(`  title:    ${extracted.title || "(none)"}`);
    console.log(`  company:  ${extracted.company || "(none)"}`);
    console.log(`  location: ${extracted.location || "(none)"}`);
    console.log(`  text:     ${extracted.text.length} chars`);
    console.log(
      "  preview:  " +
        extracted.text.replace(/\n+/g, " ").slice(0, 240) +
        (extracted.text.length > 240 ? "…" : ""),
    );
  }
} else {
  console.log(
    "\n(no URLs passed — pass real job-posting URLs as args to test extraction)",
  );
}

console.log(
  failures === 0
    ? "\n✔ SSRF checks passed."
    : `\n✗ ${failures} SSRF check(s) FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
