import { describe, expect, it } from "vitest";
import {
  planVisibilityEdit,
  rollbackEventVisibility,
  visibilityOf,
  withEventVisibility,
} from "./eventVisibility";
import { EVENT_UPDATABLE_COLUMNS } from "./eventForm";
import type { AdminEvent } from "./eventList";

const NOW = new Date("2026-09-27T19:00:00.000Z");

function event(overrides: Partial<AdminEvent> = {}): AdminEvent {
  return {
    id: 1,
    title: "Resume workshop",
    eventDatetime: "2026-10-03T01:00:00+00:00",
    eventEndDatetime: null,
    eventType: "in-person",
    location: "Burnaby Public Library",
    partnerSlug: null,
    isFeatured: false,
    source: null,
    ...overrides,
  };
}

describe("planVisibilityEdit", () => {
  it("turns Feature on and keeps the partner", () => {
    const plan = planVisibilityEdit(event({ partnerSlug: "rbc" }), { isFeatured: true }, NOW);
    expect(plan).toEqual({
      kind: "save",
      id: 1,
      previous: { isFeatured: false, partnerSlug: "rbc" },
      next: { isFeatured: true, partnerSlug: "rbc" },
      payload: {
        is_featured: true,
        partner_slug: "rbc",
        updated_at: "2026-09-27T19:00:00.000Z",
      },
    });
  });

  it("sets a partner and keeps Feature", () => {
    const plan = planVisibilityEdit(event({ isFeatured: true }), { partnerSlug: "sfu" }, NOW);
    expect(plan.kind === "save" && plan.payload).toEqual({
      is_featured: true,
      partner_slug: "sfu",
      updated_at: NOW.toISOString(),
    });
  });

  it("maps None to a null partner_slug", () => {
    const plan = planVisibilityEdit(event({ partnerSlug: "ey" }), { partnerSlug: "" }, NOW);
    expect(plan.kind === "save" && plan.next).toEqual({ isFeatured: false, partnerSlug: null });
    expect(plan.kind === "save" && plan.payload.partner_slug).toBeNull();
  });

  it("sends the same three keys for a team row and a crawler row", () => {
    for (const source of [null, "crawler:sfu"]) {
      const plan = planVisibilityEdit(event({ source }), { isFeatured: true }, NOW);
      expect(plan.kind).toBe("save");
      if (plan.kind !== "save") continue;
      expect(Object.keys(plan.payload).sort()).toEqual([
        "is_featured",
        "partner_slug",
        "updated_at",
      ]);
      for (const key of Object.keys(plan.payload)) {
        expect(EVENT_UPDATABLE_COLUMNS).toContain(key);
      }
    }
  });

  it("does nothing when the value does not change", () => {
    expect(planVisibilityEdit(event({ partnerSlug: "rbc" }), { partnerSlug: "rbc" }, NOW)).toEqual({
      kind: "unchanged",
    });
    expect(planVisibilityEdit(event(), { partnerSlug: "" }, NOW)).toEqual({ kind: "unchanged" });
    expect(planVisibilityEdit(event({ isFeatured: true }), { isFeatured: true }, NOW)).toEqual({
      kind: "unchanged",
    });
  });

  it("treats a padded stored slug as the same partner", () => {
    expect(planVisibilityEdit(event({ partnerSlug: " rbc " }), { partnerSlug: "rbc" }, NOW)).toEqual({
      kind: "unchanged",
    });
  });

  it("rejects a partner that is not in the list", () => {
    expect(planVisibilityEdit(event(), { partnerSlug: "acme" }, NOW)).toEqual({
      kind: "invalid",
      message: "Pick a partner from the list.",
    });
  });

  it("will not feature a row whose stored partner is not in the list", () => {
    const plan = planVisibilityEdit(event({ partnerSlug: "old-partner" }), { isFeatured: true }, NOW);
    expect(plan.kind).toBe("invalid");
  });

  it("lets that row move to a listed partner or None", () => {
    const row = event({ partnerSlug: "old-partner" });
    expect(planVisibilityEdit(row, { partnerSlug: "ey" }, NOW).kind).toBe("save");
    const toNone = planVisibilityEdit(row, { partnerSlug: "" }, NOW);
    expect(toNone.kind === "save" && toNone.previous.partnerSlug).toBe("old-partner");
  });
});

describe("withEventVisibility", () => {
  const list = [event({ id: 1 }), event({ id: 2, partnerSlug: "rbc" }), event({ id: 3 })];

  it("changes only the target row", () => {
    const next = withEventVisibility(list, 2, { isFeatured: true, partnerSlug: null });
    expect(next?.[1]).toMatchObject({ id: 2, isFeatured: true, partnerSlug: null });
    expect(next?.[0]).toBe(list[0]);
    expect(next?.[2]).toBe(list[2]);
    expect(list[1]).toMatchObject({ isFeatured: false, partnerSlug: "rbc" }); // not mutated
  });

  it("keeps the other fields of the target row", () => {
    const next = withEventVisibility(list, 2, { isFeatured: true, partnerSlug: "ey" });
    expect(next?.[1]).toEqual({ ...list[1], isFeatured: true, partnerSlug: "ey" });
  });

  it("returns the same list when the row is not there", () => {
    expect(withEventVisibility(list, 99, { isFeatured: true, partnerSlug: null })).toBe(list);
  });

  it("returns undefined when there is no list yet", () => {
    expect(withEventVisibility(undefined, 1, { isFeatured: true, partnerSlug: null })).toBeUndefined();
  });
});

describe("rollbackEventVisibility", () => {
  const previous = { isFeatured: false, partnerSlug: "rbc" };
  const attempted = { isFeatured: true, partnerSlug: "rbc" };

  it("puts the previous value back after a failed save", () => {
    const optimistic = withEventVisibility([event({ id: 1, partnerSlug: "rbc" })], 1, attempted);
    const rolledBack = rollbackEventVisibility(optimistic, 1, previous, attempted);
    expect(rolledBack && visibilityOf(rolledBack[0])).toEqual(previous);
  });

  it("keeps a value that a refetch already brought", () => {
    const refetched = [event({ id: 1, partnerSlug: "sfu" })];
    expect(rollbackEventVisibility(refetched, 1, previous, attempted)).toBe(refetched);
  });

  it("leaves other rows alone", () => {
    const list = withEventVisibility(
      [event({ id: 1, partnerSlug: "rbc" }), event({ id: 2, isFeatured: true })],
      1,
      attempted,
    );
    const rolledBack = rollbackEventVisibility(list, 1, previous, attempted);
    expect(rolledBack?.[1]).toBe(list?.[1]);
  });

  it("does nothing when the row or the list is gone", () => {
    const list = [event({ id: 2 })];
    expect(rollbackEventVisibility(list, 1, previous, attempted)).toBe(list);
    expect(rollbackEventVisibility(undefined, 1, previous, attempted)).toBeUndefined();
  });

  it("restores a stored slug exactly, even one not in the list", () => {
    const before = { isFeatured: false, partnerSlug: "old-partner" };
    const tried = { isFeatured: false, partnerSlug: null };
    const optimistic = withEventVisibility([event({ id: 1, partnerSlug: "old-partner" })], 1, tried);
    const rolledBack = rollbackEventVisibility(optimistic, 1, before, tried);
    expect(rolledBack?.[0].partnerSlug).toBe("old-partner");
  });
});
