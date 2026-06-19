import type { NewsItem } from "@/types";

/**
 * National newcomer news. The Home `NationalNewsWidget` renders this list
 * directly (it does not read the DB), and it doubles as the local-dev /
 * env-not-configured fallback for the Community News tab (`getNews`). Curated,
 * verified-working links to Canadian government + reputable settlement / news
 * sources; `imageLink` is null (no thumbnails — avoids dead images), `category`
 * is null (untagged), and items link out to the source (no in-app detail page).
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
    imageLink: null,
    link: "https://www.cicnews.com/",
  },
  {
    id: 2,
    title: "Renting a home in Canada: what newcomers should know",
    description:
      "Leases, deposits, tenant rights, and how to find a place to rent — a guide from Canada's national housing agency.",
    author: "CMHC",
    date: "2026-06-12T14:30:00Z",
    category: null,
    imageLink: null,
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
    imageLink: null,
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
    imageLink: null,
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
    imageLink: null,
    link: "https://settlement.org/ontario/daily-life/banking-and-money/",
  },
];
