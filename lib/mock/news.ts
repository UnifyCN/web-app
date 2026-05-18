import type { NewsItem } from "@/types";

// TODO: replace with real data — mock national newcomer news.
// The Home widget shows the first 3; the Community News tab shows all.
export const newsItems: NewsItem[] = [
  {
    id: "n1",
    title: "Express Entry draw invites 3,000 skilled-worker candidates",
    description:
      "The latest federal draw lowered the CRS cut-off score — the third invitation round this month.",
    author: "IRCC Newsroom",
    date: "2026-05-15T13:00:00Z",
    category: "Immigration",
    imageLink: "https://picsum.photos/seed/news-immigration/240/240",
  },
  {
    id: "n2",
    title: "2026 rent-increase guideline capped at 2.5%",
    description:
      "Provinces confirm the maximum allowable annual rent increase for existing tenancies.",
    author: "Housing Desk",
    date: "2026-05-13T10:30:00Z",
    category: "Housing",
    imageLink: "https://picsum.photos/seed/news-housing/240/240",
  },
  {
    id: "n3",
    title: "Free settlement workshops expand to 12 new cities",
    description:
      "Newcomer service agencies add evening sessions on banking, taxes, and job search.",
    author: "Settlement Network",
    date: "2026-05-10T16:45:00Z",
    category: "Settlement",
    imageLink: "https://picsum.photos/seed/news-settlement/240/240",
  },
  {
    id: "n4",
    title: "Provincial Nominee Program streams reopen for healthcare workers",
    description:
      "Several provinces resume nominations targeting nurses, care aides, and allied health roles.",
    author: "IRCC Newsroom",
    date: "2026-05-08T11:15:00Z",
    category: "Immigration",
    imageLink: "https://picsum.photos/seed/news-pnp/240/240",
  },
  {
    id: "n5",
    title: "New tax-filing guide published for first-time residents",
    description:
      "The CRA releases a plain-language walkthrough for newcomers filing a Canadian return for the first time.",
    author: "CRA Communications",
    date: "2026-05-05T09:00:00Z",
    category: "Finance",
    imageLink: "https://picsum.photos/seed/news-tax/240/240",
  },
  {
    id: "n6",
    title: "Language-class waitlists shorten as funding expands",
    description:
      "Federal funding adds thousands of LINC and CLB assessment seats across the country.",
    author: "Settlement Network",
    date: "2026-05-02T14:20:00Z",
    category: "Education",
    imageLink: "https://picsum.photos/seed/news-language/240/240",
  },
];
