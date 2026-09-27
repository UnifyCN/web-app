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

/**
 * Data access for the admin events list (/admin/events).
 *
 * Reads `public.events` under the signed-in user's RLS, like every other service. The
 * existing select policy lets any signed-in user read events, so this read needs no
 * admin policy; writes (later slices) go through the `public.is_admin()` policies.
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
