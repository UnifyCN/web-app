/**
 * Server-side (Node) turn generator for the resume builder. Calls OpenRouter
 * directly — pinned to deepseek/deepseek-v4-flash — using the shared prompt in
 * ./prompt.ts, then parses + normalizes the structured JSON reply.
 *
 * This is the LOCAL PROTOTYPE execution path used by app/api/resume/route.ts.
 * The production form is the resume-chat Supabase edge function (Deno), which
 * uses _shared/openrouter.ts and the same prompt text. This module deliberately
 * mirrors that logic in Node so the prototype runs with no Docker /
 * `functions serve` (the OPENROUTER_API_KEY lives in .env.local for local dev).
 */

import { buildTurnMessages, parseTurnResponse } from "./prompt";
import { normalizeResumeData } from "./schema";
import type {
  ResumeData,
  ResumeTurnRequest,
  ResumeTurnResponse,
} from "@/types/resume";

/** A bracketed stand-in the model sometimes invents for contact info, e.g. "[EMAIL]". */
const CONTACT_PLACEHOLDER = /^\s*\[[^\]]*\]\s*$/;

/**
 * Contact identifiers (email/phone/etc.) are facts, not prose to "improve". Some
 * turns come back with a filled field blanked or swapped for a "[EMAIL]"-style
 * placeholder even though the prompt says to preserve it — which would silently
 * wipe a value the user typed inline moments earlier. Restore any prior non-empty
 * contact field the model dropped or placeholdered; genuine chat-driven changes
 * (a real new value) still pass through.
 */
function preserveContact(current: ResumeData, next: ResumeData): ResumeData {
  const prevContact = normalizeResumeData(current).contact;
  const contact = { ...next.contact };
  (Object.keys(contact) as (keyof typeof contact)[]).forEach((key) => {
    const prev = prevContact[key];
    const val = contact[key].trim();
    if (prev.trim() && (!val || CONTACT_PLACEHOLDER.test(val))) {
      contact[key] = prev;
    }
  });
  return { ...next, contact };
}

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
/** Savar's explicit model choice for the resume builder. */
const MODEL = "deepseek/deepseek-v4-flash";
const TIMEOUT_MS = 45_000;

export class ResumeUpstreamError extends Error {
  status: number;
  /** True for 429 / 5xx — the client can offer a retry rather than a hard fail. */
  retryable: boolean;
  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = "ResumeUpstreamError";
    this.status = status;
    this.retryable = retryable;
  }
}

export async function generateResumeTurn(
  req: ResumeTurnRequest,
): Promise<ResumeTurnResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new ResumeUpstreamError(
      "OPENROUTER_API_KEY not set (add it to .env.local for the local prototype)",
      500,
      false,
    );
  }

  const messages = buildTurnMessages({
    profile: req.profile,
    history: req.history,
    currentResume: req.currentResume,
    message: req.message,
  });

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Title": "Unify Resume Builder",
      },
      body: JSON.stringify({
        model: MODEL,
        models: [MODEL],
        messages,
        response_format: { type: "json_object" },
        temperature: 0.5,
        max_tokens: 2400,
        usage: { include: true },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const aborted =
      error instanceof DOMException && error.name === "TimeoutError";
    throw new ResumeUpstreamError(
      aborted ? "OpenRouter request timed out" : "OpenRouter request failed",
      aborted ? 504 : 502,
      true,
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ResumeUpstreamError(
      `OpenRouter ${response.status}: ${body.slice(0, 300)}`,
      response.status,
      response.status === 429 || response.status >= 500,
    );
  }

  const data = (await response.json().catch(() => null)) as {
    choices?: { message?: { content?: unknown } }[];
  } | null;
  const content =
    typeof data?.choices?.[0]?.message?.content === "string"
      ? (data.choices[0].message.content as string)
      : "";

  const parsed = parseTurnResponse(content);
  if (!parsed || !parsed.reply) {
    // Prose fallback: despite json-mode, a turn occasionally comes back as a
    // plain conversational sentence with no JSON. Rather than fail the turn,
    // show it as the assistant's reply and leave the resume unchanged this turn
    // (the user's next answer re-anchors the model on the JSON contract).
    const prose = content.trim();
    if (prose && prose.length <= 1500 && !prose.includes("{")) {
      return {
        reply: prose,
        suggestions: [],
        resume: normalizeResumeData(req.currentResume),
        complete: false,
      };
    }
    // Empty, or a malformed JSON blob — treat as retryable ("try again").
    throw new ResumeUpstreamError(
      "The model returned an unexpected response",
      502,
      true,
    );
  }

  return {
    reply: parsed.reply,
    suggestions: parsed.suggestions,
    resume: preserveContact(
      req.currentResume,
      normalizeResumeData(parsed.resume),
    ),
    complete: parsed.complete,
  };
}
