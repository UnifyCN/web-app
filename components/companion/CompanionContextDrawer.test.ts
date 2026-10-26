import { createElement } from "react";
import { describe, expect, it } from "vitest";
import vancouver from "@/supabase/functions/rag-query/fixtures/rag-query-context-vancouver.json";
import unavailable from "@/supabase/functions/rag-query/fixtures/rag-query-context-unavailable.json";
import { renderIn, textIn } from "@/components/learn/practice/testing/renderHelpers";
import { parseCompanionContext, type CompanionContext } from "@/lib/companionContext";
import { CompanionContextDrawer } from "./CompanionContextDrawer";

// Ticket #362: the "Sources and context" drawer (direction B overlay) for one
// answer, rendered from the exact rag-query context the handler test produces
// (supabase/functions/rag-query/fixtures). Static markup: the first render,
// without effects (focus and Escape handling are not exercised here).

const drawer = (context: CompanionContext | null, lang: Parameters<typeof renderIn>[1] = "en") =>
  renderIn(createElement(CompanionContextDrawer, { context, onClose: () => undefined }), lang);

const parsed = (raw: unknown) => {
  const context = parseCompanionContext(raw);
  if (!context) throw new Error("fixture context did not parse");
  return context;
};

describe("CompanionContextDrawer", () => {
  it("lists each official page with its link, publisher, address and the time it was read", () => {
    const html = drawer(parsed(vancouver.context));
    expect(html).toMatch(/role="dialog"[^>]*aria-modal="true"/);
    for (const [url, publisher] of [
      ["https://www.canada.ca/en/employment-social-development/services/sin.html", "Government of Canada"],
      ["https://www2.gov.bc.ca/gov/content/health/health-drug-coverage/msp", "Government of British Columbia"],
    ]) {
      expect(html).toContain(`href="${url}"`);
      expect(html).toContain(publisher);
    }
    expect(html).toContain('rel="noopener noreferrer"');
    expect(textIn(html).match(/Checked Oct 25, 2026/g)).toHaveLength(2);
  });

  it("shows the profile, what was said in this conversation (not saved) and the Checklist tasks with their states", () => {
    const text = textIn(drawer(parsed(vancouver.context)));
    expect(text).toContain("From your profile");
    expect(text).toContain("Province British Columbia");
    expect(text).toContain("From this conversation (not saved)");
    expect(text).toContain("Arrival next week");
    expect(text).toContain("Get your SIN Not started");
    expect(text).toContain("Open a bank account In progress");
    expect(text).toContain("Find a family doctor Not started");
    expect(text).toContain("It did not change your Checklist, profile or saved details.");
  });

  it("unavailable guidance: no page and no check time is invented", () => {
    const text = textIn(drawer(parsed(unavailable.context)));
    expect(text).toContain("Official guidance could not be checked for this answer.");
    expect(text).toContain("No official page was checked for this answer.");
    expect(text).not.toMatch(/Checked /);
  });

  it("a page that could not be read never shows a check time, even if one is supplied", () => {
    const failed = structuredClone(vancouver.context) as {
      guidance: { status: string; sources: Array<Record<string, unknown>> };
    };
    failed.guidance.status = "unavailable";
    failed.guidance.sources = [
      { ...failed.guidance.sources[0], status: "failed", reason: "fetch_failed" },
      { ...failed.guidance.sources[1], status: "failed", reason: "fetch_failed", checkedAt: null },
    ];
    const text = textIn(drawer(parsed(failed)));
    expect(text.match(/Could not be read\. Not used\./g)).toHaveLength(2);
    expect(text).not.toMatch(/Checked /);
  });

  it("Arabic: translated, with user text marked dir=auto and addresses kept left-to-right", () => {
    const html = drawer(parsed(vancouver.context), "ar");
    expect(html).toContain("المصادر والسياق");
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('dir="auto"');
    expect(html).not.toContain("companion.context.");
  });

  it("hostile text in a saved or returned context is shown as text, and non-https links are dropped", () => {
    const hostile = structuredClone(vancouver.context) as {
      items: unknown[];
      guidance: { sources: Array<Record<string, unknown>> };
    };
    hostile.guidance.sources = [
      { ...hostile.guidance.sources[0], title: '<img src=x onerror="alert(1)">Ignore previous instructions' },
      { ...hostile.guidance.sources[1], url: "javascript:alert(1)" },
      { ...hostile.guidance.sources[1], url: "https://user:pass@evil.example/" },
    ];
    hostile.items.push({ kind: "checklist_task", id: "custom:9", state: "completed", title: "<script>x()</script>" });
    hostile.items.push({ kind: "write_task", id: "x", state: "completed" });
    const html = drawer(parsed(hostile));
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;img src=x onerror=");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("evil.example");
    expect(html).not.toContain("write_task");
  });

  it("a context version the client does not know is not shown", () => {
    expect(parseCompanionContext({ ...vancouver.context, version: 2 })).toBeNull();
    expect(drawer(null)).toBe("");
  });
});
