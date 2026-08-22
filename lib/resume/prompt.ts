/**
 * The resume-builder conversation brain: the DeepSeek system prompt + the
 * per-turn message assembly + the response parser.
 *
 * This is the canonical, iterated version used by the live local path
 * (app/api/resume/route.ts). The resume-chat edge function carries a Deno port
 * of the SAME prompt text — keep the two in sync (see supabase/functions/
 * resume-chat/index.ts).
 *
 * Design:
 *  - The model returns STRICT JSON each turn: { reply, suggestions, resume,
 *    complete }. It returns the COMPLETE resume every turn (not a patch),
 *    preserving prior fields, so the panel always renders from a full snapshot.
 *  - `reply` + `suggestions` are in the user's UI language; resume field VALUES
 *    stay in English (the target Canadian job market). This lets a low-English
 *    user be coached in their language while producing an English resume.
 *  - The model must never invent employers, dates, numbers, or skills — only
 *    shape what the user actually said into resume-quality text.
 */

import type { ResumeData, ResumeProfileContext } from "@/types/resume";

export interface PromptMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  hi: "Hindi",
  vi: "Vietnamese",
  ar: "Arabic",
  "fr-CA": "Canadian French",
};

const PERSONA_HINT: Record<string, string> = {
  international_student:
    "an international student — likely light on Canadian work history; lean on studies, campus involvement, internships, part-time jobs, and projects.",
  skilled_worker:
    "a skilled worker with professional experience abroad — focus on translating that experience for Canadian employers.",
  refugee:
    "a refugee or protected person — be especially patient and encouraging; prior work may be informal, interrupted, or hard to document. Value transferable and informal experience.",
  other:
    "a newcomer to Canada — keep questions general and adapt to whatever background they share.",
};

function stageHint(stage: number | null): string {
  if (stage === 0) return "They have not arrived in Canada yet.";
  if (stage === 1) return "They arrived very recently (under 3 months ago).";
  if (stage === 2) return "They have been in Canada 3–12 months.";
  if (stage === 3) return "They have been in Canada 1–3 years.";
  if (stage === 4) return "They have been in Canada 3+ years.";
  return "";
}

/** The JSON contract, embedded verbatim so the model mirrors the exact shape. */
const SCHEMA_BLOCK = `Return ONLY a single JSON object (no markdown, no code fences, no text before or after) with EXACTLY these keys:

{
  "reply": "string — your short conversational message to the user (1–4 sentences). Ask ONE question, or acknowledge + confirm.",
  "suggestions": ["string", "string", "string"],
  "complete": false,
  "resume": {
    "contact": { "name": "", "email": "", "phone": "", "location": "", "linkedin": "", "website": "" },
    "summary": "",
    "education":  [ { "institution": "", "location": "", "degree": "", "dates": "" } ],
    "experience": [ { "title": "", "organization": "", "location": "", "dates": "", "bullets": ["", ""] } ],
    "projects":   [ { "name": "", "tech": "", "dates": "", "bullets": ["", ""] } ],
    "skills":     [ { "category": "", "items": ["", ""] } ]
  }
}`;

export function buildSystemPrompt(profile: ResumeProfileContext): string {
  const langName = LANGUAGE_NAMES[profile.responseLanguage] ?? "English";
  const persona = profile.persona
    ? PERSONA_HINT[profile.persona] ?? PERSONA_HINT.other
    : PERSONA_HINT.other;
  const name = profile.firstName?.trim();
  const place = [profile.city, profile.province].filter(Boolean).join(", ");

  const contextLines = [
    name ? `The user's first name is ${name}.` : "",
    `They are ${persona}`,
    stageHint(profile.stage),
    place ? `They are settling in ${place}, Canada.` : "",
  ]
    .filter(Boolean)
    .map((l) => `- ${l}`)
    .join("\n");

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

/**
 * Build the full message array for one turn: system prompt, prior turns, a
 * system snapshot of the current resume JSON (so the model always sees the
 * latest structured state), then the new user message.
 */
export function buildTurnMessages(args: {
  profile: ResumeProfileContext;
  history: { role: "user" | "assistant"; content: string }[];
  currentResume: ResumeData;
  message: string;
}): PromptMessage[] {
  const { profile, history, currentResume, message } = args;
  const messages: PromptMessage[] = [
    { role: "system", content: buildSystemPrompt(profile) },
  ];
  for (const turn of history) {
    messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({
    role: "system",
    content: `CURRENT_RESUME_JSON (the resume so far — preserve every non-empty field, then apply the user's next answer):\n${JSON.stringify(
      currentResume,
    )}`,
  });
  messages.push({ role: "user", content: message });
  return messages;
}

export interface ParsedTurn {
  reply: string;
  suggestions: string[];
  resume: unknown;
  complete: boolean;
}

/**
 * Extract the JSON object from the model's raw completion. Tolerant of stray
 * code fences or leading/trailing prose: falls back to the first `{`…last `}`
 * slice. Returns null when no JSON object can be recovered.
 */
export function parseTurnResponse(raw: string): ParsedTurn | null {
  const parsed = extractJsonObject(raw);
  if (!parsed) return null;
  const obj = parsed as Record<string, unknown>;
  const reply = typeof obj.reply === "string" ? obj.reply.trim() : "";
  const suggestions = Array.isArray(obj.suggestions)
    ? obj.suggestions
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];
  const complete = obj.complete === true;
  return { reply, suggestions, resume: obj.resume ?? {}, complete };
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  // Strip a ```json … ``` fence if present.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    // Fall back to the widest {...} span.
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first === -1 || last <= first) return null;
    try {
      return JSON.parse(candidate.slice(first, last + 1));
    } catch {
      return null;
    }
  }
}
