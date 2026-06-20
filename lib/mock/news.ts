import type { NewsItem } from "@/types";

/**
 * National newcomer news. The Home `NationalNewsWidget` renders this list
 * directly (it does not read the DB), and it doubles as the local-dev /
 * env-not-configured fallback for the Community News tab (`getNews`). Curated,
 * verified-working links to Canadian government + reputable settlement / news
 * sources, each with a topical Unsplash thumbnail (`images.unsplash.com` is
 * allowlisted in next.config.ts). Per CLAUDE.md, news items must always carry an
 * `imageLink` — never null. `category` is null (untagged); items link out to the
 * source (no in-app detail page).
 */
export const newsItems: NewsItem[] = [
  {
    id: 1,
    title: "Latest Canadian immigration news and updates",
    description:
      "Stay current on Express Entry draws, PR pathways, and policy changes affecting newcomers to Canada.",
    author: "CIC News",
    date: "2026-06-17T10:00:00Z",
    category: null,
    imageLink:
      "https://images.unsplash.com/photo-1523580846011-d3a5bc25702b?w=800&q=80&auto=format&fit=crop",
    link: "https://www.cicnews.com/2026/06/new-brunswick-invites-over-660-provincial-immigration-candidates-across-six-draws-0676956.html",
  },
  {
    id: 2,
    title: "Renting a home in Canada: what newcomers should know",
    description:
      "Leases, deposits, tenant rights, and how to find a place to rent — a guide from Canada's national housing agency.",
    author: "CMHC",
    date: "2026-06-12T14:30:00Z",
    category: null,
    imageLink:
      "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&q=80&auto=format&fit=crop",
    link: "https://www.cmhc-schl.gc.ca/consumers/renting-a-home",
  },
  {
    id: 3,
    title: "Getting health care as a newcomer to Canada",
    description:
      "How to apply for a health card, find a doctor, and access free and low-cost health services after you arrive.",
    author: "Settlement.org",
    date: "2026-06-09T09:15:00Z",
    category: null,
    imageLink:
      "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=800&q=80&auto=format&fit=crop",
    link: "https://settlement.org/ontario/health/",
  },
  {
    id: 4,
    title: "Find a job in Canada with Job Bank",
    description:
      "Search thousands of verified job postings and explore careers across Canada on the Government of Canada's job board.",
    author: "Government of Canada",
    date: "2026-06-04T16:45:00Z",
    category: null,
    imageLink:
      "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=800&q=80&auto=format&fit=crop",
    link: "https://www.jobbank.gc.ca/findajob",
  },
  {
    id: 5,
    title: "Banking and money basics for newcomers",
    description:
      "Opening your first Canadian bank account, building credit, and budgeting tips for settling in.",
    author: "Settlement.org",
    date: "2026-05-28T11:00:00Z",
    category: null,
    imageLink:
      "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80&auto=format&fit=crop",
    link: "https://settlement.org/ontario/daily-life/banking-and-money/",
  },
];
