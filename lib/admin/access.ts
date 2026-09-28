/**
 * Who counts as an admin in the web app: a `public.users` row with
 * `permissions = 'admin'` (the column is a single text value, checked in
 * ('admin', 'partner', 'user')). getCurrentUser() exposes it as a string array.
 *
 * This decides only what the UI shows. The database is the security boundary: the
 * `public.is_admin()` RLS policies in
 * supabase/migrations/20260926120000_events_admin.sql apply the same rule to writes.
 */
export const ADMIN_PERMISSION = "admin";

export function isAdminPermission(
  permissions: string | readonly string[] | null | undefined,
): boolean {
  if (permissions == null) return false;
  if (typeof permissions === "string") return permissions === ADMIN_PERMISSION;
  return permissions.includes(ADMIN_PERMISSION);
}
