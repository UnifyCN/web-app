import {
  createClient,
  getAuthUserId,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import {
  notEndedFilter,
  upcomingSoonestFirst,
  type AdminEvent,
} from "@/lib/admin/eventList";
import {
  UNIQUE_VIOLATION,
  type AdminEventDetail,
  type CrawlerEventUpdatePayload,
  type EventInsertPayload,
  type TeamEventUpdatePayload,
} from "@/lib/admin/eventForm";

/**
 * Data access for the admin events list (/admin/events).
 *
 * Reads `public.events` under the signed-in user's RLS, like every other service. The
 * existing select policy lets any signed-in user read events, so this read needs no
 * admin policy; writes go through the `public.is_admin()` policies.
 *
 * Unlike the community services there is NO mock fallback: when Supabase is not
 * configured (local dev without env vars) or nobody is signed in, the list is empty.
 * A staff tool that shows invented events would invite someone to act on them.
 */

interface AdminEventRow {
  id: number;
  title: string;
  event_datetime: string;
  event_end_datetime: string | null;
  event_type: string;
  location: string;
  partner_slug: string | null;
  is_featured: boolean | null;
  source: string | null;
}

const ADMIN_EVENT_COLUMNS =
  "id, title, event_datetime, event_end_datetime, event_type, location, partner_slug, is_featured, source";

function rowToAdminEvent(row: AdminEventRow): AdminEvent {
  return {
    id: row.id,
    title: row.title,
    eventDatetime: row.event_datetime,
    eventEndDatetime: row.event_end_datetime,
    eventType: row.event_type,
    location: row.location,
    partnerSlug: row.partner_slug,
    isFeatured: row.is_featured === true,
    source: row.source,
  };
}

/** Every event that has not ended (both tabs), soonest first. */
export async function getAdminEvents(): Promise<AdminEvent[]> {
  if (!isSupabaseConfigured()) return [];

  const userId = await getAuthUserId();
  if (!userId) return [];

  const now = new Date();
  const { data, error } = await createClient()
    .from("events")
    .select(ADMIN_EVENT_COLUMNS)
    .or(notEndedFilter(now))
    .order("event_datetime", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;

  // The database already filters and sorts; the pure pass keeps the rule in one
  // tested place and drops any row with an unparseable date.
  return upcomingSoonestFirst((data as AdminEventRow[]).map(rowToAdminEvent), now);
}

/**
 * Thrown by createAdminEvent when the insert fails on the unique `external_link`
 * (Postgres 23505). Keeps the code, so mapSaveError still reads it, and carries the
 * id of the event that already has the link (null when the lookup finds none).
 */
export class DuplicateEventLinkError extends Error {
  readonly code = UNIQUE_VIOLATION;
  constructor(readonly existingEventId: number | null) {
    super("An event with this link already exists.");
    this.name = "DuplicateEventLinkError";
  }
}

/** The id of the event whose `external_link` is exactly `link`, or null. */
export async function findEventIdByExternalLink(
  link: string,
): Promise<number | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await createClient()
    .from("events")
    .select("id")
    .eq("external_link", link)
    .maybeSingle();
  if (error) throw error;
  return (data as { id: number } | null)?.id ?? null;
}

/**
 * Inserts a team event (the payload comes from validateEventForm, so `source` is
 * null, as the insert policy requires) and returns its id.
 *
 * `.select("id").single()` makes an insert that RLS blocks throw instead of
 * returning nothing. A duplicate link throws DuplicateEventLinkError with the id of
 * the existing event; every other failure throws the PostgREST error as is.
 */
export async function createAdminEvent(
  payload: EventInsertPayload,
): Promise<number> {
  if (!isSupabaseConfigured()) {
    throw new Error("createAdminEvent: Supabase is not configured");
  }
  const userId = await getAuthUserId();
  if (!userId) throw new Error("createAdminEvent: no auth session");

  const { data, error } = await createClient()
    .from("events")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      // Best effort: the message still shows without the link if this fails.
      const existingEventId = await findEventIdByExternalLink(
        payload.external_link,
      ).catch(() => null);
      throw new DuplicateEventLinkError(existingEventId);
    }
    throw error;
  }
  return (data as { id: number }).id;
}

/* ---- One event: read, update, delete (#145) ----------------------------- */

interface AdminEventDetailRow {
  id: number;
  title: string;
  description: string | null;
  event_datetime: string;
  event_end_datetime: string | null;
  event_type: string;
  location: string;
  address: string | null;
  hosted_by: string | null;
  genre: string | null;
  external_link: string;
  cover_photo_url: string | null;
  partner_slug: string | null;
  is_featured: boolean | null;
  source: string | null;
}

const ADMIN_EVENT_DETAIL_COLUMNS =
  "id, title, description, event_datetime, event_end_datetime, event_type, location, address, hosted_by, genre, external_link, cover_photo_url, partner_slug, is_featured, source";

function rowToAdminEventDetail(row: AdminEventDetailRow): AdminEventDetail {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    eventDatetime: row.event_datetime,
    eventEndDatetime: row.event_end_datetime,
    eventType: row.event_type,
    location: row.location,
    address: row.address,
    hostedBy: row.hosted_by,
    genre: row.genre,
    externalLink: row.external_link,
    coverPhotoUrl: row.cover_photo_url,
    partnerSlug: row.partner_slug,
    isFeatured: row.is_featured === true,
    source: row.source,
  };
}

/**
 * One event by id, or null when no row has that id (or Supabase is not configured,
 * or nobody is signed in: the edit page then shows its not-found state).
 */
export async function getAdminEvent(id: number): Promise<AdminEventDetail | null> {
  if (!isSupabaseConfigured()) return null;
  const userId = await getAuthUserId();
  if (!userId) return null;

  const { data, error } = await createClient()
    .from("events")
    .select(ADMIN_EVENT_DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToAdminEventDetail(data as AdminEventDetailRow) : null;
}

/**
 * Updates a team row (`source is null`) with the full edit payload from
 * buildTeamEventUpdate. `.is("source", null)` keeps a team update off crawler rows
 * even if a caller mixes them up.
 *
 * `.select("id")` returns the updated rows, so an update that RLS blocks or that
 * matches nothing (0 rows) throws instead of silently succeeding (the
 * deleteDiscussion pattern). A link that collides with another event throws
 * DuplicateEventLinkError, as create does.
 */
export async function updateTeamEvent(
  id: number,
  payload: TeamEventUpdatePayload,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error("updateTeamEvent: Supabase is not configured");
  }
  const userId = await getAuthUserId();
  if (!userId) throw new Error("updateTeamEvent: no auth session");

  const { data, error } = await createClient()
    .from("events")
    .update(payload)
    .eq("id", id)
    .is("source", null)
    .select("id");

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      const existingEventId = await findEventIdByExternalLink(
        payload.external_link,
      ).catch(() => null);
      throw new DuplicateEventLinkError(
        existingEventId === id ? null : existingEventId,
      );
    }
    throw error;
  }
  if (!data || data.length === 0) {
    throw new Error("updateTeamEvent: event not found or not allowed");
  }
}

/**
 * Updates a crawler row. The payload (from buildCrawlerEventUpdate) holds only
 * `is_featured`, `partner_slug` and `updated_at`, so the crawler's own fields are
 * never changed. Throws on 0 rows, like updateTeamEvent.
 */
export async function updateCrawlerEvent(
  id: number,
  payload: CrawlerEventUpdatePayload,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error("updateCrawlerEvent: Supabase is not configured");
  }
  const userId = await getAuthUserId();
  if (!userId) throw new Error("updateCrawlerEvent: no auth session");

  const { data, error } = await createClient()
    .from("events")
    .update(payload)
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("updateCrawlerEvent: event not found or not allowed");
  }
}

/**
 * Hard-deletes a team row. The delete policy only allows `source is null`, and the
 * filter says the same, so a crawler row is never deleted (it would come back on
 * the crawler's next run). The only foreign key, `event_translations`, cascades.
 * Throws on 0 rows (RLS block, crawler row, or already gone).
 */
export async function deleteTeamEvent(id: number): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error("deleteTeamEvent: Supabase is not configured");
  }
  const userId = await getAuthUserId();
  if (!userId) throw new Error("deleteTeamEvent: no auth session");

  const { data, error } = await createClient()
    .from("events")
    .delete()
    .eq("id", id)
    .is("source", null)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("deleteTeamEvent: event not found or not allowed");
  }
}
