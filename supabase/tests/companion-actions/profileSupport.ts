import { API_URL, SERVICE_ROLE_KEY, sleep, sql } from './support.ts';
import { readyPush } from './pushSupport.ts';
export const PROFILE_UP = new URL('../../migrations/20261031055422_companion_profile_changes.sql', import.meta.url);
export const PROFILE_DOWN = new URL('../../rollbacks/20261031055422_companion_profile_changes.down.sql', import.meta.url);
export async function waitProfileSchema(present: boolean) {
  const observations: { schema: boolean; status: number; bytes: number }[] = [];
  let stable = 0;
  for (let i=0; i<100; i++) {
    const headers = { apikey: SERVICE_ROLE_KEY, authorization: 'Bearer '+SERVICE_ROLE_KEY };
    const schema = await fetch(API_URL+'/rest/v1/', { headers });
    const found = '/rpc/companion_read_profile' in ((await schema.json()).paths??{});
    const response = await fetch(API_URL+'/rest/v1/rpc/companion_read_profile', {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ p_user_id: '00000000-0000-0000-0000-000000000000' }),
    });
    const body = await response.text();
    observations.push({ schema: found, status: response.status, bytes: new TextEncoder().encode(body).length });
    const matches = found === present && (present ? response.status === 200 && body === 'null' :
      response.status === 404 && JSON.parse(body).code === 'PGRST202');
    stable = matches ? stable + 1 : 0;
    if (stable >= 3) { console.log(JSON.stringify({ kind: 'profile_schema_ready', present, observations })); return; }
    await sleep(50);
  }
  throw Error('profile schema cache unavailable: '+JSON.stringify({ present, observations }));
}
export async function readyProfile() {
  await readyPush();
  if (!(await sql`select to_regprocedure('public.companion_read_profile(uuid)') is not null present`)[0].present) {
    await sql.begin(async tx => tx.unsafe(await Deno.readTextFile(PROFILE_UP)));
  }
  await waitProfileSchema(true);
}
