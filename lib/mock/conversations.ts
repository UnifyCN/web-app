import type { ChatMessage, Conversation } from "@/types";

/**
 * Companion mock fallback — used when Supabase isn't configured or the user
 * isn't signed in. Mirrors the structure the service layer returns: a list of
 * Conversations (UUID identifiers), plus a separate map of messages keyed by
 * conversation id (mobile pattern — two React Query keys).
 */

export const mockConversations: Conversation[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    title: "PR card renewal timeline",
    updatedAt: "2026-05-14T17:10:00Z",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    title: "Opening a bank account",
    updatedAt: "2026-05-12T14:32:00Z",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    title: "How the Express Entry CRS works",
    updatedAt: "2026-05-09T11:05:00Z",
  },
];

export const mockMessagesByConversation: Record<string, ChatMessage[]> = {
  "11111111-1111-4111-8111-111111111111": [
    {
      id: 1001,
      conversationId: "11111111-1111-4111-8111-111111111111",
      role: "user",
      content: "How long does it take to renew a PR card?",
      sources: null,
      createdAt: "2026-05-14T17:08:00Z",
    },
    {
      id: 1002,
      conversationId: "11111111-1111-4111-8111-111111111111",
      role: "assistant",
      content:
        "PR card renewals currently take roughly 3 to 4 months from when IRCC receives a complete application. If your card expires soon, apply early — you keep your permanent resident status even with an expired card, but you need a valid card (or a PRTD) to board a commercial flight back to Canada. Check the live processing times on the IRCC website before you travel.",
      sources: null,
      createdAt: "2026-05-14T17:10:00Z",
    },
  ],
  "22222222-2222-4222-8222-222222222222": [
    {
      id: 2001,
      conversationId: "22222222-2222-4222-8222-222222222222",
      role: "user",
      content: "What do I need to open a bank account in Canada?",
      sources: null,
      createdAt: "2026-05-12T14:30:00Z",
    },
    {
      id: 2002,
      conversationId: "22222222-2222-4222-8222-222222222222",
      role: "assistant",
      content:
        "Most major banks — RBC, TD, Scotiabank, BMO, and CIBC — offer newcomer packages with no monthly fee for the first year. Bring your passport and one more piece of ID. A SIN isn't required just to open a chequing account, though you'll need one for any account that earns interest. Several banks let you start the application online before you even arrive.",
      sources: null,
      createdAt: "2026-05-12T14:32:00Z",
    },
  ],
  "33333333-3333-4333-8333-333333333333": [
    {
      id: 3001,
      conversationId: "33333333-3333-4333-8333-333333333333",
      role: "user",
      content: "How does the Express Entry CRS score work?",
      sources: null,
      createdAt: "2026-05-09T11:02:00Z",
    },
    {
      id: 3002,
      conversationId: "33333333-3333-4333-8333-333333333333",
      role: "assistant",
      content:
        "The Comprehensive Ranking System (CRS) scores Express Entry candidates out of 1,200 points. The core factors are age, education, official-language ability, and Canadian work experience. Extra points come from a provincial nomination (worth 600 points), strong French, a sibling in Canada, or Canadian study. IRCC runs regular draws and invites the highest-scoring candidates to apply for permanent residence.",
      sources: [
        {
          title: "IRCC — Express Entry CRS criteria",
          url: "https://www.canada.ca/en/immigration-refugees-citizenship.html",
        },
        {
          title: "CRS points calculator",
          url: "https://www.canada.ca/en/immigration-refugees-citizenship.html",
        },
      ],
      createdAt: "2026-05-09T11:05:00Z",
    },
  ],
};
