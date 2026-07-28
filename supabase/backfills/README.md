# supabase/backfills/

One-off **data** fixes. Not schema, not a migration sequence.

`supabase/migrations/` is for DDL that every environment must converge on. Files here
are the opposite: they repair rows in a specific database at a specific moment, they
are applied once by hand, and nothing replays them. Keeping them out of `migrations/`
stops them from being picked up by any migration runner.

Conventions, mirroring `migrations/`:

- Name `<timestamp>_<what>.sql`, so the folder reads chronologically.
- Open with a header comment covering **why the fix is needed**, **how the values were
  derived**, the **scope guard** that bounds what it touches, and **how to revert**.
- Carry a `STATUS:` line stating whether it has been applied, and to which project.
  Update it when it runs — a backfill nobody can tell the state of is worse than none.
- Prefer statements that are safe to re-run (guard on the pre-fix value), so a second
  run is a no-op rather than a second mutation.
- Apply by hand in the Dashboard SQL editor. The MCP servers are read-only and
  `supabase db push` is unsafe against this project's drifted history.

Anything touching the shared production DB `wrbauxutkysljmsqojts` also carries the
usual caution: live mobile + web users, so scope guards are mandatory and destructive
statements need sign-off.
