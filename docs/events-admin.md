# Events admin — runbook

Unify team members with admin access add, edit, delete, and feature events in the web
app. One saved event shows on all three surfaces: the web app (`/community`), the
mobile app, and unifysocial.ca (`/events`). Spec: UnifyCN/web-app#142.

## Grant access

The person must sign up in the Unify app first, so that they have a `public.users` row.
Then run this in the Supabase SQL editor (project `wrbauxutkysljmsqojts`):

```sql
update public.users set permissions = 'admin' where email = '<their Unify account email>';
```

Check the result: the editor must report **1 row** changed. If it reports 0 rows, the
email is wrong or they have not signed up yet.

Note: on mobile, `admin` also lets a user delete and pin any post. Give it to Unify staff
only.

## Revoke access

```sql
update public.users set permissions = 'user' where email = '<their Unify account email>';
```

The change applies to the next request they make. The database refuses their writes at
once; the admin pages return 404 when they next load one.

## Where to go

- Web app → **Settings** → **Events admin**. The link shows only for admins.
- Or go straight to `/admin/events`. For a user who is not an admin, this page is a 404.

## What shows where

| Surface | What it shows | When a saved change appears |
|---|---|---|
| Unify apps (web `/community`, mobile) | Every event that starts in the next 4 months | Web: at once for you, within 1 minute for others. Mobile: within 2 minutes, or on the next app start |
| unifysocial.ca `/events` | Only events that are **featured** or have a **partner** set, within 4 months | Within about 5 minutes |

The list at `/admin/events` has two tabs:

- **Added by team** (selected first): events the team added. The team can edit and delete them.
- **From partners**: events the weekly crawler added (every Monday). The team can only
  feature them or change their partner. The team cannot delete them, because the crawler
  adds them again on its next run.

Every date and time in the admin pages is Pacific time.

## Cover photos

A team event can have one optional cover photo: JPEG, PNG, or WebP, up to 5 MB. It
shows at 16:9. The photo uploads when you click Save, not when you pick it.

- Files go to the public Storage bucket `event-covers` as `<uuid>.<ext>`. The event
  stores the public URL in `cover_photo_url`.
- When you replace or remove a cover, or delete a team event, the app also removes the
  old file from `event-covers`. If that cleanup fails, the save still succeeds; the old
  file stays in the bucket.
- The app never removes an image that is not in `event-covers` (for example, a
  crawler event's image from a partner website).

## One-time setup (Savar)

1. Run the Step 0 live-schema queries from the PR that added this feature, and paste the
   output on that PR.
2. Apply `supabase/migrations/20260926120000_events_admin.sql` in the SQL editor
   (`db push` is unsafe against the drifted migration history).
3. Replace the placeholders in `supabase/checks/events_admin_rls.sql` and run it. It
   rolls back, so it writes nothing.
4. Grant admin to the team members (above).
