import type { CommunityEvent } from "@/types";

/**
 * Community events — hard-coded from the mobile app's `events` table (Phase 18).
 * The web has no events-management surface, so this list is the single source of
 * truth in every environment (the service returns it directly, and the event
 * detail page reads it via getEventById). Datetimes are the exact source instants
 * (UTC); the UI renders them in Pacific time (events are BC-based). To refresh,
 * re-export the mobile `events` rows and remap to the CommunityEvent shape.
 */
export const events: CommunityEvent[] = [
  {
    id: 35,
    title: "Holiday Market",
    eventDatetime: "2025-12-23T22:00:00Z",
    location: "Burnaby Neighbourhood House",
    eventType: "in-person",
    coverPhotoUrl:
      "https://events.ubc.ca/wp-content/uploads/2025/11/holidaymarket_8-2048x1365-1-e1762986673217.jpg",
    externalLink:
      "https://burnabynh.ca/wp-content/uploads/2025/12/Holiday-Market.pdf",
    hostedBy: null,
    genre: "Socials",
    description:
      "Hosted by Burnaby Neighbourhood House\nCome and explore a vibrant marketplace featuring unique products from newcomer women entrepreneurs. Enjoy festive vibes, shop for gifts, connect with your community, and support and empower newcomer women!\nFree Entry - All are Welcome!",
  },
  {
    id: 36,
    title: "Unify's Resume, Interview, and Cover Letter Workshop",
    eventDatetime: "2026-01-11T22:30:00Z",
    location: "Surrey Libraries - Fleetwood Branch",
    eventType: "in-person",
    coverPhotoUrl:
      "https://img.freepik.com/premium-photo/candidate-handing-resume-cv-table-interviewer-entity_31965-179383.jpg?semt=ais_hybrid&w=740&q=80",
    externalLink:
      "https://www.eventbrite.com/e/unifys-free-resume-interview-and-cover-letter-workshop-tickets-1977673717326?aff=oddtdtcreator",
    hostedBy: null,
    genre: "Employment",
    description:
      "Get guidance on résumés, cover letters, and interview tips to help you stand out in the Canadian job market.\nAre you finding it hard to get noticed by employers as a newcomer in Canada?\nJoin our Resume, Cover Letter & Interview Workshop, hosted by Unify, and learn the essential tools to succeed in the Canadian job market.\nOur Unify Gather team will walk you through how to create a strong, well-structured résumé tailored to Canadian job postings — including formatting, professional summaries, key skills, accomplishment statements, and how to tailor your application to specific roles. You’ll review examples, learn effective action verbs, and discover what makes an application stand out.\nWe’ll also cover how to write a clear, compelling cover letter, focusing on structure, tone, and how to highlight your value in a way employers understand.\nFinally, we’ll dive into interview preparation, including practical tips for common questions, the STAR method, and strategies to present yourself confidently.\nWith personalized feedback and hands-on support, you’ll leave with a stronger résumé, a polished cover letter, and interview strategies to help you confidently approach Canadian employers.",
  },
  {
    id: 39,
    title: "Navigating the Healthcare System in BC with Unify",
    eventDatetime: "2026-02-14T22:30:00Z",
    eventEndDatetime: "2026-02-15T00:30:00Z",
    location: "Surrey Libraries - Fleetwood Branch",
    eventType: "in-person",
    coverPhotoUrl:
      "https://cdn-az.allevents.in/events2/banners/e0a3cbae200517eb3dabc73643a17256ee7d116baf9057fc525a8de416c812c8-rimg-w1200-h390-dc042c5f-gmir.jpg?v=1766753309",
    externalLink:
      "https://www.eventbrite.ca/e/navigating-the-healthcare-system-in-bc-with-unify-tickets-1978767875984?aff=ebdsoporgprofile",
    hostedBy: "Unify",
    genre: "Health",
    description:
      "Join us for an informative session hosted by Unify to help newcomers to Canada better understand and navigate the healthcare system in British Columbia. This workshop will cover essential healthcare topics, including:\nUnderstanding BC’s Healthcare System: Learn about the Medical Services Plan (MSP), how it works, and why it’s important to register as soon as you arrive.\nHow to Apply for MSP as a Newcomer: Step-by-step guidance on the application process, required documents, and timelines to ensure you get coverage without delays.\nAccessing Healthcare Services: Learn how to find family doctors, walk-in clinics, and specialists, and understand your rights to healthcare services.\nHealth Insurance & Prescription Coverage: Get tips on prescription medications, the Pharmacare program, and how to ensure you are covered for medical expenses.\nNavigating the System: Discover how to book appointments, prepare for medical visits, and what to do in case of emergencies.\nThis hands-on workshop will provide practical advice and resources to help newcomers confidently navigate the BC healthcare system. You'll leave with clear, actionable steps to ensure your health and well-being in your new home.\nDon’t miss out on this essential opportunity to get your questions answered and start your journey to accessing healthcare in BC with ease!",
  },
  {
    id: 41,
    title: "English Connect Cafe",
    eventDatetime: "2026-02-04T22:00:00Z",
    location: "MOSAIC - Boundary",
    eventType: "in-person",
    coverPhotoUrl:
      "https://mosaicbc.org/wp-content/uploads/2026/01/Cafe-Event-scaled.png",
    externalLink: "https://mosaicbc.org/event/english-connect-cafe/",
    hostedBy: "MOSAIC",
    genre: "Language",
    description:
      "A casual, welcoming drop-in style gathering where newcomers and community members can practice English through real conversation, build confidence speaking, and meet new people in a low-pressure environment.",
  },
  {
    id: 42,
    title: "Canadian Citizenship Application (English, Spanish)",
    eventDatetime: "2026-02-12T02:00:00Z",
    eventEndDatetime: "2026-02-12T04:00:00Z",
    location: "Online (MS Teams)",
    eventType: "online",
    coverPhotoUrl: "https://issbc.org/wp-content/uploads/2026/01/DC5.png",
    externalLink:
      "https://issbc.org/event/canadian-citizenship-application/2026-02-11/",
    hostedBy: "ISSofBC",
    genre: "Documentation",
    description:
      "Part of a free multi-session workshop series that walks participants through eligibility, required documents, the citizenship application process, and test preparation using Discover Canada, with practice questions to build confidence.",
  },
  {
    id: 43,
    title: "New Roots with Unify x Square One",
    eventDatetime: "2026-02-07T21:15:00Z",
    eventEndDatetime: "2026-02-08T01:00:00Z",
    location: "Capilano University - North Vancouver",
    eventType: "in-person",
    coverPhotoUrl:
      "https://cdn-az.allevents.in/events4/banners/336d7d8c595104ee5547424239a1c1acbac87f0644e8658f51cee224c59d8b69-rimg-w1200-h600-dcfefcf0-gmir.jpg?v=1768995107",
    externalLink:
      "https://www.eventbrite.ca/e/new-roots-with-unify-x-square-one-tickets-1980938833376?aff=oddtdtcreator#location",
    hostedBy: null,
    genre: "Socials",
    description:
      "Learn how to thrive in Canada with hands-on workshops, real conversations, and meaningful connections made just for international students\nJoin Unify for an interactive afternoon designed to help international students navigate life in Canada. The event features engaging panels with accomplished industry professionals, real student stories, and hands-on workshops covering topics like working in Canada, mental well-being, staying connected with family, and managing money confidently.\nAttendees will gain practical tips, expert insights, and resources they can use right away. There will also be time to ask questions, network with professionals, connect with peers, and build a strong sense of community. Whether you’re new to Canada or settling in, you’ll leave feeling informed, supported, and more confident moving forward.",
  },
  {
    id: 44,
    title: "Resume Clinic: Elevate Your Application",
    eventDatetime: "2026-02-19T21:00:00Z",
    eventEndDatetime: "2026-02-20T00:00:00Z",
    location: "Brentwood Community Resources Centre",
    eventType: "in-person",
    coverPhotoUrl:
      "https://mosaicbc.org/wp-content/uploads/2026/01/resume-clinic-event-scaled.png",
    externalLink:
      "https://mosaicbc.org/event/resume-clinic-mosaic-brentwood/2026-02-19/",
    hostedBy: "MOSAIC (BC Newcomer Services Program)",
    genre: "Employment",
    description:
      "A practical, hands-on résumé support session where participants can get help polishing formatting, tailoring to roles, highlighting skills clearly, and avoiding common recruiter \"don'ts\" so their application reads more competitively.",
  },
  {
    id: 45,
    title: "Conflict Literacy in the Workplace",
    eventDatetime: "2026-02-25T20:00:00Z",
    eventEndDatetime: "2026-02-25T21:00:00Z",
    location: "Online",
    eventType: "online",
    coverPhotoUrl:
      "https://issbc.org/wp-content/uploads/2026/01/Conflict-at-work.jpg",
    externalLink: "https://issbc.org/event/conflict-literacy-in-the-workplace/",
    hostedBy: "ISSofBC",
    genre: "Employment",
    description:
      "A workplace-focused session that helps participants strengthen communication during conflict, understand common workplace challenges, and build practical strategies for navigating misunderstandings more professionally and calmly.",
  },
  {
    id: 46,
    title: "Free Online English Conversation Circle for PR Women",
    eventDatetime: "2026-02-27T19:00:00Z",
    location: "Online",
    eventType: "online",
    coverPhotoUrl: "https://mosaicbc.org/wp-content/uploads/2022/07/event.jpg",
    externalLink:
      "https://mosaicbc.org/event/free-online-english-conversation-circle-pr-women-2-2-2/2026-02-27/",
    hostedBy: "MOSAIC",
    genre: "Language",
    description:
      "A supportive online conversation circle for PR and protected person women at an upper-beginner level to practice English speaking, build confidence, and form new connections in a friendly group environment.",
  },
  {
    id: 47,
    title: "Interview Skills Workshop",
    eventDatetime: "2026-02-27T21:00:00Z",
    eventEndDatetime: "2026-02-27T23:00:00Z",
    location: "Online",
    eventType: "online",
    coverPhotoUrl:
      "https://issbc.org/wp-content/uploads/2026/01/tips-for-improving-your-job-interview-skills-300x200.png",
    externalLink:
      "https://issbc.org/event/interview-skills-workshop-bc-nsp-safe-heaven-4/",
    hostedBy: "ISSofBC",
    genre: "Employment",
    description:
      "A skills-building workshop covering interview strategies, how to answer common questions, and how to present yourself confidently and professionally, with practical tips to help you stand out in the Canadian job market.",
  },
  {
    id: 48,
    title: "Newcomers Connect Forum: Skills, Wellbeing & Career Conversations",
    eventDatetime: "2026-03-21T15:30:56Z",
    eventEndDatetime: "2026-03-21T23:00:00Z",
    location: "UBC Robson Square - Vancouver, BC",
    eventType: "in-person",
    coverPhotoUrl:
      "https://www.eventbrite.ca/e/_next/image?url=https%3A%2F%2Fimg.evbuc.com%2Fhttps%253A%252F%252Fcdn.evbuc.com%252Fimages%252F1178966440%252F164782168984%252F1%252Foriginal.20260304-003530%3Fcrop%3Dfocalpoint%26fit%3Dcrop%26w%3D940%26auto%3Dformat%252Ccompress%26q%3D75%26sharp%3D10%26fp-x%3D0.038%26fp-y%3D0.293%26s%3D1fdb3b9af069fde84120915c9fbfda87&w=940&q=75",
    externalLink:
      "https://www.eventbrite.ca/e/newcomers-connect-forum-skills-wellbeing-career-conversations-tickets-1983481615907?aff=ebdssbdestsearch#location",
    hostedBy: "YWCA Career Paths for Skilled Immigrants",
    genre: "Employment",
    description:
      "This event offers clients a unique opportunity to explore employment supports, gain insight into job opportunities, and build connections.\nThis event brings together community, opportunity, and practical support for your career journey.\nThe forum is designed to support newcomers from all backgrounds, giving attendees the chance to explore a variety of employment resources and gain insights into starting or advancing a career in Canada.\nThe day features guest speakers, interactive breakout sessions, and networking opportunities—offering multiple ways to learn, connect, and take the next step toward meaningful employment.\nKeynote: Adina Gray – AI, Work & Opportunity: What Immigrant Professionals Need to Know\nLearn how generative AI is reshaping Canadian workplaces and how to use these tools to strengthen your communication, productivity, and professional impact. With 15+ years in business education and as Founder of PurpleOwl AI, Adina equips professionals with practical, responsible AI skills that enhance, not replace human potential.",
  },
  {
    id: 49,
    title: "Canadian Job Expo",
    eventDatetime: "2026-06-27T18:00:00Z",
    eventEndDatetime: "2026-06-28T01:00:00Z",
    location: "Nikkei Cultural Center Burnaby",
    eventType: "in-person",
    coverPhotoUrl:
      "https://www.eventbrite.ca/e/_next/image?url=https%3A%2F%2Fimg.evbuc.com%2Fhttps%253A%252F%252Fcdn.evbuc.com%252Fimages%252F1170502237%252F2021934101643%252F1%252Foriginal.20251108-235144%3Fcrop%3Dfocalpoint%26fit%3Dcrop%26w%3D940%26auto%3Dformat%252Ccompress%26q%3D75%26sharp%3D10%26fp-x%3D0.5%26fp-y%3D0.5%26s%3D3c5599e308738ba1895a17f91d4e4770&w=940&q=75",
    externalLink:
      "https://www.eventbrite.ca/e/canadian-job-expo-june-27-2026-nikkei-cultural-center-burnaby-tickets-1966379274343?aff=ebdssbdestsearch",
    hostedBy: "Vancouver Young Volunteer Association",
    genre: "Employment",
    description:
      "Get in front of hiring managers! Network and apply with Employer Vendors. Recruiter Panel, Finance & Workplace wellness workshop available!\nWelcome to the Job Fair presented by Canadian Cultural Festival sponsored by BCIT!\nLooking for your next opportunity? This Job Fair connects you directly with hiring managers from top organizations. Network with employer vendors, apply on the spot, and start building the professional relationships you need to grow your career.\nExplore exciting career pathways and gain valuable insights from our Training Exhibitors, including resources on diplomas, certifications, and newcomer support services. Learn about financial assistance, HR recruiting tips, and professional networking strategies that can help you land your next job.",
  },
  {
    id: 50,
    title: "Conversation Circles",
    eventDatetime: "2026-03-20T16:30:00Z",
    eventEndDatetime: "2026-03-20T18:00:00Z",
    location: "Online",
    eventType: "online",
    coverPhotoUrl: "https://issbc.org/wp-content/uploads/2025/06/yk2.png",
    externalLink:
      "https://issbc.org/event/friday-conversation-circle-online-3/2026-03-20/",
    hostedBy: "ISSofBC",
    genre: "Language",
    description:
      "Are you a Newcomer who would like to:\n- Explore new topics together?\n- Share your ideas and experience?\n- Learn something new?\n- Have Fun!!\nWe are here to support you!\nJoin our Fridays Conversation Circle via MS TEAMS! Connect, communicate, and grow your confidence in English through fun and friendly conversations. It’s a great way to meet others, share stories, and feel part of the community.\nEligibility Criteria\n❑ Permanent Residents and Protected Persons living in the Lower Mainland, BC.\n❑ International Student, Refugee Claimants, and Temporary Foreign Workers ONLY living in Maple Ridge or Pitt Meadows.\n❑ Naturalized Canadian citizens ONLY living in Maple Ridge or Pitt Meadows.\nNote: Registration is strictly required due to limited space. For Inquiries: Send an email to [yumiko.king@issbc.org] or call [778-372-6568]",
  },
  {
    id: 51,
    title: "Solid Start 360 Employment Program – Info Session",
    eventDatetime: "2026-03-30T20:00:00Z",
    eventEndDatetime: "2026-03-30T20:30:00Z",
    location: "Online",
    eventType: "online",
    coverPhotoUrl:
      "https://issbc.org/wp-content/uploads/2025/08/JobQuest_CareerFair_August21_Jobseeker2.jpg",
    externalLink:
      "https://issbc.org/event/solid-start-360-employment-program-info-session-online-14/2026-03-30/",
    hostedBy: "ISSofBC",
    genre: "Employment",
    description:
      "Ready to Work in British Columbia\nAre you a newcomer looking to start your career in BC? Our free employment program offers personalized support to help you succeed in the local labour market. Benefit from one-on-one job search coaching, group workshops (in-person, online, or self-paced), resume and interview guidance, and access to job postings and employer referrals. Connect with employers through job fairs and mentoring events, and gain experience through career-relevant volunteering.\nJoin an Info Session to learn more about how we can support your job search journey.\nWho Can Attend:\n- Permanent Resident\n- Protected Persons (as defined by IRPA)\n- Individuals selected for PR (with IRCC letter)\n- Living in British Columbia in Vancouver, New Westminster, Coquitlam, Port Coquitlam, Port Moody, Maple Ridge, and Pitt Meadows",
  },
  {
    id: 52,
    title: "Career Paths for Skilled Immigrants Information Session",
    eventDatetime: "2026-03-31T19:00:00Z",
    eventEndDatetime: "2026-03-31T20:00:00Z",
    location: "Online",
    eventType: "online",
    coverPhotoUrl:
      "https://issbc.org/wp-content/uploads/2025/05/New-West-info-Session--1024x513.jpg",
    externalLink:
      "https://issbc.org/event/career-paths-for-skilled-immigrants-information-session-3/2026-03-31/",
    hostedBy: "ISSofBC",
    genre: "Employment",
    description:
      "As a skilled immigrant, this is your opportunity to learn how Career Paths can assist you with returning to your pre-arrival profession.\nIn this session you will learn more information on our services, such as:\n- Credential evaluations and obtaining BC licenses\n- Regulatory body and association memberships\n- Skills and course funding\n- Career planning and job search support\n- Work placement opportunities\n- Connections to BC employers\n- Access to BC Mentors",
  },
  {
    id: 53,
    title:
      "Honouring International Women’s Day: Strength in Community and Connection",
    eventDatetime: "2026-03-26T17:00:00Z",
    location: "MOSAIC Head Office (Boundary)",
    eventType: "in-person",
    coverPhotoUrl:
      "https://mosaicbc.org/wp-content/uploads/2026/03/Honoring-International-Womens-Day-980x551.png",
    externalLink: "https://mosaicbc.org/event/honoring-international-womens-day/",
    hostedBy: "MOSAIC BC",
    genre: "Documentation",
    description:
      "Organized by the Violence Prevention Program (VPP) team, this event marks International Women’s Day by creating a supportive and empowering space for connection, learning, and community care. This event is centered on supporting those seeking legal knowledge while also creating space to gather, reflect, and share experiences with others in a supportive environment.\nEvent Overview:\n- Welcome & Introductions\n- Private lawyer clinic (appointment based)\n- Art and Wellness Activities (Origami, coloring)\n- Community sharing & connection\n- Snacks/refreshments provided\nParticipants will have the opportunity to book a private 20‑minute appointment with a family lawyer from PGS Law, offering a chance to ask legal questions and receive general information. Alongside the legal clinic, the day will include a sharing circle, individual art stations, community resource sharing, and a guided origami activity to thoughtfully close the event.",
  },
  {
    id: 54,
    title: "New Immigrants Orientation: Employment",
    eventDatetime: "2026-03-25T17:00:00Z",
    eventEndDatetime: "2026-03-25T19:00:00Z",
    location: "Online",
    eventType: "online",
    coverPhotoUrl: "https://issbc.org/wp-content/uploads/2025/06/Orientation.jpg",
    externalLink:
      "https://successbc.ca/event/new-immigrants-orientation-employment-english-multilingual-translated-captions-available/",
    hostedBy: "SUCCESS – Immigration Settlement and Integration Program",
    genre: "Employment",
    description:
      "Contents:\n- Types of Employment in B.C.\n- Know Your Rights as a Job Applicant\n- Foreign Credential Recognition and Certification\n- Managing Expectations, Overcoming Challenges, and Accessing Support",
  },
];

export function getEventById(id: number): CommunityEvent | undefined {
  return events.find((event) => event.id === id);
}
