// Added after the merge. Compare complete live definitions, signatures and grants.
import { assertEquals } from 'jsr:@std/assert@1';
import {
  MIGRATION, migrate, migrate363, migrate364, migrate365, migrate366, migrate367,
  migrate370, openGate, ready, sql, testOpts, waitForSchemaCache,
} from './support.ts';

await ready();

async function schema() {
  const functions = [...await sql`select p.oid::regprocedure::text as signature,
    pg_get_functiondef(p.oid) as definition, coalesce(p.proacl::text, '') as acl,
    has_function_privilege('anon', p.oid, 'execute') as anon,
    has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
    has_function_privilege('service_role', p.oid, 'execute') as service_role
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'companion%' order by 1`];
  const kinds = [...await sql`select pg_get_constraintdef(oid) as definition from pg_constraint
    where conname = 'companion_proposals_kind_check'`];
  const tables = [...await sql`select c.relname, c.relrowsecurity, coalesce(c.relacl::text,'') as acl
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'companion_saved_details'`];
  return { functions, kinds, tables };
}

Deno.test({
  name: '#367 down restores #370 definitions and grants; #370 down restores #365; both up stages restore exact definitions and grants',
  ...testOpts,
  fn: async () => {
    // Fails if a signature, full definition, raw ACL, effective execute privilege,
    // saved-detail SELECT privilege, RLS flag or proposal kind differs at any stage.
    await migrate('down');
    await sql.begin(async tx => await tx.unsafe(await Deno.readTextFile(MIGRATION)));
    await waitForSchemaCache('up361');
    await migrate363('up');
    await migrate364('up');
    await migrate366('up');
    await migrate365('up');
    const at365 = await schema();
    await migrate370('up');
    const at370 = await schema();
    await migrate367('up');
    const at367 = await schema();
    await migrate367('down');
    const down367 = await schema();
    assertEquals(down367, at370, '#367 rollback changed #370 definitions or privileges');
    await migrate370('down');
    const down370 = await schema();
    assertEquals(down370, at365, '#370 rollback changed #365 definitions or privileges');
    await migrate370('up');
    const reapplied370 = await schema();
    assertEquals(reapplied370, at370, '#370 reapplication changed definitions or privileges');
    await migrate367('up');
    const reapplied367 = await schema();
    assertEquals(reapplied367, at367, '#367 reapplication changed definitions or privileges');
    await openGate();
    const output = Deno.env.get('ACTIONS_COMPOSITION_EVIDENCE');
    if (output) await Deno.writeTextFile(output, JSON.stringify({ at365, at370, at367, down367, down370, reapplied370, reapplied367 }, null, 2)+'\n');
  },
});
