// Explicit owned-stack fixture reset between vertical migration slices. Not a product test.
import { sql } from './support.ts';
import { PROFILE_DOWN, waitProfileSchema } from './profileSupport.ts';
if ((await sql`select to_regprocedure('public.companion_read_profile(uuid)') is not null present`)[0].present) {
  await sql.begin(async tx => tx.unsafe(await Deno.readTextFile(PROFILE_DOWN)));
  await waitProfileSchema(false);
}
await sql.end();
