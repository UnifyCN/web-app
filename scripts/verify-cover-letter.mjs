#!/usr/bin/env node
/**
 * Standalone verification for the cover-letter deterministic core.
 *
 * Exercises the REAL pure modules — `normalizeCoverLetterData` / `buildResumeContext`
 * / `emptyCoverLetter` / `isCoverLetterEmpty` (lib/coverLetter/schema.ts) and the
 * inline edit ops (lib/coverLetter/editOps.ts) — without a running server, a
 * Supabase stack, or a deploy. The modules are transpiled on the fly with the
 * installed `typescript` and loaded via data: URLs; the one runtime import
 * (`@/lib/resume/schema` → normalizeJobPosting) is resolved by transpiling that
 * module first and rewriting the specifier.
 *
 * The docx builder + live LLM turn are covered by the local dev-server E2E, not
 * here (they need `docx` / a served edge function).
 *
 * Usage: node scripts/verify-cover-letter.mjs
 */
import ts from "typescript";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function transpile(relPath) {
  const src = readFileSync(join(root, relPath), "utf8");
  return ts.transpileModule(src, {
    compilerOptions: { module: "ESNext", target: "ES2022" },
  }).outputText;
}

function toDataUrl(code) {
  return "data:text/javascript;base64," + Buffer.from(code).toString("base64");
}

// lib/resume/schema.ts has only type-only app imports → self-contained at runtime.
const resumeSchemaUrl = toDataUrl(transpile("lib/resume/schema.ts"));

// lib/coverLetter/schema.ts imports normalizeJobPosting from "@/lib/resume/schema"
// — rewrite that bare specifier to the transpiled resume-schema data URL.
const coverSchemaCode = transpile("lib/coverLetter/schema.ts").replace(
  /["']@\/lib\/resume\/schema["']/g,
  JSON.stringify(resumeSchemaUrl),
);
const schema = await import(toDataUrl(coverSchemaCode));
const editOps = await import(toDataUrl(transpile("lib/coverLetter/editOps.ts")));

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name}`);
    failures++;
  }
}

// ---- normalizeCoverLetterData ----------------------------------------------
console.log("normalizeCoverLetterData:");
{
  const long = "x".repeat(5000);
  const n = schema.normalizeCoverLetterData({
    contact: { name: long, email: "a@b.co", phone: "", location: "", linkedin: "", website: "" },
    date: "September 4, 2026",
    recipient: { name: "Jane", title: "Recruiter", company: "Acme", location: "Toronto, ON" },
    greeting: "Dear Jane,",
    body: Array.from({ length: 20 }, (_, i) => `Paragraph ${i} ${long}`),
    closing: "Sincerely,",
    signature: "Sam",
    jobPosting: { url: "https://x.co", title: "Cook", company: "Acme", location: "", text: "make food", fetchedAt: "2026-09-04T00:00:00Z" },
    resumeDraftId: "abc-123",
    bogusKey: "should be dropped",
  });
  check("caps body to 8 paragraphs", n.body.length === 8);
  check("bounds each paragraph length", n.body.every((p) => p.length <= 1600));
  check("bounds contact name to 120", n.contact.name.length === 120);
  check("keeps recipient fields", n.recipient.company === "Acme" && n.recipient.title === "Recruiter");
  check("preserves jobPosting via shared normalizer", n.jobPosting && n.jobPosting.title === "Cook");
  check("preserves resumeDraftId", n.resumeDraftId === "abc-123");
  check("drops unknown keys", !("bogusKey" in n));
}
{
  const n = schema.normalizeCoverLetterData({});
  check("empty input → well-formed", Array.isArray(n.body) && typeof n.contact.name === "string");
  check("no jobPosting when absent", n.jobPosting === undefined);
  check("no resumeDraftId when absent", n.resumeDraftId === undefined);
}

// ---- emptyCoverLetter / isCoverLetterEmpty ---------------------------------
console.log("emptyCoverLetter / isCoverLetterEmpty:");
{
  const e = schema.emptyCoverLetter({ contact: { name: "Sam" }, date: "today", signature: "Sam" });
  check("seeds contact/date/signature", e.contact.name === "Sam" && e.date === "today" && e.signature === "Sam");
  check("empty letter reads as empty", schema.isCoverLetterEmpty(e) === true);
  const filled = { ...e, body: ["Real content here."] };
  check("filled letter reads as non-empty", schema.isCoverLetterEmpty(filled) === false);
  check("whitespace-only body reads as empty", schema.isCoverLetterEmpty({ ...e, body: ["   ", ""] }) === true);
}

// ---- buildResumeContext ----------------------------------------------------
console.log("buildResumeContext:");
{
  check("null resume → empty string", schema.buildResumeContext(null) === "");
  const resume = {
    contact: { name: "Ana Diaz", email: "", phone: "", location: "", linkedin: "", website: "" },
    summary: "Warehouse worker.",
    education: [{ id: "1", institution: "Central HS", location: "", degree: "Diploma", dates: "2019" }],
    experience: [{ id: "2", title: "Picker", organization: "LogCo", location: "", dates: "2020–2022", bullets: ["Packed 200 orders/day"] }],
    projects: [],
    skills: [{ id: "3", category: "Tools", items: ["Forklift", "Scanner"] }],
  };
  const ctx = schema.buildResumeContext(resume);
  check("includes name", ctx.includes("Ana Diaz"));
  check("includes an experience bullet", ctx.includes("Packed 200 orders/day"));
  check("includes skills", ctx.includes("Forklift"));
  check("is bounded (≤3000 chars)", ctx.length <= 3000);
}

// ---- editOps ---------------------------------------------------------------
console.log("editOps:");
{
  let d = schema.emptyCoverLetter();
  d = editOps.setContactField(d, "email", "sam@x.co");
  check("setContactField", d.contact.email === "sam@x.co");
  d = editOps.setDate(d, "Sept 4");
  check("setDate", d.date === "Sept 4");
  d = editOps.setRecipientField(d, "company", "Acme");
  check("setRecipientField", d.recipient.company === "Acme");
  d = editOps.setGreeting(d, "Dear team,");
  d = editOps.setClosing(d, "Best,");
  d = editOps.setSignature(d, "Sam");
  check("greeting/closing/signature", d.greeting === "Dear team," && d.closing === "Best," && d.signature === "Sam");

  d = editOps.addParagraph(d);
  d = editOps.addParagraph(d);
  check("addParagraph grows body", d.body.length === 2);
  d = editOps.setParagraph(d, 0, "First para");
  check("setParagraph", d.body[0] === "First para");
  d = editOps.removeParagraph(d, 0);
  check("removeParagraph", d.body.length === 1 && d.body[0] === "");

  // MAX_PARAGRAPHS cap
  let capped = schema.emptyCoverLetter();
  for (let i = 0; i < 20; i++) capped = editOps.addParagraph(capped);
  check("addParagraph respects MAX_PARAGRAPHS", capped.body.length === editOps.MAX_PARAGRAPHS);

  // immutability
  const before = schema.emptyCoverLetter();
  const after = editOps.setSignature(before, "changed");
  check("edit ops are immutable", before.signature === "" && after.signature === "changed");
}

console.log("");
if (failures > 0) {
  console.error(`✗ cover-letter verification FAILED: ${failures} check(s)`);
  process.exit(1);
}
console.log("✓ cover-letter verification passed");
