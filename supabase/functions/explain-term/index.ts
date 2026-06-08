// @ts-nocheck Deno runtime — Supabase Edge Functions
//
// explain-term — "Ask AI" for a selected term/phrase in a lesson. Ported from
// the mobile function; reuses the shared OpenRouter chain (Gemini → DeepSeek)
// and follows the web CORS/auth conventions (see practice-feedback). PostHog
// analytics from the mobile version are intentionally dropped.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { callOpenRouter } from '../_shared/openrouter.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

const SYSTEM_PROMPT = `You are a friendly, patient guide helping newcomers to Canada understand unfamiliar terms they encounter while learning about immigration, finances, taxes, housing, healthcare, and life in Canada.

When given a term or phrase, provide:
1. A clear, simple explanation in 2-3 sentences maximum
2. Use plain everyday language — avoid jargon
3. If relevant, briefly mention how this applies specifically in the Canadian context
4. If the term is an acronym, spell it out first

Your audience has recently arrived in Canada and may not be familiar with Canadian-specific terminology, government programs, financial systems, or legal language. Be warm and encouraging.

Respond ONLY with the explanation text — no formatting, no headers, no bullet points.`;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Missing Supabase env vars' }, 500);
  }

  if (!Deno.env.get('OPENROUTER_API_KEY')) {
    return jsonResponse({ error: 'Missing OPENROUTER_API_KEY' }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const { data: authData, error: userError } =
      await supabase.auth.getUser(token);
    if (userError || !authData?.user) {
      return jsonResponse({ error: 'Invalid user' }, 401);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }
    const { term } = body;
    let { lessonContext } = body;

    if (!term || typeof term !== 'string' || term.trim().length === 0) {
      return jsonResponse({ error: 'Missing or empty term' }, 400);
    }
    if (term.length > 500) {
      return jsonResponse({ error: 'Term too long (max 500 chars)' }, 400);
    }

    // Validate and bound lessonContext.
    if (lessonContext != null) {
      if (typeof lessonContext !== 'string') {
        lessonContext = undefined;
      } else {
        lessonContext = lessonContext.trim().replace(/\s+/g, ' ');
        if (lessonContext.length === 0) {
          lessonContext = undefined;
        } else if (lessonContext.length > 500) {
          lessonContext = lessonContext.slice(0, 500);
        }
      }
    }

    const userPrompt = lessonContext
      ? `The user is reading a lesson about "${lessonContext}" and wants to understand this term or phrase: "${term.trim()}"`
      : `Explain this term or phrase to a newcomer to Canada: "${term.trim()}"`;

    const llmResult = await callOpenRouter({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      maxTokens: 256,
      temperature: 0.3,
      timeoutMs: 15000,
      retries: 1,
      retryDelayMs: 400,
      appName: 'Unify — explain-term',
    });

    if (!llmResult.ok) {
      console.error('explain-term OpenRouter call failed:', llmResult.message);
      let status = 502;
      if (llmResult.status === 504) status = 504;
      else if (llmResult.retryable) status = 503;
      return jsonResponse({ error: 'AI service unavailable' }, status);
    }

    const explanation = llmResult.content;
    if (!explanation) {
      return jsonResponse({ error: 'No explanation generated' }, 502);
    }

    return jsonResponse({ explanation });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return jsonResponse({ error: 'Request timed out' }, 504);
    }
    console.error('explain-term error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
