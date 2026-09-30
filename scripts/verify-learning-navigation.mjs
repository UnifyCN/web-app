// Production Next.js fixture: the real proxy, isolated fake Supabase, no accounts.
// Set PLAYWRIGHT_MODULE to an installed playwright package if it is not local.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = await mkdtemp(join(tmpdir(), "unify-learning-runtime-"));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const cookieName = "unify_learning_destination";
const section = "/learn/9717e260-bdeb-4ee4-8d39-4159a48eb627/3d5abe49-8616-48f8-a857-b80317ddeb35";
const port = Number(process.env.LEARNING_TEST_PORT || 4347);
const origin = `http://localhost:${port}`;
let server;
let browser;

async function run(args) {
  const child = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), ...args], {
    cwd: fixture, stdio: "inherit", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SUPABASE_URL: "https://fixture.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-public-key" },
  });
  await new Promise((ok, fail) => { child.on("error", fail); child.on("exit", code => code === 0 ? ok() : fail(new Error(`next exited ${code}`))); });
}

try {
  await mkdir(join(fixture, "app/[[...path]]"), { recursive: true });
  await mkdir(join(fixture, "lib"));
  await mkdir(join(fixture, "lib/supabase"));
  await mkdir(join(fixture, "components/layout"), { recursive: true });
  await mkdir(join(fixture, "app/api/learning-destination"), { recursive: true });
  await symlink(join(root, "node_modules"), join(fixture, "node_modules"), "dir");
  await writeFile(join(fixture, "package.json"), JSON.stringify({ name: "learning-runtime-fixture", private: true }));
  await cp(process.env.LEARNING_PROXY_SOURCE || join(root, "proxy.ts"), join(fixture, "proxy.ts"));
  await cp(join(root, "lib/learningDestination.ts"), join(fixture, "lib/learningDestination.ts"));
  await cp(join(root, "lib/recoveryPending.ts"), join(fixture, "lib/recoveryPending.ts"));
  await cp(join(root, "lib/supabase/server.ts"), join(fixture, "lib/supabase/server.ts"));
  await cp(join(root, "components/layout/LearningDestinationNavigation.tsx"), join(fixture, "components/layout/LearningDestinationNavigation.tsx"));
  await cp(join(root, "app/api/learning-destination/route.ts"), join(fixture, "app/api/learning-destination/route.ts"));
  await writeFile(join(fixture, "tsconfig.json"), JSON.stringify({ compilerOptions: { paths: { "@/*": ["./*"] }, esModuleInterop: true, strict: true, skipLibCheck: true }, exclude: ["node_modules"] }));
  await writeFile(join(fixture, "next.config.mjs"), `export default { webpack(config) { config.resolve.alias['@supabase/ssr'] = ${JSON.stringify(join(fixture, "fake-supabase.js"))}; return config; } };`);
  await writeFile(join(fixture, "fake-supabase.js"), `export function createServerClient(url, key, options) {
    const cookies = Object.fromEntries(options.cookies.getAll().map(c => [c.name, c.value]));
    return { auth: { getUser: async () => ({ data: { user: cookies['fixture-auth'] === 'yes' ? { id: 'fixture-user' } : null } }) },
      from: table => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ error: cookies['fixture-error'] === 'yes' ? new Error('fixture outage') : null, data: table === 'users' ? { privacy_policy_accepted_at: cookies['fixture-consent'] === 'yes' ? 'accepted' : null } : { onboarding_completed: cookies['fixture-onboard'] === 'yes' } }) }) }) }) };
  }`);
  await writeFile(join(fixture, "app/layout.tsx"), `import {LearningDestinationNavigation} from '../components/layout/LearningDestinationNavigation'; export default function Layout({ children }: {children: React.ReactNode}) { return <html><body><LearningDestinationNavigation/>{children}</body></html>; }`);
  await writeFile(join(fixture, "app/[[...path]]/page.tsx"), `import Controls from '../controls'; export const dynamic = 'force-dynamic'; export default function Page() { return <Controls/>; }`);
  await writeFile(join(fixture, "app/controls.tsx"), `'use client';
    import Link from 'next/link'; import { usePathname, useRouter } from 'next/navigation'; import {useState} from 'react';
    export default function Controls() { const router = useRouter(); const path = usePathname(); const [links, show] = useState(false); return <main>
      <h1>{path}</h1><button onClick={() => show(true)}>Show shell links</button>
      {links && <><Link prefetch={true} href='/community'>Community</Link><Link prefetch={true} href='/home'>Home</Link></>}
      <button onClick={() => router.prefetch('/community')}>Prefetch community</button>
      <button onClick={() => router.prefetch('/home')}>Prefetch home</button>
      <button onClick={() => router.replace('/home')}>Finish setup</button>
      <button onClick={() => router.push('/community')}>Open community</button>
      <button onClick={() => router.replace('/welcome')}>Open welcome</button>
    </main>; }`);
  await run(["build", "--webpack"]);
  server = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "start", "--port", String(port), "--hostname", "127.0.0.1"], { cwd: fixture, stdio: "inherit", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SUPABASE_URL: "https://fixture.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-public-key" } });
  for (let i = 0; i < 100; i++) { try { await fetch(origin); break; } catch { await new Promise(ok => setTimeout(ok, 100)); } }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const setFlags = async (auth, consent, onboard) => {
    await context.clearCookies({ name: /^unify_(consented|onboarded)$/ });
    await context.addCookies(Object.entries({ 'fixture-auth': auth, 'fixture-consent': consent, 'fixture-onboard': onboard }).map(([name, value]) => ({ name, value: value ? 'yes' : 'no', url: origin })));
  };
  const pending = async () => (await context.cookies()).find(cookie => cookie.name === cookieName)?.value;
  const waitForConsumption = async () => {
    for (let i = 0; i < 100 && await pending(); i++) await new Promise(ok => setTimeout(ok, 50));
    assert.equal(await pending(), undefined);
  };
  const background = await context.newPage();
  const setup = await context.newPage();
  await setFlags(true, true, true);
  await background.goto(`${origin}/other`);
  for (const target of ['community', 'home']) {
    await setFlags(false, false, false);
    await setup.goto(origin + section);
    assert.equal(new URL(setup.url()).pathname, '/welcome');
    assert.ok(await pending(), 'CTA should create pending intent');
    await setFlags(true, true, true);
    const requestPromise = background.waitForRequest(request => new URL(request.url()).pathname === '/' + target && request.headers()['next-router-prefetch'] === '1');
    const responsePromise = background.waitForResponse(response => new URL(response.url()).pathname === '/' + target);
    await background.getByRole('button', { name: 'Prefetch ' + target }).click();
    const request = await requestPromise;
    const response = await responsePromise;
    await response.finished();
    console.log(JSON.stringify({ scenario: 'background-tab-prefetch', target, headers: { rsc: request.headers().rsc, prefetch: request.headers()['next-router-prefetch'], purpose: request.headers().purpose || null }, status: response.status(), intentRetained: Boolean(await pending()) }));
    if (process.env.REPRODUCE_BEFORE_FIX) continue;
    assert.ok(await pending(), `background ${target} prefetch must retain intent`);
    await setup.getByRole('button', {name: 'Finish setup'}).click();
    await setup.waitForURL(origin + section);
    await waitForConsumption();
    await background.reload();
  }
  if (!process.env.REPRODUCE_BEFORE_FIX) {
    // Return through auth to the same path as the tab's initial document.
    // The acknowledgement tracker must survive main/auth route-group changes.
    await background.goto(origin + '/home');
    await setFlags(false, false, false);
    await background.getByRole('button', {name: 'Open welcome'}).click();
    await background.waitForURL(origin + '/welcome');
    await setup.goto(origin + section);
    await setFlags(true, true, true);
    await background.getByRole('button', {name: 'Finish setup'}).click();
    await background.waitForURL(origin + section);
    await waitForConsumption();
    console.log('Initial /home document → client auth → /home resumes new cross-tab intent.');

    // A payload cached before another tab enters the CTA must use fresh state.
    await background.goto(origin + '/other');
    const cached = background.waitForResponse(response => new URL(response.url()).pathname === '/home');
    await background.getByRole('button', {name: 'Prefetch home'}).click();
    await (await cached).finished();
    await setFlags(false, false, false);
    await setup.goto(origin + section);
    await setFlags(true, true, true);
    await background.getByRole('button', {name: 'Finish setup'}).click();
    await background.waitForURL(origin + section);
    await waitForConsumption();
    console.log('Stale cached Flight payload uses fresh cross-tab intent.');

    // Real client navigation to another feature cancels the interrupted flow.
    await background.goto(origin + '/other');
    await setFlags(false, false, false);
    await setup.goto(origin + section);
    await setFlags(true, true, true);
    const cancelDocument = background.waitForRequest(request => request.isNavigationRequest() && new URL(request.url()).pathname === '/community');
    await background.getByRole('button', {name: 'Open community'}).click();
    await cancelDocument;
    await waitForConsumption();
    assert.equal(new URL(background.url()).pathname, '/community');
    console.log('Deliberate client navigation cancels intent after mounting.');

    // Consent, onboarding, loss of session, and reauthentication still gate.
    await setFlags(false, false, false);
    await setup.goto(origin + section);
    await setFlags(true, false, false);
    await setup.getByRole('button', {name: 'Finish setup'}).click();
    await setup.waitForURL(origin + '/before-you-continue');
    assert.ok(await pending());
    await setFlags(true, true, false);
    await setup.getByRole('button', {name: 'Finish setup'}).click();
    await setup.waitForURL(origin + '/onboarding');
    await setFlags(false, true, false);
    await setup.reload();
    await setup.waitForURL(origin + '/welcome');
    assert.ok(await pending());
    await setFlags(true, true, false);
    await setup.getByRole('button', {name: 'Finish setup'}).click();
    await setup.waitForURL(origin + '/onboarding');
    await setFlags(true, true, true);
    await setup.getByRole('button', {name: 'Finish setup'}).click();
    await setup.waitForURL(origin + section);
    await waitForConsumption();
    console.log('Consent/onboarding/session-loss/reauthentication journey passed with fake accounts.');

    // Failed status is one read, preserves state, and can recover by reloading.
    await setFlags(false, false, false);
    await setup.goto(origin + section);
    await setFlags(true, true, true);
    let failedReads = 0;
    await setup.route('**/api/learning-destination', route => { failedReads++; return route.fulfill({status: 503, contentType: 'application/json', body: '{}'}); });
    await setup.getByRole('button', {name: 'Finish setup'}).click();
    await setup.waitForURL(origin + '/home');
    for (let i = 0; i < 100 && failedReads === 0; i++) await new Promise(ok => setTimeout(ok, 20));
    await new Promise(ok => setTimeout(ok, 750));
    assert.equal(failedReads, 1);
    assert.ok(await pending());
    await setup.unroute('**/api/learning-destination');
    await setup.reload();
    await setup.waitForURL(origin + section);
    await waitForConsumption();
    console.log('Failed status call retains intent without a retry/navigation loop.');

    // Existing gate-query fail-open must not cause repeated document reloads.
    await setFlags(false, false, false);
    await setup.goto(origin + section);
    await setFlags(true, true, true);
    await context.addCookies([{name: 'fixture-error', value: 'yes', url: origin}]);
    let reloads = 0;
    const countReload = request => { if (request.isNavigationRequest() && new URL(request.url()).pathname === '/home') reloads++; };
    setup.on('request', countReload);
    await setup.getByRole('button', {name: 'Finish setup'}).click();
    await setup.waitForURL(origin + '/home');
    for (let i = 0; i < 100 && reloads === 0; i++) await new Promise(ok => setTimeout(ok, 20));
    await new Promise(ok => setTimeout(ok, 750));
    assert.equal(reloads, 1);
    assert.ok(await pending());
    setup.off('request', countReload);
    await context.clearCookies({name: 'fixture-error'});
    await setup.reload();
    await setup.waitForURL(origin + section);
    await waitForConsumption();
    console.log('Gate-query outage has at most one acknowledgement reload and retains intent.');

    await setFlags(false, false, false);
    await setup.goto(origin + section);
    await setup.goto(origin + '/');
    await waitForConsumption();
    console.log('Fresh document entry still cancels abandoned intent.');
  }
  console.log(process.env.REPRODUCE_BEFORE_FIX ? 'Historical-head runtime reproduction complete.' : 'Production runtime and multi-tab prefetch regressions passed.');
} finally {
  if (browser) await browser.close();
  if (server) { server.kill('SIGTERM'); await new Promise(ok => server.once('exit', ok)); }
  await rm(fixture, { recursive: true, force: true });
}
