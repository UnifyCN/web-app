import type { ChecklistTask } from "@/types";

// TODO: replace with real data — mock newcomer settling-in checklist.
export const tasks: ChecklistTask[] = [
  // Do now
  {
    id: "t-sin",
    priority: "Do now",
    title: "Apply for a Social Insurance Number",
    description:
      "Your SIN is needed to work and access government services. Apply at a Service Canada office or online.",
    completed: true,
    completedAt: "2026-05-10T16:00:00Z",
    learnHowHref: "/learn",
    isCustom: false,
  },
  {
    id: "t-bank",
    priority: "Do now",
    title: "Open a Canadian bank account",
    description:
      "Most banks offer newcomer packages with no fees for the first year.",
    completed: false,
    completedAt: null,
    learnHowHref: "/learn",
    isCustom: false,
  },
  {
    id: "t-phone",
    priority: "Do now",
    title: "Get a Canadian phone plan",
    description:
      "A local number makes job applications, housing, and appointments far easier.",
    completed: false,
    completedAt: null,
    isCustom: false,
  },

  // Do soon
  {
    id: "t-health",
    priority: "Do soon",
    title: "Apply for provincial health coverage",
    description:
      "Coverage can take up to three months to start — apply the week you arrive.",
    completed: false,
    completedAt: null,
    learnHowHref: "/learn",
    isCustom: false,
  },
  {
    id: "t-housing",
    priority: "Do soon",
    title: "Find permanent housing",
    description:
      "Line up references and proof of funds; landlords often ask for both.",
    completed: false,
    completedAt: null,
    isCustom: false,
  },
  {
    id: "t-school",
    priority: "Do soon",
    title: "Register children for school",
    description:
      "Contact your local school board with proof of address and immigration documents.",
    completed: false,
    completedAt: null,
    isCustom: false,
  },

  // Explore and connect
  {
    id: "t-community",
    priority: "Explore and connect",
    title: "Join a newcomer community group",
    description:
      "Local groups are the fastest way to find advice, friends, and job leads.",
    completed: false,
    completedAt: null,
    learnHowHref: "/community",
    isCustom: false,
  },
  {
    id: "t-language",
    priority: "Explore and connect",
    title: "Find English or French classes",
    description:
      "Government-funded LINC classes are free for eligible permanent residents.",
    completed: false,
    completedAt: null,
    isCustom: false,
  },
  {
    id: "t-library",
    priority: "Explore and connect",
    title: "Explore your local public library",
    description:
      "Free internet, settlement workshops, and language resources — all with a free card.",
    completed: true,
    completedAt: "2026-05-13T19:30:00Z",
    isCustom: false,
  },

  // Optional / later
  {
    id: "t-credit",
    priority: "Optional / later",
    title: "Build a Canadian credit history",
    description:
      "A secured credit card used responsibly builds the score you'll need for renting and loans.",
    completed: false,
    completedAt: null,
    learnHowHref: "/learn",
    isCustom: false,
  },
  {
    id: "t-citizenship",
    priority: "Optional / later",
    title: "Look into the citizenship timeline",
    description:
      "Most permanent residents can apply for citizenship after three years in Canada.",
    completed: false,
    completedAt: null,
    isCustom: false,
  },
  {
    id: "t-budget",
    priority: "Optional / later",
    title: "Set up a budget for Canadian living costs",
    description:
      "Map out rent, transit, groceries, and phone so the first months hold no surprises.",
    completed: false,
    completedAt: null,
    isCustom: false,
  },
];
