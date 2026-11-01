// Read name table, axes and cmap coverage of each downloaded font.
import fs from "node:fs";
import path from "node:path";
import fontkit from "next/dist/compiled/@next/font/dist/fontkit/index.js";
const fk = fontkit.default;
const create = fk.default || fk;
const dir = process.argv[2];
const faces = JSON.parse(process.argv[3] ? fs.readFileSync(process.argv[3], "utf8") : "[]");
const parseRange = (s) => s.split(",").map((r) => r.trim().replace(/^U\+/i, "")).map((r) => { const [a, b] = r.split("-"); return [parseInt(a, 16), parseInt(b ?? a, 16)]; });
const out = [];
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".woff2")).sort()) {
  const f = create(fs.readFileSync(path.join(dir, file)));
  const cps = new Set(f.characterSet);
  const face = faces.find((x) => x.file === file);
  let inRange = null, rangeTotal = null;
  if (face) { rangeTotal = 0; inRange = 0; for (const [a, b] of parseRange(face["unicode-range"])) for (let c = a; c <= b; c++) { rangeTotal++; if (cps.has(c)) inRange++; } }
  const n = (id) => { try { return f.name.records[id]?.en ?? Object.values(f.name.records[id] ?? {})[0] ?? null; } catch { return null; } };
  out.push({ file, familyName: f.familyName, version: n("version"), copyright: n("copyright"), license: n("licenseDescription"), licenseURL: n("licenseURL"), axes: f.variationAxes, unitsPerEm: f.unitsPerEm, ascent: f.ascent, descent: f.descent, lineGap: f.lineGap, glyphs: f.numGlyphs, codepoints: cps.size, rangeCodepoints: rangeTotal, rangeCovered: inRange });
}
console.log(JSON.stringify(out, null, 1));
