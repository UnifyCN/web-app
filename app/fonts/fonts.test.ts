import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import sources from "./sources.json";

// The self-hosted fonts must reproduce what next/font/google produced, face for
// face: the same font bytes, descriptors, Unicode ranges, fallback metrics,
// CSS variables and preload set. sources.json holds that reference, captured
// from the Google Fonts responses and the CSS next/font/google generated.

const dir = join(process.cwd(), "app/fonts");
const read = (file: string) => readFileSync(join(dir, file), "utf8");
const unquote = (value: string) => value.trim().replace(/^['"]|['"]$/g, "");

function fontFaces(css: string) {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) =>
    Object.fromEntries(
      [...m[1].matchAll(/([a-z-]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [
        k,
        v.trim(),
      ]),
    ),
  );
}

const css = read("fonts.css");
const faces = fontFaces(css);
const fileFaces = faces.filter((f) => !unquote(f["font-family"]).endsWith(" Fallback"));
const fallbackFaces = faces.filter((f) => unquote(f["font-family"]).endsWith(" Fallback"));

describe("self-hosted fonts", () => {
  it("declares every original face in order with the same descriptors and file", () => {
    const actual = fileFaces.map((f) => ({
      family: unquote(f["font-family"]),
      style: f["font-style"],
      weight: f["font-weight"],
      ...(f["font-stretch"] ? { stretch: f["font-stretch"] } : {}),
      display: f["font-display"],
      unicodeRange: f["unicode-range"],
      file: f.src.match(/^url\(\.\/([^)]+)\) format\('woff2'\)$/)?.[1],
    }));
    expect(actual).toEqual(sources.faces);
  });

  it("declares each fallback face with the original metrics", () => {
    const actual = fallbackFaces.map((f) => ({
      family: unquote(f["font-family"]),
      local: f.src.match(/^local\(['"]?([^'")]+)['"]?\)$/)?.[1],
      ascentOverride: f["ascent-override"],
      descentOverride: f["descent-override"],
      lineGapOverride: f["line-gap-override"],
      sizeAdjust: f["size-adjust"],
    }));
    expect(actual).toEqual(sources.fallbacks);
  });

  it("sets the four font variables on the root in the original order", () => {
    const root = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";
    const vars = [...root.matchAll(/(--font-[a-z-]+)\s*:\s*([^;]+);/g)].map(
      ([, k, v]) => [k, v.trim()],
    );
    expect(vars).toEqual(sources.variables);
  });

  it("ships the exact captured bytes for every referenced file", () => {
    const referenced = [...new Set(sources.faces.map((f) => f.file))];
    expect(referenced).toEqual(sources.files.map((f) => f.file));
    for (const f of sources.files) {
      const bytes = readFileSync(join(dir, f.file));
      expect(bytes.subarray(0, 4).toString("latin1"), f.file).toBe("wOF2");
      expect(bytes.length, f.file).toBe(f.bytes);
      expect(createHash("sha256").update(bytes).digest("hex"), f.file).toBe(f.sha256);
    }
  });

  it("keeps the SIL Open Font License and copyright of each family", () => {
    const families = [...new Set(sources.files.map((f) => f.family))];
    expect(sources.licenses.map((l) => l.family)).toEqual(families);
    for (const l of sources.licenses) {
      const text = read(l.file);
      expect(text.split("\n")[0]).toBe(l.copyright);
      expect(text).toContain("SIL OPEN FONT LICENSE Version 1.1");
    }
  });

  it("preloads only the five files the original build preloaded", () => {
    const preload = read("preload.ts");
    const imported = [...preload.matchAll(/from "\.\/([^"]+\.woff2)"/g)].map((m) => m[1]);
    expect([...imported].sort()).toEqual([...sources.preload].sort());
    expect(preload).toContain('as: "font"');
    expect(preload).toContain('type: "font/woff2"');
    expect(preload).toContain('crossOrigin: "anonymous"');
  });

  it("is wired into the root layout instead of next/font/google", () => {
    const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
    expect(layout).not.toContain("next/font/google");
    const fontsCss = layout.indexOf('import "./fonts/fonts.css"');
    expect(fontsCss).toBeGreaterThan(-1);
    expect(fontsCss).toBeLessThan(layout.indexOf('import "./globals.css"'));
    expect(layout).toMatch(/preloadFonts\(\);/);
    expect(layout).toContain('className="h-full antialiased"');
  });
});
