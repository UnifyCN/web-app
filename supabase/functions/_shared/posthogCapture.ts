// @ts-nocheck Deno runtime — Supabase Edge Functions
/**
 * Shared PostHog capture utility for edge functions.
 * Ported from the Unify mobile app. NOTE: this web project intentionally does
 * NOT set POSTHOG_PROJECT_API_KEY (see CLAUDE.md — "No PostHog / analytics"),
 * so captureAiGeneration() no-ops here. The file is kept so the rag-query port
 * stays a faithful 1:1 of mobile; flip on analytics later by setting the secret.
 */

const POSTHOG_HOST = 'https://us.i.posthog.com';

interface AiGenerationProperties {
  // Required
  $ai_model: string;
  $ai_provider: string;

  // Token usage
  $ai_input_tokens?: number;
  $ai_output_tokens?: number;
  $ai_total_tokens?: number;

  // Cost
  $ai_input_cost_usd?: number;
  $ai_output_cost_usd?: number;
  $ai_total_cost_usd?: number;

  // Trace
  $ai_trace_id?: string;

  // Conversation content (powers PostHog LLM trace UI + eval mining).
  $ai_input?: Array<{ role: string; content: string }>;
  $ai_output_choices?: Array<{ role: string; content: string }>;

  // Custom properties
  [key: string]: unknown;
}

function keepAlive(promise: Promise<unknown>): void {
  const edgeRuntime = (
    globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
    }
  ).EdgeRuntime;

  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(promise);
    return;
  }

  void promise.catch(err => {
    console.error('PostHog keepAlive task failed:', err);
  });
}

/**
 * Capture a PostHog `$ai_generation` event from an edge function.
 * No-ops unless POSTHOG_PROJECT_API_KEY (phc_...) is set in Supabase secrets.
 */
export function captureAiGeneration(
  distinctId: string,
  properties: AiGenerationProperties
): void {
  const apiKey = Deno.env.get('POSTHOG_PROJECT_API_KEY');
  if (!apiKey) {
    // Expected on the web project — analytics is intentionally disabled.
    return;
  }

  const body = JSON.stringify({
    api_key: apiKey,
    event: '$ai_generation',
    distinct_id: distinctId,
    properties: {
      ...properties,
      $lib: 'posthog-edge-functions',
    },
  });

  keepAlive(
    fetch(`${POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(err => {
      console.error('PostHog capture failed:', err);
    })
  );
}
