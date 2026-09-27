import { describe, expect, it } from "vitest";
import {
  formatLabel,
  formatPacificWhen,
  hasNotEnded,
  isTeamEvent,
  notEndedFilter,
  splitByTab,
  upcomingSoonestFirst,
  type AdminEvent,
} from "./eventList";

const NOW = new Date("2026-09-26T19:00:00.000Z"); // Sat, Sep 26 2026, 12:00 PM PDT

let nextId = 1;
function event(overrides: Partial<AdminEvent> = {}): AdminEvent {
  return {
    id: nextId++,
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

describe("hasNotEnded", () => {
  it("keeps a future event with no end", () => {
    expect(hasNotEnded(event(), NOW)).toBe(true);
  });

  it("drops a past event with no end", () => {
    expect(
      hasNotEnded(event({ eventDatetime: "2026-09-26T18:59:59Z" }), NOW),
    ).toBe(false);
  });

  it("keeps an event that started but has not ended (in progress)", () => {
    const inProgress = event({
      eventDatetime: "2026-09-26T17:00:00Z",
      eventEndDatetime: "2026-09-26T21:00:00Z",
    });
    expect(hasNotEnded(inProgress, NOW)).toBe(true);
  });

  it("drops an event whose end has passed", () => {
    const ended = event({
      eventDatetime: "2026-09-26T15:00:00Z",
      eventEndDatetime: "2026-09-26T18:00:00Z",
    });
    expect(hasNotEnded(ended, NOW)).toBe(false);
  });

  it("keeps an event that ends exactly now (the bound is inclusive)", () => {
    expect(
      hasNotEnded(
        event({
          eventDatetime: "2026-09-26T17:00:00Z",
          eventEndDatetime: NOW.toISOString(),
        }),
        NOW,
      ),
    ).toBe(true);
    expect(hasNotEnded(event({ eventDatetime: NOW.toISOString() }), NOW)).toBe(
      true,
    );
  });

  it("drops a row with an unparseable date instead of showing it forever", () => {
    expect(hasNotEnded(event({ eventDatetime: "not a date" }), NOW)).toBe(false);
  });
});

describe("notEndedFilter", () => {
  it("encodes the same rule for PostgREST, with the timestamp quoted", () => {
    expect(notEndedFilter(NOW)).toBe(
      'event_end_datetime.gte."2026-09-26T19:00:00.000Z",' +
        'and(event_end_datetime.is.null,event_datetime.gte."2026-09-26T19:00:00.000Z")',
    );
  });
});

describe("upcomingSoonestFirst", () => {
  it("filters out ended rows and sorts by start, soonest first", () => {
    const later = event({ eventDatetime: "2026-11-01T18:00:00Z" });
    const sooner = event({ eventDatetime: "2026-09-27T18:00:00Z" });
    const ended = event({ eventDatetime: "2026-09-01T18:00:00Z" });
    const inProgress = event({
      eventDatetime: "2026-09-25T18:00:00Z",
      eventEndDatetime: "2026-09-28T18:00:00Z",
    });
    expect(
      upcomingSoonestFirst([later, ended, sooner, inProgress], NOW).map(
        (e) => e.id,
      ),
    ).toEqual([inProgress.id, sooner.id, later.id]);
  });

  it("compares instants, not strings, across UTC offsets", () => {
    // 18:30 at -07:00 is 01:30Z the next day: later than 20:00Z.
    const offset = event({ eventDatetime: "2026-10-01T18:30:00-07:00" });
    const utc = event({ eventDatetime: "2026-10-01T20:00:00Z" });
    expect(upcomingSoonestFirst([offset, utc], NOW).map((e) => e.id)).toEqual([
      utc.id,
      offset.id,
    ]);
  });

  it("breaks ties by id so the order is stable", () => {
    const a = event({ id: 20, eventDatetime: "2026-10-01T20:00:00Z" });
    const b = event({ id: 10, eventDatetime: "2026-10-01T20:00:00Z" });
    expect(upcomingSoonestFirst([a, b], NOW).map((e) => e.id)).toEqual([10, 20]);
  });

  it("does not mutate its input", () => {
    const input = [
      event({ eventDatetime: "2026-11-01T18:00:00Z" }),
      event({ eventDatetime: "2026-10-01T18:00:00Z" }),
    ];
    const before = input.map((e) => e.id);
    upcomingSoonestFirst(input, NOW);
    expect(input.map((e) => e.id)).toEqual(before);
  });
});

describe("isTeamEvent / splitByTab", () => {
  it("treats source null as added by the team", () => {
    expect(isTeamEvent({ source: null })).toBe(true);
  });

  it("treats crawler rows (and any other non-null source) as from partners", () => {
    expect(isTeamEvent({ source: "crawler:sfu" })).toBe(false);
    expect(isTeamEvent({ source: "something-else" })).toBe(false);
  });

  it("splits into the two tabs and keeps each tab's order", () => {
    const t1 = event();
    const p1 = event({ source: "crawler:vpl" });
    const t2 = event();
    const p2 = event({ source: "crawler:sfu" });
    const { team, partners } = splitByTab([t1, p1, t2, p2]);
    expect(team.map((e) => e.id)).toEqual([t1.id, t2.id]);
    expect(partners.map((e) => e.id)).toEqual([p1.id, p2.id]);
  });

  it("returns two empty tabs for no rows", () => {
    expect(splitByTab([])).toEqual({ team: [], partners: [] });
  });
});

describe("formatLabel", () => {
  it("uses the spec's labels", () => {
    expect(formatLabel("in-person")).toBe("In person");
    expect(formatLabel("online")).toBe("Online");
    expect(formatLabel("hybrid")).toBe("Hybrid");
  });

  it("shows an unknown stored value as is", () => {
    expect(formatLabel("webinar")).toBe("webinar");
  });
});

describe("formatPacificWhen", () => {
  it("renders the start in Pacific time (PDT, UTC-7)", () => {
    // 01:00Z on Oct 3 is 6:00 PM on Fri, Oct 2 in Vancouver.
    expect(formatPacificWhen("2026-10-03T01:00:00Z", null, NOW)).toEqual({
      date: "Fri, Oct 2",
      time: "6:00 PM",
      endsOn: null,
    });
  });

  it("renders the start in Pacific time after fall back (PST, UTC-8)", () => {
    // 02:00Z on Nov 3 is 6:00 PM on Mon, Nov 2 in Vancouver.
    expect(formatPacificWhen("2026-11-03T02:00:00Z", null, NOW).time).toBe(
      "6:00 PM",
    );
  });

  it("shows a time range when the event ends the same Pacific day", () => {
    expect(
      formatPacificWhen("2026-10-03T01:00:00Z", "2026-10-03T03:30:00Z", NOW),
    ).toEqual({ date: "Fri, Oct 2", time: "6:00 PM – 8:30 PM", endsOn: null });
  });

  it("names the end day when the event runs past midnight Pacific", () => {
    expect(
      formatPacificWhen("2026-10-03T01:00:00Z", "2026-10-05T01:00:00Z", NOW),
    ).toEqual({ date: "Fri, Oct 2", time: "6:00 PM", endsOn: "Sun, Oct 4" });
  });

  it("adds the year only when it is not the current Pacific year", () => {
    expect(formatPacificWhen("2027-01-15T20:00:00Z", null, NOW).date).toBe(
      "Fri, Jan 15, 2027",
    );
  });

  it("uses the Pacific day, not the UTC day, near midnight", () => {
    // 06:30Z on Oct 1 is 11:30 PM on Wed, Sep 30 in Vancouver.
    expect(formatPacificWhen("2026-10-01T06:30:00Z", null, NOW)).toEqual({
      date: "Wed, Sep 30",
      time: "11:30 PM",
      endsOn: null,
    });
  });
});
