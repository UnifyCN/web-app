import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import vancouver from "@/supabase/functions/rag-query/fixtures/rag-query-context-vancouver.json";
import provinceConflict from "@/supabase/functions/rag-query/fixtures/rag-query-context-province-conflict.json";
import unavailable from "@/supabase/functions/rag-query/fixtures/rag-query-context-unavailable.json";
import { renderIn, textIn } from "@/components/learn/practice/testing/renderHelpers";
import type { ChatMessage } from "@/types";

// Spec UnifyCN/mobile-app#359, ticket #362: an answer shows the context it
// used and the official pages it checked, live and after the conversation is
// reopened. Drives the real useSendMessage hook and the real services/companion
// (generateReply, saveMessage, getMessages), then renders the real
// MessageBubble. The rag-query bodies are the exact responses the Deno handler
// test produces with controlled providers (supabase/functions/rag-query/
// fixtures; index_companion_context_test.ts fails if they drift). Stubbed:
// fetch to /api/companion (the proxy passes the body through unchanged), the
// Supabase client (an in-memory messages table, no RLS) and the PostHog SDK.

type Body = Record<string, unknown> & { context?: Record<string, unknown> };

const db = vi.hoisted(() => ({
  messages: [] as Array<Record<string, unknown>>,
  /** When set, PostgREST rejects companion_context like an unmigrated schema. */
  columnMissing: false,
}));
const capture = vi.hoisted(() => vi.fn());

vi.mock("@/lib/posthog", () => ({
  isPostHogConfigured: () => true,
  posthog: { capture },
}));

function missingColumn() {
  return {
    data: null,
    error: { code: "42703", message: "column messages.companion_context does not exist" },
  };
}

/** Just enough of the supabase-js query builder for services/companion. */
function fakeSupabase() {
  return {
    from(table: string) {
      if (table === "conversations") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { id: 7 }, error: null }) }),
          }),
        };
      }
      return {
        insert: (values: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              if (db.columnMissing && "companion_context" in values) return missingColumn();
              const row = {
                ...values,
                id: db.messages.length + 1,
                created_at: `2026-10-25T17:3${db.messages.length}:00Z`,
              };
              db.messages.push(row);
              return { data: row, error: null };
            },
          }),
        }),
        select: (columns: string) => ({
          eq: () => ({
            order: async () => {
              if (db.columnMissing && columns.includes("companion_context")) return missingColumn();
              return {
                data: db.messages.map((row) => {
                  const copy = { ...row };
                  if (!columns.includes("companion_context")) delete copy.companion_context;
                  return copy;
                }),
                error: null,
              };
            },
          }),
        }),
      };
    },
  };
}

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => fakeSupabase(),
  getAuthUserId: async () => "user-vancouver",
  isSupabaseConfigured: () => true,
}));

import { getMessages } from "@/services/companion";
import { messagesKey, useSendMessage } from "@/hooks/useCompanion";
import { MessageBubble } from "./MessageBubble";

const CONV = "11111111-1111-4111-8111-111111111111";
const QUESTION =
  "I arrive in Vancouver next week as a new permanent resident. What should I do first?";

type SendMessage = ReturnType<typeof useSendMessage>;

function renderSendMessage(client: QueryClient): SendMessage {
  let mutation: SendMessage | null = null;
  function Probe() {
    mutation = useSendMessage();
    return null;
  }
  renderToString(createElement(QueryClientProvider, { client }, createElement(Probe)));
  if (!mutation) throw new Error("hook did not render");
  return mutation;
}

/** Ask through the real hook with rag-query answering `body`; return the
 *  assistant message as a reopened conversation reads it back. */
async function askAndReopen(body: Body): Promise<ChatMessage> {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
  const client = new QueryClient();
  client.setQueryData(messagesKey(CONV), []);
  await renderSendMessage(client).mutateAsync({
    conversationIdentifier: CONV,
    text: QUESTION,
    inputSource: "typed",
    isNewConversation: false,
  });
  const reopened = await getMessages(CONV);
  const answer = reopened.find((m) => m.role === "assistant");
  if (!answer) throw new Error("no assistant message saved");
  return answer;
}

const bubble = (message: ChatMessage, lang: Parameters<typeof renderIn>[1] = "en") =>
  renderIn(
    createElement(MessageBubble, {
      message,
      groupedWithPrev: false,
      groupedWithNext: false,
      isLast: true,
      onOpenContext: () => undefined,
    }),
    lang,
  );

beforeEach(() => {
  vi.stubGlobal("window", {});
  db.messages = [];
  db.columnMissing = false;
  capture.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("Companion context on web: Vancouver arrival", () => {
  it("saves the answer's context with it, unchanged, and makes no other write", async () => {
    await askAndReopen(vancouver);
    const saved = db.messages.find((m) => m.role === "assistant");
    expect(saved?.companion_context).toEqual(vancouver.context);
    expect(saved?.content).toContain(vancouver.answer);
    // The question and the answer; nothing else is written.
    expect(db.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(db.messages[0]).not.toHaveProperty("companion_context");
  });

  it("the reopened answer shows the place, arrival, Checklist count, check time and a Sources and context button", async () => {
    const html = bubble(await askAndReopen(vancouver));
    const text = textIn(html);
    expect(text).toContain("Vancouver, British Columbia");
    expect(text).toContain("next week");
    expect(text).toContain("Checklist tasks used: 3");
    // The time this server read the pages, not a page's own date.
    expect(text).toMatch(/Official pages checked Oct 25, 2026/);
    expect(html).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*>Sources and context<\/button>/);
    expect(html).toContain('aria-label="Context used for this answer"');
  });

  it("analytics never receive the context: no place, task title, URL or publisher", async () => {
    await askAndReopen(vancouver);
    const sent = JSON.stringify(capture.mock.calls);
    expect(capture.mock.calls.map(([event]) => event)).toContain("companion_response_received");
    for (const secret of ["Vancouver", "British Columbia", "Get your SIN", "canada.ca", "Government of Canada", "next_week"]) {
      expect(sent).not.toContain(secret);
    }
  });

  it("every locale renders the context in its own language, with no raw keys", async () => {
    const message = await askAndReopen(vancouver);
    const button: Record<string, string> = {
      en: "Sources and context",
      vi: "Nguồn và bối cảnh",
      es: "Fuentes y contexto",
      hi: "स्रोत और संदर्भ",
      ar: "المصادر والسياق",
      "fr-CA": "Sources et contexte",
      pa: "ਸਰੋਤ ਅਤੇ ਸੰਦਰਭ",
    };
    for (const [lang, label] of Object.entries(button)) {
      const html = bubble(message, lang as Parameters<typeof renderIn>[1]);
      expect(html, lang).toContain(`>${label}</button>`);
      expect(html, lang).not.toContain("companion.context.");
    }
  });
});

describe("Companion context on web: missing, conflicting and unavailable information", () => {
  it("a stated province that differs from the profile is shown in words, and the profile is said to be unchanged", async () => {
    const text = textIn(bubble(await askAndReopen(provinceConflict)));
    expect(text).toContain(
      "Your profile says Ontario, but in this conversation you said British Columbia. Your profile was not changed.",
    );
  });

  it("guidance that could not be checked says so and shows no check time", async () => {
    const text = textIn(bubble(await askAndReopen(unavailable)));
    expect(text).toContain("Official guidance could not be checked for this answer.");
    expect(text).not.toContain("Official pages checked");
  });

  it("an older rag-query with no context: the answer and its sources render as before, with no context controls", async () => {
    const older: Body = { ...vancouver };
    delete older.context;
    const html = bubble(await askAndReopen(older));
    expect(textIn(html)).toContain(vancouver.answer);
    expect(html).not.toContain("Sources and context");
    expect(db.messages.find((m) => m.role === "assistant")?.companion_context).toBeUndefined();
  });

  it("before the column is migrated, the answer still saves and reopens, without its context", async () => {
    db.columnMissing = true;
    const message = await askAndReopen(vancouver);
    expect(message.content).toContain(vancouver.answer);
    expect(db.messages.find((m) => m.role === "assistant")).not.toHaveProperty("companion_context");
    expect(bubble(message)).not.toContain("Sources and context");
  });
});
