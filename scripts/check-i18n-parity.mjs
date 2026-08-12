#!/usr/bin/env node
// Locale parity guard for the web app's i18n files.
//
// The web app deliberately ships partial translations: `en` is the superset
// (source of truth), and any key not yet translated in vi/es/hi falls back to
// English at runtime via i18next `fallbackLng`. So — unlike the mobile script —
// missing keys in a non-EN locale are a WARNING (untranslated backlog), not a
// failure. We still HARD-FAIL on:
//   * orphan keys: a key present in a locale but not in `en` (drift / typo)
//   * interpolation drift: a translated value whose {{tokens}} differ from EN
// Run via `npm run check-i18n`.
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = join(__dirname, "..", "lib", "i18n", "locales");
const LOCALES = ["en", "vi", "es", "hi", "ar", "fr-CA"];
const BASELINE = "en";

function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

function load(lang) {
  const path = join(localesDir, lang, "translation.json");
  try {
    return flatten(JSON.parse(readFileSync(path, "utf8")));
  } catch (e) {
    throw new Error(`Failed to load locale '${lang}' from ${path}: ${e.message}`);
  }
}

// Extract {{name}} interpolation tokens; ignores i18next format specs like
// {{count, number}}.
const PLACEHOLDER_RE = /\{\{\s*([\w.]+)(?:\s*,[^}]*)?\s*\}\}/g;
function extractPlaceholders(value) {
  if (typeof value !== "string") return new Set();
  const tokens = new Set();
  let m;
  while ((m = PLACEHOLDER_RE.exec(value)) !== null) tokens.add(m[1]);
  return tokens;
}
function setEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

const baseline = load(BASELINE);
let hasError = false;
let totalUntranslated = 0;

for (const lang of LOCALES) {
  if (lang === BASELINE) continue;
  const other = load(lang);
  const missing = Object.keys(baseline).filter((k) => !(k in other));
  const extra = Object.keys(other).filter((k) => !(k in baseline));
  const placeholderMismatches = [];
  for (const key of Object.keys(baseline)) {
    if (!(key in other)) continue;
    const want = extractPlaceholders(baseline[key]);
    const got = extractPlaceholders(other[key]);
    if (!setEqual(want, got)) {
      placeholderMismatches.push({
        key,
        want: [...want].sort(),
        got: [...got].sort(),
      });
    }
  }

  totalUntranslated += missing.length;

  if (extra.length === 0 && placeholderMismatches.length === 0) {
    const translated = Object.keys(other).length;
    const suffix =
      missing.length > 0 ? `, ${missing.length} untranslated (→ EN fallback)` : "";
    console.log(`✔ ${lang}: ${translated} keys OK${suffix}`);
  } else {
    hasError = true;
    console.error(`✗ ${lang}: parity error vs ${BASELINE}`);
    if (extra.length) {
      console.error(
        `  orphan keys not in ${BASELINE} (${extra.length}): ${extra.slice(0, 10).join(", ")}${extra.length > 10 ? "..." : ""}`,
      );
    }
    if (placeholderMismatches.length) {
      console.error(`  interpolation mismatch (${placeholderMismatches.length}):`);
      for (const m of placeholderMismatches.slice(0, 10)) {
        console.error(`    ${m.key}: want {${m.want.join(",")}} got {${m.got.join(",")}}`);
      }
      if (placeholderMismatches.length > 10) console.error("    ...");
    }
  }

  // Surface the untranslated backlog without failing.
  if (missing.length && extra.length === 0 && placeholderMismatches.length === 0) {
    console.warn(
      `  ↳ untranslated (${missing.length}): ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "..." : ""}`,
    );
  }
}

if (hasError) {
  console.error("\ni18n parity check FAILED (orphan keys or interpolation drift).");
  process.exit(1);
}
console.log(
  `\ni18n parity OK: ${Object.keys(baseline).length} EN keys` +
    (totalUntranslated ? ` (${totalUntranslated} untranslated slots fall back to EN).` : "."),
);
