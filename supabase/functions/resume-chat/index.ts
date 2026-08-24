// @ts-nocheck Deno runtime — Supabase Edge Functions
/**
 * resume-chat — the AI Resume Builder turn generator (web-only feature).
 *
 * One conversational turn: given the transcript so far + the resume built so
 * far, returns strict JSON { reply, suggestions, resume, complete } from
 * DeepSeek (pinned deepseek/deepseek-v4-flash) via the shared OpenRouter helper.
 *
 * DEPLOY STATUS: NOT deployed to the shared project yet. The web prototype runs
 * the identical logic in-process at app/api/resume/route.ts (Node) so it works
 * with no Docker / functions-serve. This function is the production form, ready
 * to deploy once Savar signs off on adding a web-only function to shared infra
 * (and a real per-user quota RPC replaces the prototype's local rate limit).
 *
 * The prompt text + JSON contract + normalization here MIRROR
 * lib/resume/prompt.ts and lib/resume/schema.ts — keep the two in sync.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { callOpenRouter } from '../_shared/openrouter.ts';
import { captureAiGeneration } from '../_shared/posthogCapture.ts';

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

// ---------------------------------------------------------------------------
// Prompt (mirrors lib/resume/prompt.ts)
// ---------------------------------------------------------------------------

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  hi: 'Hindi',
  vi: 'Vietnamese',
  ar: 'Arabic',
  'fr-CA': 'Canadian French',
};

const PERSONA_HINT: Record<string, string> = {
  international_student:
    'an international student — likely light on Canadian work history; lean on studies, campus involvement, internships, part-time jobs, and projects.',
  skilled_worker:
    'a skilled worker with professional experience abroad — focus on translating that experience for Canadian employers.',
  refugee:
    'a refugee or protected person — be especially patient and encouraging; prior work may be informal, interrupted, or hard to document. Value transferable and informal experience.',
  other:
    'a newcomer to Canada — keep questions general and adapt to whatever background they share.',
};

function stageHint(stage: number | null): string {
  if (stage === 0) return 'They have not arrived in Canada yet.';
  if (stage === 1) return 'They arrived very recently (under 3 months ago).';
  if (stage === 2) return 'They have been in Canada 3–12 months.';
  if (stage === 3) return 'They have been in Canada 1–3 years.';
  if (stage === 4) return 'They have been in Canada 3+ years.';
  return '';
}

const SCHEMA_BLOCK = `Return ONLY a single JSON object (no markdown, no code fences, no text before or after) with EXACTLY these keys:

{
  "reply": "string — your short conversational message to the user (1–4 sentences). Ask ONE question, or acknowledge + confirm.",
  "suggestions": ["string", "string", "string"],
  "complete": false,
  "resume": {
    "contact": { "name": "", "email": "", "phone": "", "location": "", "linkedin": "", "website": "" },
    "summary": "",
    "education":  [ { "id": "", "institution": "", "location": "", "degree": "", "dates": "" } ],
    "experience": [ { "id": "", "title": "", "organization": "", "location": "", "dates": "", "bullets": ["", ""] } ],
    "projects":   [ { "id": "", "name": "", "tech": "", "dates": "", "bullets": ["", ""] } ],
    "skills":     [ { "id": "", "category": "", "items": ["", ""] } ]
  }
}

Copy the "id" of every entry that already exists in CURRENT_RESUME_JSON so it stays stable across turns. Use "" for a brand-new entry.`;

function buildSystemPrompt(profile): string {
  const langName = LANGUAGE_NAMES[profile.responseLanguage] ?? 'English';
  const persona = profile.persona
    ? PERSONA_HINT[profile.persona] ?? PERSONA_HINT.other
    : PERSONA_HINT.other;
  const name = profile.firstName ? String(profile.firstName).trim() : '';
  const place = [profile.city, profile.province].filter(Boolean).join(', ');

  const contextLines = [
    name ? `The user's first name is ${name}.` : '',
    `They are ${persona}`,
    stageHint(profile.stage ?? null),
    place ? `They are settling in ${place}, Canada.` : '',
  ]
    .filter(Boolean)
    .map(l => `- ${l}`)
    .join('\n');

  return `You are Unify's Resume Coach — a warm, patient career helper who builds a clean, professional resume WITH a newcomer to Canada through natural conversation. You are not a form. You talk like a supportive human, one question at a time.

# Who you're helping
${contextLines}

# Your goal
Interview the user about their background and turn their answers into a polished, ATS-friendly resume in the "Jake's Resume" style (single column: Contact, optional Summary, Education, Experience, Projects, Skills). You do the hard part — the user gives you plain, everyday answers and YOU rewrite them into strong resume language.

# How to converse
- Ask ONE clear question at a time. Keep it short and use plain, simple words (many users are still learning English).
- Be warm and encouraging. Never lecture or overwhelm. React briefly to what they said before asking the next thing.
- Go roughly in this order, but follow the user: (1) most recent / most important job, (2) earlier jobs, (3) education, (4) skills / languages / certifications, (5) projects or volunteer work if relevant, (6) a short summary line, (7) any missing contact info (phone, LinkedIn). Skip what clearly doesn't apply.
- If an answer is vague about WHAT THEY DID, gently probe for the actual tasks with a concrete example. Example: they say "I worked at a store" → "Nice! What did you do there day to day — like helping customers, using the cash register, or stocking shelves?"
- Accept answers in any language and in any grammar. Understand the meaning; never criticize their English.

# Don't get stuck (VERY IMPORTANT — read carefully)
- Ask for any single missing FACT (employer name, exact dates, city, school name) AT MOST ONCE. If the user doesn't give it, or answers something else, ACCEPT the entry as-is (leave that field ""), and move on. A partial entry with a blank employer is completely fine — a blank field is far better than a frustrated user.
- NEVER ask for the same piece of information twice. If you already asked for the company name and didn't get it, do not ask again — move forward.
- ALWAYS follow the user's lead. If they volunteer new information (a different job, their studies, a skill) while you were waiting on a detail, capture that new information and continue from there. Do not drag them back to an unfinished detail.
- When the user signals they are finished ("that's all", "no more", "I'm done", "eso es todo"), do NOT ask another question. Finalize immediately with "complete": true.

# Writing the resume (the value you add)
- Convert casual answers into strong, concise bullet points: start with a past-tense action verb, be specific, and quantify ONLY when the user gave a number. Example: "i helped customers and used the till" → "Delivered friendly customer service and processed cash and card payments accurately".
- NEVER invent facts. Do not fabricate employers, job titles, dates, numbers, achievements, schools, or skills. Only include what the user actually told you or clearly implied. If you don't know a field yet, leave it "" (or []). Empty is always better than made-up.
- Write ALL resume content in English, because this resume is for Canadian employers — even when you are talking to the user in ${langName}. Translate job titles ("asistente administrativa" → "Administrative Assistant"), degrees ("licenciatura en administración" → "Bachelor of Business Administration"), skill names, categories, and every bullet point into natural English. Keep real proper names (a specific company or school) as the user gave them. ONLY the "reply" and "suggestions" fields stay in ${langName}.
- Preserve everything captured so far. Each turn, return the COMPLETE resume with all prior fields intact plus any updates from the latest answer.
- Prefill: some contact fields may already be filled in the current resume — keep them; don't re-ask for what's already there. It's fine to ask once, near the end, for a phone number (and optionally LinkedIn) if still blank — but don't push if the user skips it.

# Suggestions (tappable example answers)
- Provide 2–3 short example answers to the QUESTION YOU JUST ASKED — realistic things THIS user might tap and lightly edit, so users who struggle to type still make progress.
- Make them specific to the user's situation and the current question — never generic filler like "Yes"/"No"/"I don't know". If you asked about a cashier's duties, good suggestions are "Handled cash and card payments", "Helped customers find products", "Kept shelves stocked and tidy".
- Write suggestions in ${langName}.
- If suggestions don't make sense for the current question (e.g. asking for their name or phone), return an empty array.

# Finishing
- When you have at least one work OR education entry plus some skills, and the user has nothing more to add, set "complete": true, briefly congratulate them, and invite them to refine any section or export the PDF.

# Output format
${SCHEMA_BLOCK}

Reply to the user in ${langName}. Output ONLY the JSON object.`;
}

function buildTurnMessages(profile, history, currentResume, message) {
  const messages = [{ role: 'system', content: buildSystemPrompt(profile) }];
  for (const turn of history) {
    messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({
    role: 'system',
    content: `CURRENT_RESUME_JSON (the resume so far — preserve every non-empty field, then apply the user's next answer):\n${JSON.stringify(currentResume)}`,
  });
  messages.push({ role: 'user', content: message });
  return messages;
}

function extractJsonObject(raw: string) {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const first = candidate.indexOf('{');
    const last = candidate.lastIndexOf('}');
    if (first === -1 || last <= first) return null;
    try {
      return JSON.parse(candidate.slice(first, last + 1));
    } catch {
      return null;
    }
  }
}

function parseTurnResponse(raw: string) {
  const parsed = extractJsonObject(raw);
  if (!parsed) return null;
  const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
  const suggestions = Array.isArray(parsed.suggestions)
    ? parsed.suggestions
        .filter(s => typeof s === 'string')
        .map(s => s.trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];
  return {
    reply,
    suggestions,
    resume: parsed.resume ?? {},
    complete: parsed.complete === true,
  };
}

// ---------------------------------------------------------------------------
// Normalization (mirrors lib/resume/schema.ts)
// ---------------------------------------------------------------------------

const MAX_ENTRIES = 12;
const MAX_BULLETS = 10;

function s(v: unknown, max = 400): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
function sArr(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const val = s(item, maxLen);
    if (val) out.push(val);
    if (out.length >= maxItems) break;
  }
  return out;
}
function nid(): string {
  return crypto.randomUUID();
}

const VALID_PERSONAS = [
  'international_student',
  'skilled_worker',
  'refugee',
  'other',
];

/**
 * Validate + bound the client-supplied profile before it is interpolated into
 * the system prompt. Without this, an authenticated caller could inject arbitrary
 * text into the system role or inflate the prompt without limit. Mirrors
 * clampProfile in app/api/resume/route.ts.
 */
function clampProfile(raw) {
  const p =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const asString = (v: unknown, max: number) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
  return {
    firstName: asString(p.firstName, 80),
    persona:
      typeof p.persona === 'string' && VALID_PERSONAS.includes(p.persona)
        ? p.persona
        : null,
    // Require an actual integer — Number("0")/Number(false)/Number("") coerce to
    // 0 and would otherwise pass as a valid stage.
    stage:
      typeof p.stage === 'number' &&
      Number.isInteger(p.stage) &&
      p.stage >= 0 &&
      p.stage <= 4
        ? p.stage
        : null,
    city: asString(p.city, 80),
    province: asString(p.province, 40),
    email: asString(p.email, 160),
    // hasOwnProperty, not `in`: `in` walks the prototype chain, so "toString" /
    // "__proto__" would wrongly pass.
    responseLanguage:
      typeof p.responseLanguage === 'string' &&
      Object.prototype.hasOwnProperty.call(LANGUAGE_NAMES, p.responseLanguage)
        ? p.responseLanguage
        : 'en',
  };
}

function normalizeResume(v) {
  const r = v ?? {};
  const c = r.contact ?? {};
  return {
    contact: {
      name: s(c.name, 120),
      email: s(c.email, 160),
      phone: s(c.phone, 60),
      location: s(c.location, 120),
      linkedin: s(c.linkedin, 200),
      website: s(c.website, 200),
    },
    summary: s(r.summary, 600),
    education: Array.isArray(r.education)
      ? r.education.slice(0, MAX_ENTRIES).map(e => ({
          id: s(e?.id) || nid(),
          institution: s(e?.institution),
          location: s(e?.location),
          degree: s(e?.degree),
          dates: s(e?.dates),
        }))
      : [],
    experience: Array.isArray(r.experience)
      ? r.experience.slice(0, MAX_ENTRIES).map(e => ({
          id: s(e?.id) || nid(),
          title: s(e?.title),
          organization: s(e?.organization),
          location: s(e?.location),
          dates: s(e?.dates),
          bullets: sArr(e?.bullets, MAX_BULLETS, 400),
        }))
      : [],
    projects: Array.isArray(r.projects)
      ? r.projects.slice(0, MAX_ENTRIES).map(p => ({
          id: s(p?.id) || nid(),
          name: s(p?.name),
          tech: s(p?.tech),
          dates: s(p?.dates),
          bullets: sArr(p?.bullets, MAX_BULLETS, 400),
        }))
      : [],
    skills: Array.isArray(r.skills)
      ? r.skills.slice(0, 8).map(sk => ({
          id: s(sk?.id) || nid(),
          category: s(sk?.category, 120),
          items: sArr(sk?.items, 20, 120),
        }))
      : [],
  };
}

// ---------------------------------------------------------------------------

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
    if (!token) return jsonResponse({ error: 'Unauthorized' }, 401);

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

    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) return jsonResponse({ error: 'Message is required' }, 400);
    if (message.length > 2000) {
      return jsonResponse({ error: 'Message is too long' }, 413);
    }

    const history = Array.isArray(body.history)
      ? body.history
          .filter(m => m && typeof m.content === 'string' && m.content.trim())
          .slice(-12)
          .map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: String(m.content).slice(0, 4000),
          }))
      : [];
    const currentResume = normalizeResume(body.currentResume);
    const profile = clampProfile(body.profile);

    const messages = buildTurnMessages(
      profile,
      history,
      currentResume,
      message
    );

    const llmResult = await callOpenRouter({
      model: 'deepseek/deepseek-v4-flash',
      messages,
      jsonMode: true,
      maxTokens: 2400,
      temperature: 0.5,
      timeoutMs: 45000,
      retries: 1,
      retryDelayMs: 500,
      appName: 'Unify — resume-chat',
    });

    if (!llmResult.ok) {
      console.error('resume-chat OpenRouter call failed:', llmResult.message);
      let status = 502;
      if (llmResult.status === 504) status = 504;
      else if (llmResult.retryable) status = 503;
      return jsonResponse({ error: 'AI service unavailable' }, status);
    }

    captureAiGeneration(authData.user.id, {
      $ai_model: llmResult.model,
      $ai_provider: llmResult.provider,
      $ai_input_tokens: llmResult.usage.promptTokens,
      $ai_output_tokens: llmResult.usage.completionTokens,
      $ai_total_tokens: llmResult.usage.totalTokens,
      $ai_total_cost_usd: llmResult.usage.costUsd,
      feature: 'resume_builder',
      source: typeof body.source === 'string' ? body.source : 'web',
      message_length: message.length,
    });

    const parsed = parseTurnResponse(llmResult.content);
    if (!parsed || !parsed.reply) {
      // Prose fallback: a turn occasionally returns a plain sentence despite
      // json mode. Show it and leave the resume unchanged this turn.
      const prose = llmResult.content.trim();
      if (prose && prose.length <= 1500 && !prose.includes('{')) {
        return jsonResponse({
          reply: prose,
          suggestions: [],
          resume: currentResume,
          complete: false,
        });
      }
      return jsonResponse({ error: 'Unexpected model response' }, 502);
    }

    return jsonResponse({
      reply: parsed.reply,
      suggestions: parsed.suggestions,
      resume: normalizeResume(parsed.resume),
      complete: parsed.complete,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return jsonResponse({ error: 'Request timed out' }, 504);
    }
    console.error('resume-chat error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
