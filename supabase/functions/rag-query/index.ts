// @ts-nocheck Deno runtime — Supabase Edge Functions (not part of the Next build)
//
// Ported from the Unify mobile app's rag-query function, adapted for the web
// project. Differences from mobile (see PLAN / scoping doc):
//   - CORS handling added (browser calls via supabase.functions.invoke).
//   - Profile context uses the web user_onboarding_profiles schema (persona,
//     stage 0-4, city, province, arrival_date, goals[], learning_interests[]) —
//     no immigration_status / country_of_origin columns here.
//   - Name personalization uses users.username (web has no first_name).
//   - Daily message limit = 3 (web free tier).
//   - Non-streaming only; token/cost tracking RPC dropped (web chatbot_usage has
//     no token columns, and analytics is disabled).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { fetchWithRetry } from '../_shared/fetchWithRetry.ts';
import { callOpenRouter } from '../_shared/openrouter.ts';
import { captureAiGeneration } from '../_shared/posthogCapture.ts';

// ============================================================================
// CONSTANTS
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const STANDARD_DISCLAIMER =
  'This is general information, not legal advice. For decisions about your specific situation, please check the official IRCC website or talk to a licensed immigration professional.';

const NO_KB_HITS_DISCLAIMER =
  "This may not be covered in Unify's internal resources; please double-check with IRCC or a licensed immigration professional.";

const DAILY_MESSAGE_LIMIT = 3;

type QueryType =
  | 'immigration'
  | 'newcomer_settlement'
  | 'general'
  | 'fact_check'
  | 'form_help';

const EMBEDDING_MODEL =
  Deno.env.get('OPENAI_EMBEDDING_MODEL') || 'text-embedding-3-small';

const INVALID_ASSISTANT_LED_PATTERNS: RegExp[] = [
  /^would you like\b/i,
  /^do you want\b/i,
  /^can i\b/i,
  /^what kind of information are you looking for\b/i,
  /^what are you looking for\b/i,
  /^how can i help\b/i,
  /^what would you like\b/i,
  /\blet me know\b/i,
  /\bi can help\b/i,
  /\bwould you like me to\b/i,
];

const USER_QUESTION_STARTS = [
  'what', 'how', 'can', 'should', 'when', 'where', 'why', 'which', 'is',
  'are', 'do', 'does', 'could', 'would', 'who',
];

// Defense against prompt injection via the user-controlled name field. Strict
// whitelist: Unicode letters + combining marks, plus space, hyphen, apostrophe.
function sanitizeNameForPrompt(name: string | null): string | null {
  if (!name) return null;
  const cleaned = name
    .replace(/[^\p{L}\p{M}\s'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, 50);
}

function sanitizeSuggestedNextSteps(suggestions: string[]): string[] {
  if (!suggestions || suggestions.length === 0) return [];

  const deduped = new Set<string>();

  return suggestions
    .map(s => s.replace(/^[\s"'`-]+|[\s"'`]+$/g, '').trim())
    .filter(s => s.length >= 10)
    .filter(
      s => !INVALID_ASSISTANT_LED_PATTERNS.some(pattern => pattern.test(s))
    )
    .map(s => {
      const lower = s.toLowerCase();
      const startsLikeQuestion = USER_QUESTION_STARTS.some(word =>
        lower.startsWith(`${word} `)
      );
      if (startsLikeQuestion && !s.endsWith('?')) {
        return `${s}?`;
      }
      return s;
    })
    .filter(s => s.endsWith('?'))
    .filter(s => {
      const key = s.toLowerCase();
      if (deduped.has(key)) return false;
      deduped.add(key);
      return true;
    })
    .slice(0, 3);
}

/** Map the web stage enum (0-4) to a settlement-timeline sentence. */
function stageToTimePhrase(stage: number | null): string | null {
  switch (stage) {
    case 0:
      return 'They are planning their move to Canada and have not arrived yet.';
    case 1:
      return 'They arrived in Canada less than 3 months ago.';
    case 2:
      return 'They have been in Canada for 3–12 months.';
    case 3:
      return 'They have been in Canada for 1–3 years.';
    case 4:
      return 'They have been in Canada for 3+ years.';
    default:
      return null;
  }
}

function buildUserProfileContext(profile: Record<string, unknown>): string {
  const persona = (profile.persona as string | null) ?? null;
  const city = (profile.city as string | null) ?? null;
  const province = (profile.province as string | null) ?? null;
  const arrivalDate = (profile.arrival_date as string | null) ?? null;
  const stage =
    typeof profile.stage === 'number' ? (profile.stage as number) : null;
  const goals = (profile.goals as string[] | null) ?? [];
  const learningInterests =
    (profile.learning_interests as string[] | null) ?? [];

  const parts: string[] = [];
  const arrived = arrivalDate
    ? ` (arrived ${String(arrivalDate).split('T')[0]})`
    : '';

  if (persona && city && province) {
    parts.push(
      `You are speaking with a ${persona.replace(/_/g, ' ')} in ${city}, ${province}${arrived}.`
    );
  } else if (persona && province) {
    parts.push(
      `You are speaking with a ${persona.replace(/_/g, ' ')} in ${province}${arrived}.`
    );
  } else if (persona) {
    parts.push(
      `You are speaking with a ${persona.replace(/_/g, ' ')} in Canada${arrived}.`
    );
  }

  const stagePhrase = stageToTimePhrase(stage);
  if (stagePhrase) {
    parts.push(
      `${stagePhrase} Tailor timing-sensitive guidance (deadlines, what to prioritize first) to this stage of settlement.`
    );
  }

  if (goals.length > 0) {
    parts.push(
      `Their goals: ${goals.map(g => g.replace(/_/g, ' ')).join(', ')}.`
    );
  }

  if (learningInterests.length > 0) {
    parts.push(
      `Their interests: ${learningInterests.map(i => i.replace(/_/g, ' ')).join(', ')}.`
    );
  }

  if (parts.length === 0) return '';

  parts.push(
    `Tailor your responses to their specific situation, location, and goals.`
  );

  if (city) {
    parts.push(`Refer to local resources in ${city} when relevant.`);
  }

  // Bias guard — forbid extrapolating beyond stated facts.
  parts.push(
    `Do NOT assume cultural traits, religion, language fluency, family situation, education level, or financial status beyond what is stated above.`
  );

  return `\nUSER PROFILE CONTEXT:\n${parts.join(' ')}`;
}

/**
 * Build a profile-aware string to embed for vector retrieval. Prepending
 * province + persona pulls more relevant chunks (e.g. a Quebec user pulls
 * Quebec-specific content) without changing the user-visible answer.
 */
function buildRetrievalQuery(
  prompt: string,
  profile: Record<string, unknown> | null
): string {
  if (!profile) return prompt;
  const province = profile.province as string | null;
  const persona = profile.persona as string | null;
  const cues = [province, persona?.replace(/_/g, ' ')]
    .filter(Boolean)
    .join(', ');
  return cues ? `[Context: ${cues}] ${prompt}` : prompt;
}

type ProfileBundle = {
  text: string;
  raw: Record<string, unknown> | null;
};

async function fetchUserProfileContext(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<ProfileBundle> {
  try {
    const { data: profile, error: profileError } = await supabase
      .from('user_onboarding_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profileError || !profile) {
      return { text: '', raw: null };
    }

    const userProfileContext = buildUserProfileContext(profile);
    return { text: userProfileContext, raw: profile };
  } catch (_profileFetchError) {
    console.error('Failed to fetch user onboarding profile context');
    return { text: '', raw: null };
  }
}

async function resolveAuthenticatedUserId(
  req: Request,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || supabaseServiceKey;
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error,
  } = await authClient.auth.getUser();

  if (error || !user) {
    console.warn('Unable to resolve authenticated user from JWT');
    return null;
  }

  return user.id;
}

/**
 * Best-effort compensating decrement: refund one message when generation fails
 * after the daily quota was already incremented. Never throws — a failed refund
 * must not mask the original error that triggered it.
 */
async function refundChatbotUsage(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  chargedDate: string
): Promise<void> {
  try {
    // supabase.rpc resolves to { data, error } — it does NOT throw on RPC
    // failure, so surface a non-null error in the logs instead of swallowing it.
    const { error } = await supabase.rpc('decrement_chatbot_usage', {
      p_user_id: userId,
      p_charged_date: chargedDate,
    });
    if (error) {
      console.warn(
        '[rag-query] quota refund failed (non-fatal):',
        error.message
      );
    }
  } catch (refundError) {
    // Guard against an unexpected throw (e.g. network) — a failed refund must
    // never mask the original error that triggered it.
    console.warn(
      '[rag-query] quota refund threw (non-fatal):',
      refundError instanceof Error ? refundError.message : refundError
    );
  }
}

// ============================================================================
// CLASSIFIER (heuristic — no LLM call)
// ============================================================================

const FACT_CHECK_PATTERN =
  /\b(is it true|i heard|can you verify|verify (this|that|if)|debunk|myth|rumou?r)\b/i;

const FORM_HELP_PATTERN =
  /\b(imm[\s-]?\d{4,5}|form\s+\d{4}|fill (out|in) (a |the )?form|form field)\b/i;

const GREETING_PATTERN =
  /^(hi|hello|hey|thanks|thank you|good (morning|evening|afternoon|night)|how are you|what'?s up|sup)[\s!.?]*$/i;

function classifyQueryHeuristic(prompt: string): QueryType {
  const trimmed = prompt.trim();

  if (GREETING_PATTERN.test(trimmed)) return 'general';
  if (FACT_CHECK_PATTERN.test(trimmed)) return 'fact_check';
  if (FORM_HELP_PATTERN.test(trimmed)) return 'form_help';
  return 'immigration';
}

// ============================================================================
// SYSTEM INSTRUCTIONS
// ============================================================================

const SUGGESTIONS_INSTRUCTION = `

SUGGESTED NEXT STEPS:
At the very end of your response, suggest 2-3 brief follow-up questions the user might ask YOU next. These should be natural continuations of the conversation.
Each suggestion must be written from the user's perspective (a direct question to the assistant).
DO NOT write assistant-to-user prompts like:
- "Would you like me to..."
- "What kind of information are you looking for today?"
- "Do you want help with..."
Format them on a new line starting with "[SUGGESTIONS]:" followed by the questions separated by "|".
Example: [SUGGESTIONS]: How do I open a TFSA? | What's the contribution limit? | Can I withdraw anytime?`;

function buildImmigrationSystemInstruction(contextText: string): string {
  return `You are Unify's AI assistant, helping newcomers to Canada navigate immigration and settlement topics. You are friendly, supportive, and knowledgeable.

CONTEXT FROM KNOWLEDGE BASE:
${contextText}

CRITICAL: BREVITY IS KEY
Keep responses short and scannable. Avoid walls of text. Get to the point quickly.

RESPONSE FORMAT:
Start with a direct 1-2 sentence answer. Then provide 2-3 sentences of essential context using simple, newcomer-friendly language. Explain acronyms briefly (e.g., "TFSA" = Tax-Free Savings Account).

If there are key steps or items to list, use bullet points (- item).

End with one actionable next step the user can take.

Do NOT use ## section headers like "Short Answer" or "Explanation" — just flow naturally from answer to context to next step. Do NOT include an "Important Notes" or disclaimer section — the app already shows a disclaimer.

PROVINCE-SPECIFIC AUTHORITIES (refer to the user's province when relevant):
- Driver's licensing: Ontario→ServiceOntario / DriveTest (G1/G2/G), British Columbia→ICBC (Class 7L/7N/5), Quebec→SAAQ (Classes 5/6), Alberta→Service Alberta / Alberta Registries, Manitoba→Manitoba Public Insurance, Saskatchewan→SGI, Nova Scotia→Service Nova Scotia, New Brunswick→Service New Brunswick.
- Health coverage: Ontario→OHIP, British Columbia→MSP, Quebec→RAMQ, Alberta→AHCIP, Manitoba→Manitoba Health, Saskatchewan→Saskatchewan Health, Nova Scotia→MSI, New Brunswick→Medicare NB.
- Tenancy / housing: Ontario→Landlord and Tenant Board, British Columbia→Residential Tenancy Branch (BC RTA), Quebec→Tribunal administratif du logement, Alberta→Residential Tenancy Dispute Resolution Service.
- Employment standards: each province has its own; Quebec→CNESST, Ontario→Ministry of Labour, BC→Employment Standards Branch.
When the user is in Quebec, also surface Quebec-specific programs (CSQ, PEQ, francisation classes) when settlement-relevant.

PROFESSIONAL CREDENTIAL RECOGNITION:
Direct internationally-trained professionals to (a) the federal credential assessment service for their occupation (e.g. NNAS for nurses, MCC for physicians, ECA for engineers via WES/ICES/CES), AND (b) the provincial regulator in their province (e.g. CRNS in Saskatchewan, CNO in Ontario, BCCNM in BC for nurses). Mention bridging programs when known.

CRITICAL GUARDRAILS:
1. **PERSONAL ELIGIBILITY**: For "Am I eligible?" or "Will I get approved?" questions — explain the general criteria, then say to verify with IRCC or a licensed immigration professional. Do not give a yes/no.
2. **STABLE PUBLIC FACTS**: Common public knowledge IS answerable directly — citizenship test format (20 multiple-choice questions, pass mark 15/20), CRS components and how points are calculated, Express Entry vs PNP basics, study/work permit work-hour rules, what a SIN is, what a TFSA is, etc. Do NOT dodge these by pointing to IRCC for the answer.
3. **NEVER QUOTE FEES OR PROCESSING TIMES FROM MEMORY**: Specific dollar amounts and processing-time numbers change frequently. ONLY cite a fee or processing time if it appears in the KB context above. Otherwise say "check current fees and processing times on canada.ca/ircc" without naming a number.
4. **MANDATORY LAWYER/RCIC REFERRAL** for these topics: refugee/asylum claims, deportation/removal/inadmissibility, application denials, misrepresentation, criminality, sponsorship-application denials, overstay disclosure questions, judicial review. ALWAYS include the phrase "consult a licensed immigration lawyer or RCIC (Regulated Canadian Immigration Consultant)" in responses on these topics. Do NOT recommend specific lawyers or firms by name.
5. **OFFICIAL SOURCES**: For changing/recent rules, point to IRCC (ircc.canada.ca). For provincial topics, point to the province-specific authority listed above.
6. **CITE SOURCES**: Only include sources when directly using knowledge base information.${SUGGESTIONS_INSTRUCTION}`;
}

function buildImmigrationNoKBInstruction(): string {
  return `You are Unify's AI assistant, helping newcomers to Canada navigate immigration and settlement topics. You are friendly, supportive, and knowledgeable.

CRITICAL: BREVITY IS KEY
Keep responses short and scannable. Avoid walls of text. Get to the point quickly.

RESPONSE FORMAT:
Start with a direct 1-2 sentence answer. Then provide 2-3 sentences of essential context using simple, newcomer-friendly language. Explain acronyms briefly.

If there are key steps or items to list, use bullet points (- item).

End with one actionable next step the user can take.

Do NOT use ## section headers like "Short Answer" or "Explanation" — just flow naturally from answer to context to next step. Do NOT include an "Important Notes" or disclaimer section — the app already shows a disclaimer.

Note: You are answering from general knowledge (not the knowledge base). Mention that users should verify with official sources like IRCC for current rules.

PROVINCE-SPECIFIC AUTHORITIES (refer to the user's province when relevant):
- Driver's licensing: Ontario→ServiceOntario / DriveTest, British Columbia→ICBC, Quebec→SAAQ, Alberta→Service Alberta, Manitoba→MPI, Saskatchewan→SGI.
- Health coverage: Ontario→OHIP, BC→MSP, Quebec→RAMQ, Alberta→AHCIP, Manitoba→Manitoba Health.
- Tenancy: Ontario→Landlord and Tenant Board, BC→BC RTA / Residential Tenancy Branch, Quebec→Tribunal administratif du logement.

PROFESSIONAL CREDENTIALS:
Direct internationally-trained professionals to the federal assessment service for their occupation (NNAS for nurses, MCC for physicians, ECA via WES/ICES/CES for engineers) AND the provincial regulator in their province.

CRITICAL GUARDRAILS:
1. **PERSONAL ELIGIBILITY**: For "Am I eligible?" or "Will I get approved?" — explain general criteria, recommend verifying with IRCC or a licensed professional. No yes/no.
2. **STABLE PUBLIC FACTS**: Citizenship test format (20 questions, pass mark 15/20), CRS components, study/work permit work-hour rules, what a SIN/TFSA is — answer directly. Do NOT dodge these.
3. **NEVER QUOTE FEES OR PROCESSING TIMES FROM MEMORY**: Specific dollar amounts and processing times change. Without KB context, say "check current fees and processing times on canada.ca/ircc" instead of naming a number.
4. **MANDATORY LAWYER/RCIC REFERRAL** for: refugee/asylum, deportation/removal/inadmissibility, application denials, misrepresentation, criminality, sponsorship denials, overstay disclosure, judicial review. Always include "consult a licensed immigration lawyer or RCIC".
5. **OFFICIAL SOURCES**: Point to IRCC (ircc.canada.ca) for changing rules; province-specific authority for provincial topics.${SUGGESTIONS_INSTRUCTION}`;
}

function buildFactCheckInstruction(contextText: string): string {
  const kbContext = contextText
    ? `\nKNOWLEDGE BASE CONTEXT:\n${contextText}\n`
    : '';

  return `You are Unify's AI assistant in FACT CHECK mode. The user wants to verify a claim or rumor they heard about Canadian immigration or settlement.

${kbContext}
CRITICAL: BE RIGOROUS AND CITE SOURCES
Your job is to verify claims against official government information. Be extra careful and accurate.

RESPONSE FORMAT:

## Verdict
Start with one of these verdicts in bold:
- **✅ VERIFIED** - The claim is accurate based on current official information
- **❌ FALSE** - The claim is incorrect or outdated
- **⚠️ PARTIALLY TRUE** - The claim has some truth but is misleading or incomplete
- **❓ UNVERIFIED** - Cannot confirm with available information

## The Facts
2-3 sentences explaining what the official rules actually are. Cite official sources (IRCC, canada.ca).

## Important Context
1-2 sentences on any nuances, recent changes, or exceptions. Immigration rules change frequently - note when information might be time-sensitive.

## Official Source
Always provide a link to verify: "Check the official IRCC website: ircc.canada.ca"

CRITICAL GUARDRAILS:
1. If unsure, say so. Never guess on immigration matters.
2. Always recommend checking official sources for the most current information.
3. Note if rules have changed recently or are expected to change.${SUGGESTIONS_INSTRUCTION}`;
}

function buildFormHelpInstruction(contextText: string): string {
  const kbContext = contextText
    ? `\nKNOWLEDGE BASE CONTEXT:\n${contextText}\n`
    : '';

  return `You are Unify's AI assistant in FORM HELP mode. The user needs help understanding an immigration form.

${kbContext}
CRITICAL: EDUCATIONAL ONLY - NEVER TELL THEM WHAT TO WRITE
Your job is to EXPLAIN what questions mean and what information is being asked for. You are NOT providing legal advice or telling them how to answer.

DETECT THE FORM FIRST:
If the user's question mentions a form number (anything like "IMM 5710", "IMM5257", "IMM 1294", "form 5710"), proceed DIRECTLY to the field explanation. Do NOT ask which form they are working on. Only ask for the form number when the user has not mentioned one.

RESPONSE FORMAT:

## Field Explanation
Explain what the field/question is asking for in simple terms. Use examples of the TYPE of information needed, not specific answers.

Example: "This field asks for your travel history - list all countries you've visited in the past 10 years, including short trips."

For the official wording and any sub-instructions, point the user to the IRCC instruction guide for that specific form (e.g. "IMM 5710 instruction guide" on canada.ca/ircc).

## Tips
1-2 practical tips for filling out this section accurately.

Do NOT include a disclaimer section — the app already shows one.

NEVER DO:
- Tell them what to write in a field
- Make decisions about their eligibility
- Advise them to omit or include specific information
- Provide legal interpretations of their situation${SUGGESTIONS_INSTRUCTION}`;
}

function buildGeneralSystemInstruction(): string {
  return `You are Unify's AI assistant. You are helpful, friendly, and conversational.

GUARDRAILS:
1. **NO PROFESSIONAL ADVICE**: Do not provide legal, medical, or financial advice. For such topics, recommend consulting appropriate professionals.
2. **BE HELPFUL**: Answer general questions helpfully and conversationally.
3. **STAY APPROPRIATE**: Keep responses appropriate and helpful.

If the user asks about Canadian immigration or newcomer topics, let them know you can help with those questions and encourage them to ask.${SUGGESTIONS_INSTRUCTION}`;
}

function parseSuggestionsFromResponse(answer: string): {
  cleanAnswer: string;
  suggestions: string[];
} {
  const suggestionsMatch = answer.match(/\[SUGGESTIONS\]:\s*([\s\S]*)$/im);

  if (suggestionsMatch) {
    const suggestionsText = suggestionsMatch[1].trim();
    const rawSuggestions = suggestionsText
      .replace(/\n+/g, ' ')
      .split('|')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .slice(0, 6);

    const suggestions = sanitizeSuggestedNextSteps(rawSuggestions);

    const cleanAnswer = answer
      .replace(/\[SUGGESTIONS\]:\s*([\s\S]*)$/im, '')
      .trim();

    return { cleanAnswer, suggestions };
  }

  return { cleanAnswer: answer, suggestions: [] };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  // CORS preflight — browsers fire this before the POST. verify_jwt is disabled
  // for this function (see config.toml) so the preflight isn't rejected by the
  // platform gateway; auth is enforced in-function via resolveAuthenticatedUserId.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Refund context — populated once the daily quota is actually consumed, so a
  // post-increment failure (embeddings / LLM) can hand the message back.
  let quotaConsumed = false;
  let supabaseForRefund: ReturnType<typeof createClient> | null = null;
  let refundUserId: string | null = null;
  let refundChargedDate: string | null = null;

  try {
    const {
      prompt,
      conversationIdentifier,
      messages,
      userId: requestUserId,
      eval_profile: evalProfile,
    } = await req.json();

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return jsonResponse({ error: 'Prompt is required' }, 400);
    }

    const preprompt = Deno.env.get('GEMINI_PREPROMPT') || '';
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!Deno.env.get('OPENROUTER_API_KEY')) {
      throw new Error('Missing OPENROUTER_API_KEY');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Eval-mode bypass — inert unless EVAL_BYPASS_SECRET is set (it isn't here).
    const evalBypassSecret = Deno.env.get('EVAL_BYPASS_SECRET');
    const isEvalMode =
      req.headers.get('x-eval-mode') === '1' &&
      !!evalBypassSecret &&
      req.headers.get('x-eval-secret') === evalBypassSecret;

    const authPromise = resolveAuthenticatedUserId(
      req,
      supabaseUrl,
      supabaseServiceKey
    );
    const queryType = classifyQueryHeuristic(prompt.trim());
    const authenticatedUserId = await authPromise;

    // Require authentication — reject unauthenticated requests.
    if (!isEvalMode && !authenticatedUserId) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const effectiveUserId = isEvalMode ? 'eval-mode' : authenticatedUserId!;

    // Atomic rate limit: check + increment in one RPC (fail-closed). Returns
    // jsonb { allowed, charged_date }; deny on DB error or over the daily cap.
    if (!isEvalMode) {
      const { data: quota, error: quotaError } = await supabase.rpc(
        'check_and_increment_chatbot_usage',
        { p_user_id: effectiveUserId, p_daily_limit: DAILY_MESSAGE_LIMIT }
      );

      if (quotaError || !quota || quota.allowed === false) {
        return jsonResponse(
          { error: 'Daily message limit reached. Try again tomorrow.' },
          429
        );
      }

      // Quota is now consumed; remember enough to refund it if generation fails.
      // Use the UTC date the RPC actually charged (not a second edge-clock read)
      // so the charge and refund agree on the day — no midnight-UTC race.
      quotaConsumed = true;
      supabaseForRefund = supabase;
      refundUserId = effectiveUserId;
      refundChargedDate = quota.charged_date;
    }

    if (
      requestUserId &&
      authenticatedUserId &&
      requestUserId !== authenticatedUserId
    ) {
      console.warn('Ignoring mismatched request userId and authenticated user');
    }

    const profilePromise: Promise<ProfileBundle> = isEvalMode
      ? Promise.resolve({
          text: evalProfile ? buildUserProfileContext(evalProfile) : '',
          raw: evalProfile,
        })
      : effectiveUserId
      ? fetchUserProfileContext(supabase, effectiveUserId)
      : Promise.resolve<ProfileBundle>({ text: '', raw: null });

    // Web has no users.first_name — personalize with the username instead.
    const firstNamePromise: Promise<string | null> =
      !isEvalMode && effectiveUserId
        ? (async () => {
            try {
              const { data: userRow } = await supabase
                .from('users')
                .select('username')
                .eq('id', effectiveUserId)
                .maybeSingle();
              return sanitizeNameForPrompt(
                (userRow?.username as string | null) ?? null
              );
            } catch (err) {
              console.warn('[rag-query] username lookup failed (non-fatal)', err);
              return null;
            }
          })()
        : Promise.resolve(null);

    const needsRAG =
      queryType === 'immigration' ||
      queryType === 'newcomer_settlement' ||
      queryType === 'fact_check' ||
      queryType === 'form_help';

    // ========================================================================
    // RAG RETRIEVAL
    // ========================================================================
    let contextText = '';
    let sources: Array<{
      document_id: number;
      document_title: string;
      url: string;
    }> = [];
    let hasGoodKBHits = false;
    let disclaimer: string | undefined;
    let lastVerified: string | undefined;

    if (needsRAG) {
      if (!openaiApiKey) {
        // No embedding key → skip retrieval, answer from general knowledge.
        console.warn(
          'OPENAI_API_KEY missing — answering without KB retrieval.'
        );
      } else {
        const profileBundleForRetrieval = await profilePromise;
        const retrievalQuery = buildRetrievalQuery(
          prompt,
          profileBundleForRetrieval.raw
        );

        const embeddingResponse = await fetchWithRetry(
          'https://api.openai.com/v1/embeddings',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${openaiApiKey}`,
            },
            body: JSON.stringify({
              model: EMBEDDING_MODEL,
              input: retrievalQuery,
            }),
          },
          { timeoutMs: 15000, retries: 2, retryDelayMs: 400 }
        );

        if (!embeddingResponse.ok) {
          throw new Error(
            `OpenAI embedding API error: ${embeddingResponse.statusText}`
          );
        }

        const embeddingData = await embeddingResponse.json();
        const queryEmbedding = embeddingData.data[0].embedding;

        let { data: chunks, error: searchError } = await supabase.rpc(
          'match_chunks',
          {
            query_embedding: queryEmbedding,
            match_threshold: 0.3,
            match_count: 10,
          }
        );

        // Log only non-PII metadata — the raw prompt can contain immigration
        // details and other sensitive info that must not land in edge logs.
        console.log('match_chunks results', {
          chunks: chunks?.length ?? 0,
          conversation: conversationIdentifier ?? null,
        });

        if (searchError) {
          console.error('match_chunks RPC error:', searchError);
          chunks = [];
        }

        const sourcesMap = new Map<
          number,
          { document_id: number; document_title: string; url: string }
        >();

        const s3BucketName =
          Deno.env.get('S3_BUCKET_NAME') || 'your-bucket-name';
        const s3Region = Deno.env.get('S3_REGION');

        hasGoodKBHits = chunks && chunks.length > 0;

        if (hasGoodKBHits) {
          let mostRecentUpdate: string | undefined;

          chunks.forEach((chunk: any) => {
            const doc = chunk.knowledge_documents || {};
            contextText += `[Document: ${doc.title || 'Unknown'}]\n${chunk.chunk_text}\n\n`;

            const docUpdatedAt = doc.updated_at;
            if (
              docUpdatedAt &&
              (!mostRecentUpdate || docUpdatedAt > mostRecentUpdate)
            ) {
              mostRecentUpdate = docUpdatedAt;
            }

            if (!sourcesMap.has(chunk.document_id)) {
              const sourceUrl = doc.source_url;
              const storagePath = doc.storage_path || '';
              const hasSourceConfig =
                !!s3BucketName &&
                s3BucketName !== 'your-bucket-name' &&
                !!s3Region &&
                !!storagePath;
              const s3Url = hasSourceConfig
                ? `https://${s3BucketName}.s3.${s3Region}.amazonaws.com/${storagePath}`
                : '';

              sourcesMap.set(chunk.document_id, {
                document_id: chunk.document_id,
                document_title: doc.title || 'Unknown',
                url:
                  sourceUrl ||
                  s3Url ||
                  'https://www.canada.ca/en/immigration-refugees-citizenship.html',
              });
            }
          });

          lastVerified = mostRecentUpdate;
          sources = Array.from(sourcesMap.values());
          disclaimer = STANDARD_DISCLAIMER;
        }
      }
      disclaimer = hasGoodKBHits
        ? disclaimer
        : `${NO_KB_HITS_DISCLAIMER} ${STANDARD_DISCLAIMER}`;
    }

    // ========================================================================
    // CONVERSATION HISTORY
    // ========================================================================
    const recentMessages =
      messages && Array.isArray(messages) ? messages.slice(-10) : [];

    const conversationHistory = recentMessages.map(
      (msg: { message: string; role: 'user' | 'assistant' }) => ({
        role: msg.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: msg.message,
      })
    );

    // ========================================================================
    // SYSTEM INSTRUCTION
    // ========================================================================
    let systemInstruction = '';

    switch (queryType) {
      case 'fact_check':
        systemInstruction = buildFactCheckInstruction(contextText);
        break;
      case 'form_help':
        systemInstruction = buildFormHelpInstruction(contextText);
        break;
      case 'immigration':
      case 'newcomer_settlement':
        systemInstruction =
          hasGoodKBHits && contextText
            ? buildImmigrationSystemInstruction(contextText)
            : buildImmigrationNoKBInstruction();
        break;
      default:
        systemInstruction = buildGeneralSystemInstruction();
    }

    const userProfileBundle = await profilePromise;
    const userFirstName = await firstNamePromise;
    const nameDirective = userFirstName
      ? `The user's name is ${userFirstName}. Address them by name occasionally where it feels natural — not in every response, and never in formal/legal answers.\n\n`
      : '';
    let fullSystemInstruction = preprompt
      ? `${nameDirective}${preprompt}\n\n${systemInstruction}`
      : `${nameDirective}${systemInstruction}`;
    if (userProfileBundle.text) {
      fullSystemInstruction = `${fullSystemInstruction}\n\n${userProfileBundle.text}`;
    }

    // ========================================================================
    // CALL OPENROUTER (non-streaming)
    // ========================================================================
    const messagesForLlm = [
      { role: 'system' as const, content: fullSystemInstruction },
      ...conversationHistory,
      { role: 'user' as const, content: prompt },
    ];

    const llmResult = await callOpenRouter({
      messages: messagesForLlm,
      maxTokens: 1200,
      timeoutMs: 25000,
      retries: 1,
      retryDelayMs: 500,
      appName: 'Unify - AI Companion',
    });

    if (!llmResult.ok) {
      if (llmResult.retryable) {
        // Transient failure after the quota was charged — refund the message.
        if (
          quotaConsumed &&
          supabaseForRefund &&
          refundUserId &&
          refundChargedDate
        ) {
          await refundChatbotUsage(
            supabaseForRefund,
            refundUserId,
            refundChargedDate
          );
        }
        return jsonResponse(
          {
            error:
              'AI Companion is busy right now. Please try again in a minute.',
            code: 'ai_companion_busy',
          },
          503
        );
      }
      console.error('OpenRouter call failed:', llmResult.message);
      throw new Error(llmResult.message);
    }

    const rawAnswer =
      llmResult.content || 'Sorry, I could not generate a response.';

    const tokenUsage = {
      prompt_tokens: llmResult.usage.promptTokens,
      completion_tokens: llmResult.usage.completionTokens,
      total_tokens: llmResult.usage.totalTokens,
    };
    const estimatedCostUsd = llmResult.usage.costUsd;

    // PostHog $ai_generation — no-ops unless POSTHOG_PROJECT_API_KEY is set
    // (analytics intentionally disabled on the web project).
    if (!isEvalMode) {
      captureAiGeneration(effectiveUserId, {
        $ai_model: llmResult.model,
        $ai_provider: llmResult.provider,
        $ai_input_tokens: tokenUsage.prompt_tokens,
        $ai_output_tokens: tokenUsage.completion_tokens,
        $ai_total_tokens: tokenUsage.total_tokens,
        $ai_total_cost_usd: estimatedCostUsd,
        $ai_trace_id: conversationIdentifier || undefined,
        $ai_input: [
          ...conversationHistory,
          { role: 'user', content: prompt },
        ],
        $ai_output_choices: [{ role: 'assistant', content: rawAnswer }],
        feature: 'ai_companion',
        query_type: queryType,
        has_sources: sources.length > 0,
      });
    }

    const { cleanAnswer, suggestions } =
      parseSuggestionsFromResponse(rawAnswer);

    return jsonResponse({
      answer: cleanAnswer,
      sources: sources.length > 0 ? sources : undefined,
      queryType,
      disclaimer,
      suggestedNextSteps: suggestions.length > 0 ? suggestions : undefined,
      lastVerified: lastVerified || undefined,
      tokenUsage,
      estimatedCostUsd,
    });
  } catch (error: unknown) {
    // Any failure after the quota was charged means the user got no answer —
    // refund the message so a provider/DB error doesn't burn their daily cap.
    if (
      quotaConsumed &&
      supabaseForRefund &&
      refundUserId &&
      refundChargedDate
    ) {
      await refundChatbotUsage(
        supabaseForRefund,
        refundUserId,
        refundChargedDate
      );
    }
    const message =
      error instanceof Error ? error.message : 'An unknown error occurred';
    return jsonResponse({ error: message }, 500);
  }
});
