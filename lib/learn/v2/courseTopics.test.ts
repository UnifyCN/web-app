import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  baseSanityId,
  courseTopic,
  TOPIC_ICONS,
  topicClasses,
} from "./courseTopics";
import { isLearnV2Enabled } from "./flag";

describe("courseTopic", () => {
  it("maps a course by its stable id first", () => {
    expect(
      courseTopic({
        _id: "baeece22-8ac0-48a0-b310-baab55e38f88",
        icon: "cottage",
      }),
    ).toBe("employment");
  });

  it("maps a translated or draft course like its English original", () => {
    expect(baseSanityId("drafts.abc-fr-CA")).toBe("abc");
    expect(
      courseTopic({ _id: "4c79ebb5-b03a-47aa-862e-6d0853eba7d4-ar" }),
    ).toBe("finance");
  });

  it("falls back to the legacy icon, then to a book", () => {
    expect(courseTopic({ _id: "new-course", icon: "psychology" })).toBe(
      "mental-health",
    );
    expect(courseTopic({ _id: "new-course", icon: "unknown" })).toBe(
      "fallback",
    );
    expect(courseTopic({ _id: "new-course" })).toBe("fallback");
  });

  it("gives every topic an icon and colour tokens defined in the theme", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    for (const topic of Object.keys(
      TOPIC_ICONS,
    ) as (keyof typeof TOPIC_ICONS)[]) {
      const { tile, icon } = topicClasses(topic);
      expect(css).toContain(`--color-${tile.replace(/^bg-/, "")}:`);
      expect(css).toContain(`--color-${icon.replace(/^text-/, "")}:`);
    }
  });
});

describe("isLearnV2Enabled", () => {
  it("is on only for the exact string true", () => {
    expect(isLearnV2Enabled("true")).toBe(true);
    for (const value of [undefined, "", "false", "TRUE", "1", "yes"]) {
      expect(isLearnV2Enabled(value)).toBe(false);
    }
  });
});
