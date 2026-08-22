import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateResumeTurn, ResumeUpstreamError } from "@/lib/resume/generateTurn";
import { normalizeResumeData, MAX_RESUME_MESSAGE_LEN } from "@/lib/resume/schema";
import { isSupportedLanguage, DEFAULT_LANGUAGE } from "@/lib/i18n/config";
import type {
  ResumeChatRole,
  ResumeProfileContext,
  ResumeTurnRequest,
} from "@/types/resume";
import type { Persona, Stage } from "@/types";

/**
 * Server-side turn generator for the AI Resume Builder (local prototype path).
 *
 * The browser POSTs the conversation so far + the resume built so far; this
 * route asks DeepSeek (via OpenRouter, pinned to deepseek/deepseek-v4-flash) for
 * the next structured turn and returns { reply, suggestions, resume, complete }.
 *
 * PROTOTYPE NOTE: production would move this to the resume-chat Supabase edge
 * function (see supabase/functions/resume-chat/) and invoke it server→server —
 * the same shape as /api/companion → rag-query. It runs here directly against
 * OpenRouter so the prototype works with no Docker / functions-serve. Auth is
 * still required (the endpoint spends the shared OpenRouter budget). Node
 * runtime; maxDuration mirrors /api/companion (LLM completion with a timeout).
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_PERSONAS: Persona[] = [
  "international_student",
  "skilled_worker",
  "refugee",
  "other",
];

function clampProfile(raw: unknown): ResumeProfileContext {
  const p = (raw ?? {}) as Record<string, unknown>;
  const persona =
    typeof p.persona === "string" && VALID_PERSONAS.includes(p.persona as Persona)
      ? (p.persona as Persona)
      : null;
  const stageNum = Number(p.stage);
  const stage: Stage | null =
    Number.isInteger(stageNum) && stageNum >= 0 && stageNum <= 4
      ? (stageNum as Stage)
      : null;
  const responseLanguage = isSupportedLanguage(p.responseLanguage)
    ? p.responseLanguage
    : DEFAULT_LANGUAGE;
  const asString = (v: unknown, max: number): string | null =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
  return {
    firstName: asString(p.firstName, 80),
    persona,
    stage,
    city: asString(p.city, 80),
    province: asString(p.province, 40),
    email: asString(p.email, 160),
    responseLanguage,
  };
}

function clampHistory(
  raw: unknown,
): { role: ResumeChatRole; content: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { role: ResumeChatRole; content: string }[] = [];
  for (const item of raw) {
    const r = (item ?? {}) as Record<string, unknown>;
    const role = r.role === "assistant" ? "assistant" : "user";
    const content =
      typeof r.content === "string" ? r.content.slice(0, 4000) : "";
    if (content) out.push({ role, content });
    if (out.length >= 30) break;
  }
  return out;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }
  if (message.length > MAX_RESUME_MESSAGE_LEN) {
    return NextResponse.json(
      { error: "Message is too long" },
      { status: 413 },
    );
  }

  const turn: ResumeTurnRequest = {
    message,
    history: clampHistory(body.history),
    currentResume: normalizeResumeData(body.currentResume),
    profile: clampProfile(body.profile),
  };

  try {
    const result = await generateResumeTurn(turn);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ResumeUpstreamError) {
      // 503 for retryable upstream trouble (429 / 5xx / timeout), else 502.
      const status = error.retryable ? 503 : 502;
      return NextResponse.json(
        { error: "The resume assistant is busy. Please try again.", retryable: error.retryable },
        { status },
      );
    }
    console.error("Resume: turn generation failed", error);
    return NextResponse.json(
      { error: "Failed to generate a reply." },
      { status: 500 },
    );
  }
}
