/**
 * Test-only harness: run an edge function's real `Deno.serve` handler with the
 * network, the environment and the server stubbed out. Nothing here is imported
 * by a deployed function.
 *
 * - `Deno.env.get` reads `testEnv` (so the tests need no --allow-env).
 * - `fetch` goes to the route function set by `setRoutes`; every call is
 *   recorded in `fetchLog`. An unrouted call answers 599 so a missing stub
 *   shows up as a failed request, not a hang.
 * - `loadHandler` imports a function's index.ts with `Deno.serve` replaced by a
 *   capture, and returns the handler it registered.
 *
 * The stubs are process-wide and stay installed for the whole test run.
 */

export type Handler = (req: Request) => Response | Promise<Response>;

export interface FetchCall {
  url: URL;
  method: string;
  /** The JSON-parsed request body, or the raw string when it is not JSON. */
  body: unknown;
}

export type Route = (call: FetchCall) => Response | undefined;

export const testEnv: Record<string, string> = {
  SUPABASE_URL: 'https://project.supabase.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  SUPABASE_ANON_KEY: 'anon-key',
  OPENROUTER_API_KEY: 'openrouter-key',
  POSTHOG_PROJECT_API_KEY: 'phc_test',
};

export const fetchLog: FetchCall[] = [];

let route: Route = () => undefined;

export function setRoutes(next: Route): void {
  route = next;
  fetchLog.length = 0;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** An OpenRouter-style SSE body (`data: …` lines, then `data: [DONE]`). */
export function sse(chunks: unknown[]): Response {
  const text =
    chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('') +
    'data: [DONE]\n\n';
  return new Response(text, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

let installed = false;

function installStubs(): void {
  if (installed) return;
  installed = true;

  (Deno.env as { get: (key: string) => string | undefined }).get = key =>
    testEnv[key];

  globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input));
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    const rawBody =
      typeof init?.body === 'string'
        ? init.body
        : request
          ? await request.clone().text()
          : undefined;
    let body: unknown = rawBody;
    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        // keep the raw string
      }
    }
    const call: FetchCall = { url, method, body };
    fetchLog.push(call);
    return (
      route(call) ?? new Response(`unrouted: ${method} ${url}`, { status: 599 })
    );
  };
}

/**
 * Capture the handler an edge function registers. Use with a LITERAL dynamic
 * import, so Deno resolves the module ahead of time and the test needs no
 * --allow-read:
 *
 *   const takeHandler = captureServe();
 *   await import('./index.ts');
 *   const handler = takeHandler();
 */
export function captureServe(): () => Handler {
  installStubs();
  let captured: Handler | null = null;
  const realServe = Deno.serve;
  (Deno as { serve: unknown }).serve = (handler: Handler) => {
    captured = handler;
    return { finished: Promise.resolve(), shutdown: () => Promise.resolve() };
  };
  return () => {
    (Deno as { serve: unknown }).serve = realServe;
    if (!captured) throw new Error('the module did not call Deno.serve');
    return captured;
  };
}

/** A non-streaming OpenRouter chat completion whose message is `content`. */
export function openRouterCompletion(content: string): Response {
  return json({
    choices: [{ message: { content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.0001 },
    model: 'test/model',
    provider: 'TestProvider',
  });
}

/** PostHog's capture endpoint (records the call; answers OK). */
export function posthogRoute(call: FetchCall): Response | undefined {
  return call.url.hostname.endsWith('posthog.com') ? json({ status: 1 }) : undefined;
}

/** The `$ai_generation` events posted to PostHog since the last `setRoutes`. */
export function aiGenerationEvents(): Array<Record<string, unknown>> {
  return fetchLog
    .filter(call => call.url.hostname.endsWith('posthog.com'))
    .map(call => call.body as { event?: string; properties?: unknown })
    .filter(body => body?.event === '$ai_generation')
    .map(body => body.properties as Record<string, unknown>);
}

/** Supabase REST / auth stubs shared by the function tests. */
export function supabaseRoute(
  call: FetchCall,
  handlers: {
    userId: string;
    rpc?: Record<string, unknown>;
    tables?: Record<string, unknown>;
  }
): Response | undefined {
  if (call.url.origin !== new URL(testEnv.SUPABASE_URL).origin) return undefined;
  const path = call.url.pathname;
  if (path === '/auth/v1/user') {
    return json({ id: handlers.userId, aud: 'authenticated', role: 'authenticated' });
  }
  const rpc = path.match(/^\/rest\/v1\/rpc\/(\w+)$/);
  if (rpc) {
    const name = rpc[1];
    return json(handlers.rpc && name in handlers.rpc ? handlers.rpc[name] : null);
  }
  const table = path.match(/^\/rest\/v1\/(\w+)$/);
  if (table) {
    if (call.method !== 'GET') return json([], 201);
    const rows = handlers.tables?.[table[1]];
    return json(rows ?? []);
  }
  return undefined;
}

/** What a diagnostic line may hold once it is flattened to text. */
function flatten(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return '[unserializable]';
  }
}

/**
 * Collect everything written to the console until `restore` is called, so a
 * test can prove that a diagnostic never carried a given value.
 */
export function captureConsole(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
  const originals = methods.map(method => console[method]);
  for (const method of methods) {
    console[method] = (...args: unknown[]) => {
      lines.push(args.map(flatten).join(' '));
    };
  }
  return {
    lines,
    restore: () =>
      methods.forEach((method, i) => (console[method] = originals[i])),
  };
}
