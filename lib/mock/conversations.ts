import type { ChatMessage } from "@/types";

/** A conversation plus its messages — the shape the Companion UI works with. */
export interface ConversationThread {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
}

// TODO: replace with real data — mock Companion conversations.
export const conversations: ConversationThread[] = [
  {
    id: "conv-pr-card",
    title: "PR card renewal timeline",
    updatedAt: "2026-05-14T17:10:00Z",
    messages: [
      {
        id: "m-pr-1",
        conversationId: "conv-pr-card",
        role: "user",
        content: "How long does it take to renew a PR card?",
        sources: [],
        createdAt: "2026-05-14T17:08:00Z",
      },
      {
        id: "m-pr-2",
        conversationId: "conv-pr-card",
        role: "assistant",
        content:
          "PR card renewals currently take roughly 3 to 4 months from when IRCC receives a complete application. If your card expires soon, apply early — you keep your permanent resident status even with an expired card, but you need a valid card (or a PRTD) to board a commercial flight back to Canada. Check the live processing times on the IRCC website before you travel.",
        sources: [],
        createdAt: "2026-05-14T17:10:00Z",
      },
    ],
  },
  {
    id: "conv-bank",
    title: "Opening a bank account",
    updatedAt: "2026-05-12T14:32:00Z",
    messages: [
      {
        id: "m-bank-1",
        conversationId: "conv-bank",
        role: "user",
        content: "What do I need to open a bank account in Canada?",
        sources: [],
        createdAt: "2026-05-12T14:30:00Z",
      },
      {
        id: "m-bank-2",
        conversationId: "conv-bank",
        role: "assistant",
        content:
          "Most major banks — RBC, TD, Scotiabank, BMO, and CIBC — offer newcomer packages with no monthly fee for the first year. Bring your passport and one more piece of ID. A SIN isn't required just to open a chequing account, though you'll need one for any account that earns interest. Several banks let you start the application online before you even arrive.",
        sources: [],
        createdAt: "2026-05-12T14:32:00Z",
      },
    ],
  },
  {
    id: "conv-crs",
    title: "How the Express Entry CRS works",
    updatedAt: "2026-05-09T11:05:00Z",
    messages: [
      {
        id: "m-crs-1",
        conversationId: "conv-crs",
        role: "user",
        content: "How does the Express Entry CRS score work?",
        sources: [],
        createdAt: "2026-05-09T11:02:00Z",
      },
      {
        id: "m-crs-2",
        conversationId: "conv-crs",
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
  },
];
