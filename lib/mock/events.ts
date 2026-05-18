import type { CommunityEvent } from "@/types";

// TODO: replace with real data — mock community events.
export const events: CommunityEvent[] = [
  {
    id: "e1",
    title: "Newcomer Settlement Workshop",
    eventDatetime: "2026-05-22T18:00:00",
    location: "Toronto Reference Library, Toronto",
    eventType: "in-person",
    coverPhotoUrl: "https://picsum.photos/seed/evt-workshop/640/360",
    externalLink: "https://example.com/events/settlement-workshop",
    hostedBy: "Toronto Newcomer Services",
    description:
      "A hands-on session covering the essentials of your first months in Canada — registering for a SIN, opening a bank account, finding housing, and accessing health coverage. Settlement counsellors will be on hand for one-on-one questions afterward.",
  },
  {
    id: "e2",
    title: "Virtual Job Search Bootcamp",
    eventDatetime: "2026-05-25T17:30:00",
    location: "Online — Zoom",
    eventType: "online",
    coverPhotoUrl: "https://picsum.photos/seed/evt-jobsearch/640/360",
    externalLink: "https://example.com/events/job-search-bootcamp",
    hostedBy: "Unify Careers Team",
    description:
      "A two-hour online workshop on the Canadian job market — tailoring your resume to local norms, writing a cover letter, and networking on LinkedIn. Bring your resume for live feedback during the session.",
  },
  {
    id: "e3",
    title: "Community Welcome Picnic",
    eventDatetime: "2026-06-01T15:00:00",
    location: "Stanley Park, Vancouver",
    eventType: "in-person",
    coverPhotoUrl: "https://picsum.photos/seed/evt-picnic/640/360",
    externalLink: "https://example.com/events/welcome-picnic",
    hostedBy: "Vancouver Welcome Collective",
    description:
      "An afternoon in the park to meet other newcomers and settled families. Food, games for kids, and a chance to grow your local network. All are welcome — bring a dish to share if you can.",
  },
  {
    id: "e4",
    title: "Resume & Interview Skills Webinar",
    eventDatetime: "2026-05-28T19:00:00",
    location: "Calgary Public Library + Online",
    eventType: "hybrid",
    coverPhotoUrl: "https://picsum.photos/seed/evt-resume/640/360",
    externalLink: "https://example.com/events/resume-webinar",
    hostedBy: "Prairie Settlement Network",
    description:
      "Learn how Canadian employers read resumes and run interviews. Covers the STAR method, common interview questions, and follow-up etiquette. Join in person in Calgary or online.",
  },
  {
    id: "e5",
    title: "Banking Basics for Newcomers",
    eventDatetime: "2026-05-30T18:30:00",
    location: "Online — Zoom",
    eventType: "online",
    coverPhotoUrl: "https://picsum.photos/seed/evt-banking/640/360",
    externalLink: "https://example.com/events/banking-basics",
    hostedBy: "Unify Financial Literacy",
    description:
      "Understand chequing versus savings accounts, how to start building a Canadian credit history, avoiding common fees, and choosing a newcomer banking package. A short Q&A follows the presentation.",
  },
];

export function getEventById(id: string): CommunityEvent | undefined {
  return events.find((event) => event.id === id);
}
