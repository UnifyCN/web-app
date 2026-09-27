import { describe, expect, it } from "vitest";
import { EVENT_PARTNERS } from "./eventPartners";
import {
  DST_GAP_MESSAGE,
  DUPLICATE_LINK_MESSAGE,
  EMPTY_EVENT_FORM,
  EVENT_TOPIC_OPTIONS,
  EVENT_UPDATABLE_COLUMNS,
  NOT_ON_LANDING_HINT,
  ONLINE_VENUE,
  SAVE_FAILED_MESSAGE,
  appsAppearDate,
  buildCrawlerEventUpdate,
  buildTeamEventUpdate,
  eventToFormState,
  isHttpUrl,
  mapSaveError,
  parseEventId,
  pacificWallTimeToUtc,
  showsAddress,
  utcToPacificWallTime,
  validateEventForm,
  visibilityHints,
  withEventType,
  type AdminEventDetail,
  type EventFormState,
  type EventInsertPayload,
} from "./eventForm";

/** A complete, valid form (in person, Oct 3 2026 6–8 PM Pacific). */
function form(overrides: Partial<EventFormState> = {}): EventFormState {
  return {
    ...EMPTY_EVENT_FORM,
    title: "Resume workshop",
    description: "Bring a printed copy of your resume.",
    startDate: "2026-10-03",
    startTime: "18:00",
    endDate: "",
    endTime: "20:00",
    eventType: "in-person",
    location: "Burnaby Public Library",
    address: "6100 Willingdon Ave, Burnaby",
    hostedBy: "Unify",
    genre: "Employment",
    externalLink: "https://lu.ma/unify-resume",
    partnerSlug: "",
    isFeatured: false,
    ...overrides,
  };
}

function payloadOf(state: EventFormState): EventInsertPayload {
  const result = validateEventForm(state);
  if (!result.ok) {
    throw new Error(`expected a valid form, got ${JSON.stringify(result.errors)}`);
  }
  return result.payload;
}

function errorsOf(state: EventFormState) {
  const result = validateEventForm(state);
  if (result.ok) throw new Error("expected the form to be rejected");
  return result.errors;
}

const utc = (date: string, time: string) => {
  const result = pacificWallTimeToUtc(date, time);
  return result.ok ? result.iso : result.reason;
};

describe("pacificWallTimeToUtc", () => {
  it("converts a summer (PDT, UTC−7) wall time", () => {
    expect(utc("2026-07-15", "18:00")).toBe("2026-07-16T01:00:00.000Z");
  });

  it("converts a winter (PST, UTC−8) wall time", () => {
    expect(utc("2026-01-15", "09:30")).toBe("2026-01-15T17:30:00.000Z");
  });

  it("converts across midnight into the next UTC day", () => {
    expect(utc("2026-12-31", "23:59")).toBe("2027-01-01T07:59:00.000Z");
  });

  describe("2026-03-08 (spring forward at 02:00)", () => {
    it("uses PST just before the gap", () => {
      expect(utc("2026-03-08", "00:00")).toBe("2026-03-08T08:00:00.000Z");
      expect(utc("2026-03-08", "01:59")).toBe("2026-03-08T09:59:00.000Z");
    });

    it("rejects every time in the 02:00–02:59 gap", () => {
      for (const time of ["02:00", "02:01", "02:30", "02:59"]) {
        expect(pacificWallTimeToUtc("2026-03-08", time)).toEqual({
          ok: false,
          reason: "gap",
        });
      }
    });

    it("uses PDT from 03:00", () => {
      expect(utc("2026-03-08", "03:00")).toBe("2026-03-08T10:00:00.000Z");
      expect(utc("2026-03-08", "18:00")).toBe("2026-03-09T01:00:00.000Z");
    });
  });

  describe("2026-11-01 (fall back at 02:00)", () => {
    it("uses PDT before the overlap", () => {
      expect(utc("2026-11-01", "00:59")).toBe("2026-11-01T07:59:00.000Z");
    });

    it("resolves the 01:00–01:59 overlap to the earlier occurrence (PDT, UTC−7)", () => {
      expect(utc("2026-11-01", "01:00")).toBe("2026-11-01T08:00:00.000Z");
      expect(utc("2026-11-01", "01:30")).toBe("2026-11-01T08:30:00.000Z");
      expect(utc("2026-11-01", "01:59")).toBe("2026-11-01T08:59:00.000Z");
    });

    it("uses PST from 02:00", () => {
      expect(utc("2026-11-01", "02:00")).toBe("2026-11-01T10:00:00.000Z");
      expect(utc("2026-11-01", "18:00")).toBe("2026-11-02T02:00:00.000Z");
    });
  });

  it("rejects malformed and impossible values", () => {
    for (const [date, time] of [
      ["", "18:00"],
      ["2026-10-03", ""],
      ["2026-02-30", "10:00"],
      ["2026-13-01", "10:00"],
      ["2026-10-03", "24:00"],
      ["2026-10-03", "18:60"],
      ["10/03/2026", "18:00"],
      ["2026-10-03", "6:00 PM"],
    ]) {
      expect(pacificWallTimeToUtc(date, time)).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
  });
});

describe("utcToPacificWallTime", () => {
  it("reads a UTC instant back as Pacific date and time", () => {
    expect(utcToPacificWallTime("2026-10-04T01:00:00+00:00")).toEqual({
      date: "2026-10-03",
      time: "18:00",
    });
  });

  it("round-trips every non-gap wall time on both DST dates and a normal date", () => {
    for (const date of ["2026-03-08", "2026-11-01", "2026-06-10"]) {
      for (let minutes = 0; minutes < 24 * 60; minutes += 15) {
        const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
          minutes % 60,
        ).padStart(2, "0")}`;
        const result = pacificWallTimeToUtc(date, time);
        if (!result.ok) {
          expect(date).toBe("2026-03-08");
          expect(time.startsWith("02:")).toBe(true);
          continue;
        }
        expect(utcToPacificWallTime(result.iso)).toEqual({ date, time });
      }
    }
  });
});

describe("validateEventForm → insert payload", () => {
  it("builds the row from a valid form", () => {
    expect(payloadOf(form())).toEqual({
      title: "Resume workshop",
      description: "Bring a printed copy of your resume.",
      event_datetime: "2026-10-04T01:00:00.000Z",
      event_end_datetime: "2026-10-04T03:00:00.000Z",
      event_type: "in-person",
      location: "Burnaby Public Library",
      address: "6100 Willingdon Ave, Burnaby",
      hosted_by: "Unify",
      genre: "Employment",
      external_link: "https://lu.ma/unify-resume",
      partner_slug: null,
      is_featured: false,
      source: null,
    });
  });

  it("always sets source to null and never sends max_attendees or server-owned columns", () => {
    const payload = payloadOf(form({ isFeatured: true, partnerSlug: "rbc" }));
    expect(payload.source).toBeNull();
    expect("source" in payload).toBe(true);
    for (const column of ["max_attendees", "id", "created_at", "updated_at"]) {
      expect(column in payload).toBe(false);
    }
  });

  it("trims text and stores blank optional fields as null", () => {
    const payload = payloadOf(
      form({
        title: "  Resume workshop  ",
        description: "   ",
        address: "",
        hostedBy: " ",
        externalLink: " https://lu.ma/x ",
      }),
    );
    expect(payload.title).toBe("Resume workshop");
    expect(payload.description).toBeNull();
    expect(payload.address).toBeNull();
    expect(payload.hosted_by).toBeNull();
    expect(payload.external_link).toBe("https://lu.ma/x");
  });

  it("keeps a multi-line description", () => {
    const payload = payloadOf(form({ description: "Line one.\n\nLine two." }));
    expect(payload.description).toBe("Line one.\n\nLine two.");
  });

  it("saves the partner and the feature flag", () => {
    const payload = payloadOf(form({ partnerSlug: "sfu", isFeatured: true }));
    expect(payload.partner_slug).toBe("sfu");
    expect(payload.is_featured).toBe(true);
  });

  it("has no end when no end time is set", () => {
    expect(payloadOf(form({ endTime: "" })).event_end_datetime).toBeNull();
  });

  it("uses the start date for an end time without an end date", () => {
    expect(payloadOf(form({ endDate: "", endTime: "21:15" })).event_end_datetime).toBe(
      "2026-10-04T04:15:00.000Z",
    );
  });

  it("accepts an end on a later date", () => {
    expect(
      payloadOf(form({ endDate: "2026-10-04", endTime: "10:00" })).event_end_datetime,
    ).toBe("2026-10-04T17:00:00.000Z");
  });

  it("does not save an address for an Online event", () => {
    const payload = payloadOf(
      form({ eventType: "online", location: "Online", address: "123 Main St" }),
    );
    expect(payload.address).toBeNull();
  });

  it("keeps the address for a hybrid event", () => {
    expect(payloadOf(form({ eventType: "hybrid" })).address).toBe(
      "6100 Willingdon Ave, Burnaby",
    );
  });

  it("converts DST-date times for the payload (overlap → PDT)", () => {
    const payload = payloadOf(
      form({ startDate: "2026-11-01", startTime: "01:30", endTime: "" }),
    );
    expect(payload.event_datetime).toBe("2026-11-01T08:30:00.000Z");
  });
});

describe("validateEventForm rejects", () => {
  it("an empty form, one message per required field", () => {
    expect(errorsOf(EMPTY_EVENT_FORM)).toEqual({
      title: "Add a title.",
      start: "Pick a start date.",
      eventType: "Pick a format.",
      location: "Add a venue name.",
      genre: "Pick a topic.",
      externalLink: "Add a registration or info link.",
    });
  });

  it("a missing start time", () => {
    expect(errorsOf(form({ startTime: "" })).start).toBe("Pick a start time.");
  });

  it("a title shorter than 3 or longer than 200 characters", () => {
    expect(errorsOf(form({ title: " ab " })).title).toBe(
      "The title must be 3 to 200 characters.",
    );
    expect(errorsOf(form({ title: "x".repeat(201) })).title).toBe(
      "The title must be 3 to 200 characters.",
    );
    expect(validateEventForm(form({ title: "abc" })).ok).toBe(true);
    expect(validateEventForm(form({ title: "x".repeat(200) })).ok).toBe(true);
  });

  it("a start time in the spring-forward gap, with the spec's message", () => {
    expect(
      errorsOf(form({ startDate: "2026-03-08", startTime: "02:30", endTime: "" })).start,
    ).toBe(
      "This time does not exist on this date (clocks move forward). Pick another time.",
    );
  });

  it("an end time in the spring-forward gap", () => {
    expect(
      errorsOf(form({ startDate: "2026-03-08", startTime: "01:00", endTime: "02:15" }))
        .end,
    ).toBe(DST_GAP_MESSAGE);
  });

  it("an end before the start", () => {
    expect(errorsOf(form({ endTime: "17:00" })).end).toBe(
      "The end must be after the start.",
    );
  });

  it("an end equal to the start", () => {
    expect(errorsOf(form({ endTime: "18:00" })).end).toBe(
      "The end must be after the start.",
    );
  });

  it("an end date without an end time", () => {
    expect(errorsOf(form({ endDate: "2026-10-04", endTime: "" })).end).toBe(
      "Add an end time, or clear the end date.",
    );
  });

  it("a link that is not http(s)", () => {
    for (const link of [
      "lu.ma/unify",
      "ftp://example.com/event",
      "javascript:alert(1)",
      "mailto:events@unifysocial.ca",
      "https://",
    ]) {
      expect(errorsOf(form({ externalLink: link })).externalLink).toBe(
        "Enter a full link that starts with https:// or http://.",
      );
    }
  });

  it("the Uncategorized topic", () => {
    expect(errorsOf(form({ genre: "Uncategorized" })).genre).toBe("Pick a topic.");
  });

  it("a partner slug that is not in the list", () => {
    expect(errorsOf(form({ partnerSlug: "not-a-partner" })).partnerSlug).toBe(
      "Pick a partner from the list.",
    );
  });

  it("a blank venue", () => {
    expect(errorsOf(form({ location: "   " })).location).toBe("Add a venue name.");
  });
});

describe("options", () => {
  it("offers every topic except Uncategorized", () => {
    expect(EVENT_TOPIC_OPTIONS).not.toContain("Uncategorized");
    expect(EVENT_TOPIC_OPTIONS).toHaveLength(9);
  });

  it("accepts every partner the dropdown offers", () => {
    for (const { slug } of EVENT_PARTNERS) {
      expect(validateEventForm(form({ partnerSlug: slug })).ok).toBe(true);
    }
  });

  it("isHttpUrl accepts http and https only", () => {
    expect(isHttpUrl("https://www.eventbrite.ca/e/123")).toBe(true);
    expect(isHttpUrl("http://example.com")).toBe(true);
    expect(isHttpUrl("example.com")).toBe(false);
  });
});

describe("withEventType", () => {
  it("prefills the venue with Online and hides the address", () => {
    const next = withEventType(form({ location: "" }), "online");
    expect(next.location).toBe(ONLINE_VENUE);
    expect(showsAddress(next.eventType)).toBe(false);
  });

  it("does not overwrite a venue the admin typed", () => {
    expect(withEventType(form({ location: "Zoom" }), "online").location).toBe("Zoom");
  });

  it("clears the prefilled Online venue when the format changes back", () => {
    const online = withEventType(form({ location: "" }), "online");
    const inPerson = withEventType(online, "in-person");
    expect(inPerson.location).toBe("");
    expect(showsAddress(inPerson.eventType)).toBe(true);
  });

  it("keeps the typed address in state while Online is selected", () => {
    const back = withEventType(withEventType(form(), "online"), "hybrid");
    expect(back.address).toBe("6100 Willingdon Ave, Burnaby");
  });
});

describe("visibility hints", () => {
  const NOW = new Date("2026-09-26T19:00:00.000Z"); // Sat, Sep 26 2026, 12:00 PM PDT

  it("says the event is not on unifysocial.ca when neither featured nor partner", () => {
    expect(visibilityHints(form(), NOW).notOnLanding).toBe(NOT_ON_LANDING_HINT);
  });

  it("drops that hint when the event is featured or has a partner", () => {
    expect(visibilityHints(form({ isFeatured: true }), NOW).notOnLanding).toBeNull();
    expect(visibilityHints(form({ partnerSlug: "ey" }), NOW).notOnLanding).toBeNull();
  });

  it("gives no date hint for an event inside the 4-month window", () => {
    expect(visibilityHints(form(), NOW).laterInApps).toBeNull();
  });

  it("gives the appear date for an event more than 4 months ahead", () => {
    const later = form({ startDate: "2027-03-10", startTime: "18:00" });
    expect(visibilityHints(later, NOW).laterInApps).toBe(
      "The apps list events up to 4 months ahead. This event will appear on Tue, Nov 10, 2026.",
    );
  });

  it("gives no date hint while the start is missing or in the DST gap", () => {
    expect(visibilityHints(form({ startDate: "" }), NOW).laterInApps).toBeNull();
    expect(
      visibilityHints(form({ startDate: "2027-03-14", startTime: "02:30" }), NOW)
        .laterInApps,
    ).toBeNull();
  });

  it("appsAppearDate uses the Pacific start date minus 4 months", () => {
    // 2027-02-01 00:30 Pacific is 08:30 UTC; the Pacific date is Feb 1.
    expect(appsAppearDate("2027-02-01T08:30:00.000Z", NOW)).toBe("Thu, Oct 1, 2026");
    expect(appsAppearDate("2026-10-04T01:00:00.000Z", NOW)).toBeNull();
  });
});

describe("mapSaveError", () => {
  it("maps Postgres 23505 to the duplicate-link message", () => {
    expect(
      mapSaveError({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "events_external_link_key"',
      }),
    ).toEqual({ kind: "duplicate", message: DUPLICATE_LINK_MESSAGE });
    expect(DUPLICATE_LINK_MESSAGE).toBe("An event with this link already exists.");
  });

  it("maps any other code, or no code, to the generic message", () => {
    for (const error of [
      { code: "42501", message: "new row violates row-level security policy" },
      { code: "PGRST116" },
      new Error("Failed to fetch"),
      "boom",
      null,
    ]) {
      expect(mapSaveError(error)).toEqual({
        kind: "generic",
        message: SAVE_FAILED_MESSAGE,
      });
    }
    expect(SAVE_FAILED_MESSAGE).toBe(
      "Could not save. Your account may not have admin access.",
    );
  });
});

/* ---- Edit (#145) -------------------------------------------------------- */

const SAVED_AT = new Date("2026-09-27T20:15:00.000Z");

/** The row a form would have stored, as the edit page reads it back. */
function detailFrom(
  payload: EventInsertPayload,
  overrides: Partial<AdminEventDetail> = {},
): AdminEventDetail {
  return {
    id: 42,
    title: payload.title,
    description: payload.description,
    eventDatetime: payload.event_datetime,
    eventEndDatetime: payload.event_end_datetime,
    eventType: payload.event_type,
    location: payload.location,
    address: payload.address,
    hostedBy: payload.hosted_by,
    genre: payload.genre,
    externalLink: payload.external_link,
    coverPhotoUrl: null,
    partnerSlug: payload.partner_slug,
    isFeatured: payload.is_featured,
    source: null,
    ...overrides,
  };
}

const FORBIDDEN_UPDATE_COLUMNS = ["id", "source", "created_at", "max_attendees"];

describe("eventToFormState (edit prefill)", () => {
  it("prefills every field from a stored row, in Pacific time", () => {
    const state = eventToFormState(detailFrom(payloadOf(form())));
    expect(state).toEqual({ ...form(), endDate: "" });
  });

  it("round-trips a saved form to the same payload", () => {
    for (const overrides of [
      {},
      { partnerSlug: "rbc", isFeatured: true, hostedBy: "", description: "" },
      { eventType: "online" as const, location: "Online", address: "" },
      { endDate: "2026-10-05", endTime: "10:00" },
      { endTime: "" },
    ]) {
      const payload = payloadOf(form(overrides));
      expect(payloadOf(eventToFormState(detailFrom(payload)))).toEqual(payload);
    }
  });

  it("round-trips every non-gap start time on both DST dates and a normal date", () => {
    for (const date of ["2026-03-08", "2026-11-01", "2026-06-10"]) {
      for (let minutes = 0; minutes < 24 * 60; minutes += 15) {
        const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
          minutes % 60,
        ).padStart(2, "0")}`;
        if (!pacificWallTimeToUtc(date, time).ok) continue; // the spring-forward gap
        const saved = payloadOf(
          form({ startDate: date, startTime: time, endDate: "", endTime: "" }),
        );
        const state = eventToFormState(detailFrom(saved));
        expect(state.startDate).toBe(date);
        expect(state.startTime).toBe(time);
        expect(payloadOf(state).event_datetime).toBe(saved.event_datetime);
      }
    }
  });

  it("keeps the fall-back overlap on the earlier (PDT) occurrence", () => {
    const state = eventToFormState(
      detailFrom(payloadOf(form()), {
        eventDatetime: "2026-11-01T08:30:00.000Z", // 01:30 PDT
        eventEndDatetime: "2026-11-01T10:30:00.000Z", // 02:30 PST
      }),
    );
    expect(state).toMatchObject({
      startDate: "2026-11-01",
      startTime: "01:30",
      endDate: "",
      endTime: "02:30",
    });
    expect(payloadOf(state).event_datetime).toBe("2026-11-01T08:30:00.000Z");
  });

  it("fills the end date only when the event ends on a later Pacific day", () => {
    const sameDay = eventToFormState(
      detailFrom(payloadOf(form()), {
        eventDatetime: "2026-10-04T01:00:00.000Z",
        eventEndDatetime: "2026-10-04T06:59:00.000Z", // 23:59 Pacific, Oct 3
      }),
    );
    expect(sameDay).toMatchObject({ endDate: "", endTime: "23:59" });

    const nextDay = eventToFormState(
      detailFrom(payloadOf(form()), {
        eventEndDatetime: "2026-10-04T07:30:00.000Z", // 00:30 Pacific, Oct 4
      }),
    );
    expect(nextDay).toMatchObject({ endDate: "2026-10-04", endTime: "00:30" });
  });

  it("leaves a format or topic the form does not offer unset, and nulls as empty", () => {
    const state = eventToFormState(
      detailFrom(payloadOf(form()), {
        eventType: "In Person",
        genre: "Uncategorized",
        description: null,
        address: null,
        hostedBy: null,
        eventEndDatetime: null,
      }),
    );
    expect(state).toMatchObject({
      eventType: "",
      genre: "",
      description: "",
      address: "",
      hostedBy: "",
      endDate: "",
      endTime: "",
    });
    expect(errorsOf(state)).toEqual({
      eventType: "Pick a format.",
      genre: "Pick a topic.",
    });
  });
});

describe("buildTeamEventUpdate", () => {
  function updateOf(state: EventFormState) {
    const result = buildTeamEventUpdate(state, SAVED_AT);
    if (!result.ok) {
      throw new Error(`expected a valid form, got ${JSON.stringify(result.errors)}`);
    }
    return result.payload;
  }

  it("builds the insert fields without source, plus updated_at", () => {
    const { source: _source, ...insertFields } = payloadOf(form());
    void _source;
    expect(updateOf(form())).toEqual({
      ...insertFields,
      updated_at: "2026-09-27T20:15:00.000Z",
    });
  });

  it("uses only granted columns: never id, source, created_at or max_attendees", () => {
    const payload = updateOf(form({ isFeatured: true, partnerSlug: "rbc" }));
    for (const key of Object.keys(payload)) {
      expect(EVENT_UPDATABLE_COLUMNS).toContain(key);
    }
    for (const column of FORBIDDEN_UPDATE_COLUMNS) {
      expect(column in payload).toBe(false);
    }
    expect(payload.updated_at).toBe(SAVED_AT.toISOString());
  });

  it("saves a null address for an Online event (same rule as create)", () => {
    const payload = updateOf(
      form({ eventType: "online", location: "Online", address: "Somewhere 1" }),
    );
    expect(payload.address).toBeNull();
  });

  it("rejects the same things create rejects", () => {
    const result = buildTeamEventUpdate(
      form({ title: "", endTime: "17:00", genre: "Uncategorized" as never }),
      SAVED_AT,
    );
    expect(result).toEqual({
      ok: false,
      errors: {
        title: "Add a title.",
        end: "The end must be after the start.",
        genre: "Pick a topic.",
      },
    });
  });
});

describe("buildCrawlerEventUpdate", () => {
  it("contains exactly is_featured, partner_slug and updated_at", () => {
    const result = buildCrawlerEventUpdate(
      { isFeatured: true, partnerSlug: "sfu" },
      SAVED_AT,
    );
    expect(result).toEqual({
      ok: true,
      payload: {
        is_featured: true,
        partner_slug: "sfu",
        updated_at: "2026-09-27T20:15:00.000Z",
      },
    });
    if (!result.ok) return;
    expect(Object.keys(result.payload).sort()).toEqual([
      "is_featured",
      "partner_slug",
      "updated_at",
    ]);
  });

  it("stores no partner as null", () => {
    const result = buildCrawlerEventUpdate(
      { isFeatured: false, partnerSlug: "  " },
      SAVED_AT,
    );
    expect(result.ok && result.payload.partner_slug).toBeNull();
  });

  it("rejects a partner slug that is not in the list", () => {
    expect(
      buildCrawlerEventUpdate({ isFeatured: false, partnerSlug: "acme" }, SAVED_AT),
    ).toEqual({ ok: false, errors: { partnerSlug: "Pick a partner from the list." } });
  });
});

describe("EVENT_UPDATABLE_COLUMNS", () => {
  it("matches the live per-column UPDATE grant", () => {
    expect([...EVENT_UPDATABLE_COLUMNS].sort()).toEqual(
      [
        "title",
        "description",
        "event_datetime",
        "event_end_datetime",
        "location",
        "address",
        "event_type",
        "hosted_by",
        "genre",
        "cover_photo_url",
        "external_link",
        "is_featured",
        "partner_slug",
        "updated_at",
      ].sort(),
    );
    for (const column of FORBIDDEN_UPDATE_COLUMNS) {
      expect(EVENT_UPDATABLE_COLUMNS).not.toContain(column);
    }
  });
});

describe("parseEventId", () => {
  it("accepts a positive integer id", () => {
    expect(parseEventId("959")).toBe(959);
    expect(parseEventId("1")).toBe(1);
  });

  it("rejects anything else", () => {
    for (const raw of [
      "0",
      "-3",
      "007",
      "1.5",
      "12abc",
      "abc",
      "",
      " 12",
      "99999999999999999999",
      undefined,
      ["12"],
    ]) {
      expect(parseEventId(raw)).toBeNull();
    }
  });
});
