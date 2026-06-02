import type { NewsItem } from "@/types";

/**
 * National newcomer news — the real `news_details` rows (Phase 18). Mirrors the
 * Supabase seed so the local-dev / env-not-configured fallback matches
 * production. The Home widget shows the first 3; the Community News tab shows
 * all. `category` is null until the content team tags rows; items link out to
 * the source article (no in-app news detail page).
 */
export const newsItems: NewsItem[] = [
  {
    id: 1,
    title: "Navigating Winter Roads in Canada",
    description:
      "New to snow? ICBC article to help you avoid issues on the icy, winter roads. Learn essential winter driving tips and safety precautions.",
    author: "ICBC",
    date: "2024-12-15T10:00:00Z",
    category: null,
    imageLink:
      "https://media.canadianunderwriter.ca/uploads/2017/10/iStock-636598208.jpg",
    link: "https://www.icbc.com/driver-licensing/winter-driving",
  },
  {
    id: 2,
    title: "Financial Planning Tips for Newcomers",
    description:
      "Essential tips for managing your finances in Canada. Learn about banking, credit, taxes, and budgeting strategies.",
    author: "Financial Advisor",
    date: "2024-12-10T14:30:00Z",
    category: null,
    imageLink:
      "https://www.bankrate.com/2023/06/27140300/What-is-financial-planning-SEO-NEW-ARTICLE-.jpeg?auto=webp&optimize=high&crop=16:9",
    link: "https://www.canada.ca/en/financial-consumer-agency.html",
  },
  {
    id: 3,
    title: "Understanding Canadian Healthcare System",
    description:
      "A comprehensive guide to navigating the Canadian healthcare system and understanding your coverage options.",
    author: "Health Canada",
    date: "2024-12-05T09:15:00Z",
    category: null,
    imageLink:
      "https://www.heritage.org/sites/default/files/styles/facebook_optimized/public/images/2020-02/GettyImages-1178057952.jpg?itok=6OFC17zR4",
    link: "https://www.canada.ca/en/health-canada/services/health-care-system.html",
  },
  {
    id: 4,
    title: "Complete Guide to Settling in Canada",
    description:
      "A comprehensive resource covering all aspects of life in Canada for newcomers, from housing to employment to social integration.",
    author: "Immigration Services Canada",
    date: "2024-11-28T16:45:00Z",
    category: null,
    imageLink: "https://www.cicnews.com/wp-content/uploads/2023/06/WES-ECA-1024x683.jpg",
    link: "https://www.canada.ca/en/immigration-refugees-citizenship/services/new-immigrants.html",
  },
];
