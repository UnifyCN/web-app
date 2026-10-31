import { API_URL, SERVICE_ROLE_KEY, sleep, sql } from './support.ts';
import { readyPush } from './pushSupport.ts';
export const PROFILE_UP = new URL('../../migrations/20261031055422_companion_profile_changes.sql', import.meta.url);
export const PROFILE_DOWN = new URL('../../rollbacks/20261031055422_companion_profile_changes.down.sql', import.meta.url);
export async function readyProfile() {
  await readyPush();
  if (!(await sql`select to_regprocedure('public.companion_read_profile(uuid)') is not null present`)[0].present) {
    await sql.begin(async tx => tx.unsafe(await Deno.readTextFile(PROFILE_UP)));
  }
  for (let i=0; i<100; i++) {
    const r = await fetch(API_URL+'/rest/v1/', { headers: { apikey: SERVICE_ROLE_KEY, authorization: 'Bearer '+SERVICE_ROLE_KEY } });
    if ('/rpc/companion_read_profile' in ((await r.json()).paths??{})) return;
    await sleep(50);
  }
  throw Error('profile schema cache unavailable');
}
