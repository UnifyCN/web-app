import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { DISALLOWED_PREFIXES, PUBLIC_PAGES, SITE_URL } from "./routes";

const appDir = path.join(process.cwd(), "app");

/** Top-level URL segments from the route folders in a route group. */
function routeFolders(group: string): string[] {
  return readdirSync(path.join(appDir, group), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => `/${entry.name}`);
}

describe("crawler rules", () => {
  it("covers every route folder, as public or disallowed", () => {
    const known = new Set<string>([...PUBLIC_PAGES, ...DISALLOWED_PREFIXES]);
    const folders = [
      ...routeFolders("(main)"),
      ...routeFolders("(auth)"),
      ...routeFolders("(onboarding)"),
      "/api",
    ];
    expect(folders.filter((folder) => !known.has(folder))).toEqual([]);
  });

  it("never lists a page as both public and disallowed", () => {
    const disallowed = new Set<string>(DISALLOWED_PREFIXES);
    expect(PUBLIC_PAGES.filter((page) => disallowed.has(page))).toEqual([]);
    // A disallowed prefix must not swallow a public page either.
    for (const page of PUBLIC_PAGES) {
      expect(DISALLOWED_PREFIXES.some((prefix) => page.startsWith(prefix))).toBe(
        false,
      );
    }
  });

  it("robots.txt allows the public pages and points at the sitemap", () => {
    const { rules, sitemap: sitemapUrl } = robots();
    const rule = Array.isArray(rules) ? rules[0] : rules;
    expect(rule.userAgent).toBe("*");
    expect(rule.allow).toEqual([...PUBLIC_PAGES]);
    expect(rule.disallow).toEqual([...DISALLOWED_PREFIXES]);
    expect(sitemapUrl).toBe(`${SITE_URL}/sitemap.xml`);
  });

  it("the sitemap lists exactly the public pages, as absolute URLs", () => {
    expect(sitemap().map((entry) => entry.url)).toEqual(
      PUBLIC_PAGES.map((page) => `${SITE_URL}${page}`),
    );
  });
});
