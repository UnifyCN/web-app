import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { isAdminPermission } from "@/lib/admin/access";

export const metadata: Metadata = {
  title: "Admin — Unify",
  robots: { index: false, follow: false },
};

/**
 * Gate for every /admin page: a non-admin gets the 404 page, so the section does
 * not reveal that it exists.
 *
 * This is a UX gate, not a security boundary (same principle as proxy.ts). RLS owns
 * data access: the writes that matter go through the `public.is_admin()` policies in
 * supabase/migrations/20260926120000_events_admin.sql, whatever this check says.
 *
 * Local dev without Supabase env vars passes through (as proxy.ts does), so the admin
 * UI can be viewed; its list is empty in that case. A production build never passes
 * through without a real admin check.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV === "production") notFound();
    return children;
  }

  const supabase = await createClient();
  // getUser (not getSession) on the server: it validates the token with the auth
  // server instead of trusting the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data, error } = await supabase
    .from("users")
    .select("permissions")
    .eq("id", user.id)
    .maybeSingle();
  if (error) console.error("admin gate: users query failed", error);
  if (!isAdminPermission(data?.permissions)) notFound();

  return children;
}
