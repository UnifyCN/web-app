import type { TFunction } from "i18next";
import type {
  CategoryWithCount,
  Cost,
  LocalizedPartner,
  Partner,
  PartnerCategory,
} from "@/types";
import { CATEGORY_ORDER } from "./categories";
import { localizePartner, partnerCopyKey } from "./localizePartner";

/**
 * Partner directory for the Resources tab. Hardcoded for V1 — there is no
 * Supabase table or Sanity type behind it.
 *
 * STRUCTURE ONLY — every human-readable string lives in the locale files under
 * `resources.partners.<slug>` (copied verbatim from mobile in all 7 languages)
 * and is resolved at render time by `localizePartner`. Nothing here is shown to
 * a person except `name` and the contact values, which are proper nouns.
 *
 * Synced from mobile constants/Partners.ts (UnifyCN/mobile-app main @ ce38ba1).
 * Web differences: `ctaLabelKey` re-namespaced from `learn.resources.cta.*` to
 * `resources.cta.*`; web logo paths under /public/resources/logos (+ `logoFit`)
 * instead of require()s; mobile's `spotlight` flag is not ported (web shows no
 * promo placements). Web and mobile are still separate copies — see BACKLOG.md
 * "Resources: one shared partner source".
 */
export const PARTNERS: Partner[] = [
  // ── Getting Settled ─────────────────────────────────────────────────────
  {
    slug: "diversecity",
    name: "DIVERSEcity",
    category: "gettingSettled",
    partnershipType: "resource",
    website: "https://www.dcrs.ca/",
    phone: "604-597-0205",
    email: "info@dcrs.ca",
    address: "13455 76 Avenue, Surrey, BC V3W 2W3",
    programs: [
      {
        id: "diversecity-settlement-services",
        cost: "free",
        url: "https://www.dcrs.ca/our-services/settlement-services/",
      },
      {
        id: "diversecity-linc",
        cost: "free",
        url: "https://www.dcrs.ca/our-services/english-language-programs/language-instruction-for-newcomers-to-canada-linc/",
      },
      {
        id: "diversecity-safe-haven",
        cost: "free",
        url: "https://www.dcrs.ca/our-services/settlement-services/services-for-non-permanent-residents/safe-haven-program/",
      },
      {
        id: "diversecity-rise",
        url: "https://www.dcrs.ca/our-services/programs-for-refugees/",
      },
      {
        id: "diversecity-employment-programs",
        url: "https://www.dcrs.ca/our-services/employment-programs/",
      },
      {
        id: "diversecity-early-childhood-education",
        cost: "free",
        url: "https://www.dcrs.ca/our-services/english-language-programs/early-childhood-education-program/",
      },
      {
        id: "diversecity-mental-health-and-substance-use-services",
        url: "https://www.dcrs.ca/our-services/mental-health-and-substance-use-services/",
      },
      {
        id: "diversecity-language-testing-centre-celpip",
        url: "https://www.dcrs.ca/our-services/celpip/",
      },
    ],
    logo: "/resources/logos/diversecity.svg",
    logoFit: "contain",
    displayOrder: 0,
    active: true,
  },
  {
    slug: "burnaby-neighbourhood-house",
    name: "Burnaby Neighbourhood House",
    category: "gettingSettled",
    partnershipType: "resource",
    website: "https://burnabynh.ca/",
    phone: "(604) 431-0400",
    email: "receptiona@burnabynh.ca",
    address: "#100 – 4460 Beresford St, Burnaby, BC V5H 0B8",
    programs: [
      {
        id: "burnaby-neighbourhood-house-newcomers-settlement-services",
        url: "https://burnabynh.ca/programs-and-services/newcomers-settlement-services/",
      },
      {
        id: "burnaby-neighbourhood-house-information-and-orientation",
        url: "https://burnabynh.ca/programs-and-services/newcomers-settlement-services/",
      },
      {
        id: "burnaby-neighbourhood-house-naars",
        url: "https://burnabynh.ca/programs-and-services/newcomers-settlement-services/",
      },
      {
        id: "burnaby-neighbourhood-house-community-connections",
        url: "https://burnabynh.ca/programs-and-services/newcomers-settlement-services/",
      },
      {
        id: "burnaby-neighbourhood-house-food-security",
        url: "https://burnabynh.ca/programs-and-services/community-program/food-security-programs/",
      },
      {
        id: "burnaby-neighbourhood-house-child-care",
        url: "https://burnabynh.ca/programs-and-services/child-care-programs/",
      },
      {
        id: "burnaby-neighbourhood-house-volunteer-income-tax-program",
        url: "https://burnabynh.ca/programs-and-services/community-program/volunteer-income-tax-program/",
      },
    ],
    logo: "/resources/logos/burnaby-neighbourhood-house.webp",
    displayOrder: 1,
    active: true,
  },
  {
    slug: "ymca-bc",
    name: "YMCA BC",
    category: "gettingSettled",
    partnershipType: "resource",
    website: "https://www.ymcabc.ca/",
    cost: "mixed",
    phone: "604-681-9622",
    email: "information.request@ymcabc.ca",
    // Head office. The newcomer programs themselves run at the Robert Lee YMCA
    // in downtown Vancouver.
    address: "620 Royal Ave #10, New Westminster, BC V3M 1J2",
    programs: [
      {
        id: "ymca-bc-english-conversation-club",
        cost: "free",
        url: "https://www.ymcabc.ca/employment-and-newcomers/english-conversation-club",
      },
      {
        id: "ymca-bc-citizenship-test-prep",
        cost: "free",
        url: "https://www.ymcabc.ca/employment-and-newcomers/canadian-citizenship-preparation",
      },
      {
        id: "ymca-bc-connect2work",
        cost: "free",
        url: "https://www.ymcabc.ca/employment-and-newcomers",
      },
      {
        id: "ymca-bc-international-students-employment-support",
        cost: "free",
        url: "https://www.ymcabc.ca/employment-and-newcomers/international-students-employment-support",
      },
      {
        id: "ymca-bc-self-employment-program",
        cost: "free",
        url: "https://www.ymcabc.ca/employment-and-newcomers/self-employment-program",
      },
      {
        id: "ymca-bc-explore-child-care-career",
        cost: "free",
        url: "https://www.ymcabc.ca/employment-and-newcomers/explore-career-in-childcare-newcomers-program",
      },
      {
        id: "ymca-bc-wellness-connection",
        url: "https://www.ymcabc.ca/employment-and-newcomers/wellness-connection-newcomers",
      },
    ],
    logo: "/resources/logos/ymca-bc.png",
    displayOrder: 2,
    active: true,
  },
  // ── Find Work ───────────────────────────────────────────────────────────
  {
    slug: "iec-bc",
    name: "Immigrant Employment Council of BC",
    category: "findWork",
    partnershipType: "resource",
    website: "https://iecbc.ca/",
    cost: "free",
    phone: "(604) 629-5364",
    email: "employerengagement@iecbc.ca",
    address: "720 – 750 West Pender St, Vancouver, BC V6C 2T7",
    programs: [
      {
        id: "iec-bc-talentconnect",
        cost: "free",
        url: "https://iecbc.ca/for-talent/connect-with-employers/",
      },
      {
        id: "iec-bc-mentorconnect",
        cost: "free",
        url: "https://iecbc.ca/mentorconnect/",
      },
      {
        id: "iec-bc-ascend",
        cost: "free",
        url: "https://ascendemployment.com/participants/",
      },
      {
        id: "iec-bc-fast",
        cost: "free",
        url: "https://fastcanada.ca/",
      },
    ],
    logo: "/resources/logos/iec-bc.png",
    displayOrder: 0,
    active: true,
  },
  {
    slug: "newcomer-jobs-canada",
    name: "Newcomer Jobs Canada",
    category: "findWork",
    partnershipType: "resource",
    website: "https://newcomerjobscanada.ca/",
    cost: "mixed",
    phone: "(306) 229-6774",
    logo: "/resources/logos/newcomer-jobs-canada.png",
    displayOrder: 1,
    active: true,
  },
  // ── Immigration Help ────────────────────────────────────────────────────
  // Copy, programs, languages and cost supplied by the partner by email on
  // 2026-09-18. The slug predates the
  // rename and stays put — it is the analytics and route key. On 2026-09-22
  // the partner asked that the /unify/ referral link be the only way out of
  // the listing so it can attribute referrals: programs carry no links and
  // ctaOnly suppresses the call, email and directions actions.
  {
    slug: "canada-shaw-immigration",
    name: "Canada Shaws Consulting Inc.",
    category: "immigrationHelp",
    partnershipType: "referral",
    // Affiliate link supplied by the partner; deliberately unlabelled in the
    // UI and opened by the standard Website button.
    website: "https://www.immshaws.com/unify/",
    ctaLabelKey: "resources.cta.bookIntroMeeting",
    cost: "mixed",
    phone: "+1 672-867-6886",
    email: "info@canadashaws.com",
    address: "308-5811 Cooney Rd, Richmond, BC V6X 3M1",
    ctaOnly: true,
    programs: [
      { id: "canada-shaw-immigration-study-in-canada" },
      { id: "canada-shaw-immigration-work-in-canada" },
      { id: "canada-shaw-immigration-permanent-residency" },
      { id: "canada-shaw-immigration-visas-extensions" },
      { id: "canada-shaw-immigration-other-services" },
    ],
    lastVerified: "2026-09-18",
    logo: "/resources/logos/canada-shaw-immigration.png",
    logoFit: "contain",
    displayOrder: 0,
    active: true,
  },
  // HELD INACTIVE — unverifiable. Its About page publishes "MEMBER ID:
  // R123456", a template placeholder, names no consultant, and carries another
  // firm's copy ("Maple Leaf Visas"). A paid representative who is not
  // CICC-registered is acting illegally, and this audience is who that harms.
  // Re-activate only once someone confirms the business by phone and against
  // college-ic.ca. Tracked in .design/state.json.
  {
    slug: "global-connect-immigration",
    name: "Global Connect Immigration",
    category: "immigrationHelp",
    partnershipType: "referral",
    website: "https://globalconnectmigration.com/",
    cost: "paid",
    phone: "+1 (604) 495-1927",
    email: "info@globalconnectmigration.com",
    address: "8556 120th Street, Unit 208, Surrey, BC V3W 3N5",
    programs: [
      {
        id: "global-connect-immigration-family-sponsorship",
      },
    ],
    logo: "/resources/logos/global-connect-immigration.png",
    displayOrder: 1,
    active: false,
  },
  // ── Libraries & Learning ────────────────────────────────────────────────
  {
    slug: "burnaby-public-library",
    name: "Burnaby Public Library",
    category: "librariesLearning",
    partnershipType: "resource",
    website: "https://bpl.bc.ca/",
    ctaLabelKey: "resources.cta.joinLibrary",
    cost: "free",
    phone: "604-436-5400",
    email: "eref@bpl.bc.ca",
    address: "6100 Willingdon Ave, Burnaby, BC V5H 4N5 (Bob Prittie Metrotown)",
    programs: [
      {
        id: "burnaby-public-library-become-a-member",
        cost: "free",
        url: "https://bpl.bc.ca/people-help/welcome-desk/become-a-member",
      },
      {
        id: "burnaby-public-library-english-conversation-circle",
        cost: "free",
        url: "https://bpl.bc.ca/things-to-borrow/learning-english",
      },
      {
        id: "burnaby-public-library-learning-english",
        cost: "free",
        url: "https://bpl.bc.ca/things-to-borrow/learning-english",
      },
      {
        id: "burnaby-public-library-arrivals-in-english",
        cost: "free",
        url: "https://bpl.bc.ca/things-to-use/digital-resources/arrivals-in-english",
      },
      {
        id: "burnaby-public-library-services-for-immigrants-newcomers",
        cost: "free",
        url: "https://bpl.bc.ca/people-help/information-community-resources/services-for-immigrants",
      },
      {
        id: "burnaby-public-library-summer-reading-club",
        cost: "free",
      },
    ],
    logo: "/resources/logos/burnaby-public-library.svg",
    displayOrder: 0,
    active: true,
  },
  {
    slug: "surrey-libraries",
    name: "Surrey Libraries",
    category: "librariesLearning",
    partnershipType: "resource",
    website: "https://www.surreylibraries.ca/",
    ctaLabelKey: "resources.cta.visitWelcomeCentre",
    cost: "free",
    phone: "604-590-7847",
    email: "library-newcomers@surrey.ca",
    address:
      "City Centre Branch, 10350 University Drive, Surrey, BC V3T 4B8 (Welcome Centre on Level 4)",
    programs: [
      {
        id: "surrey-libraries-newcomer-welcome-centre",
        cost: "free",
        url: "https://www.surreylibraries.ca/newcomer-centre",
      },
      {
        id: "surrey-libraries-free-settlement-services-for-newcomers",
        cost: "free",
        url: "https://www.surreylibraries.ca/free-settlement-services-newcomers",
      },
      {
        id: "surrey-libraries-english-language-learners",
        cost: "free",
        url: "https://www.surreylibraries.ca/english-language-learners-programs",
      },
      {
        id: "surrey-libraries-newcomer-teen-social-club",
        cost: "free",
        url: "https://www.surreylibraries.ca/newcomer-teen-social-club-0",
      },
      {
        id: "surrey-libraries-get-a-library-card",
        cost: "free",
        url: "https://www.surreylibraries.ca/get-library-card",
      },
      {
        id: "surrey-libraries-books-in-world-languages",
        cost: "free",
        url: "https://www.surreylibraries.ca/books-media/books-world-languages",
      },
      {
        id: "surrey-libraries-technology-help",
        cost: "free",
        url: "https://www.surreylibraries.ca/technology-help",
      },
    ],
    logo: "/resources/logos/surrey-libraries.png",
    displayOrder: 1,
    active: true,
  },
  {
    slug: "vancouver-public-library",
    name: "Vancouver Public Library",
    category: "librariesLearning",
    partnershipType: "resource",
    website: "https://www.vpl.ca/",
    ctaLabelKey: "resources.cta.joinLibrary",
    cost: "free",
    phone: "604-331-3603",
    email: "info@vpl.ca",
    address: "Central Library, 350 West Georgia St, Vancouver, BC V6B 6B1",
    programs: [
      {
        id: "vancouver-public-library-get-a-library-card",
        cost: "free",
        url: "https://www.vpl.ca/borrowing/library-card",
      },
      {
        id: "vancouver-public-library-esl-conversation-practice",
        cost: "free",
        url: "https://www.vpl.ca/programs/esl-conversation-practice",
      },
      {
        id: "vancouver-public-library-immigration-and-settlement-guide",
        cost: "free",
        url: "https://www.vpl.ca/guides/immigration-and-settlement",
      },
      {
        id: "vancouver-public-library-translation-services-guide",
        cost: "free",
        url: "https://www.vpl.ca/guides/immigration-and-settlement/translation-services",
      },
      {
        id: "vancouver-public-library-clarity-english",
        cost: "free",
        url: "https://www.vpl.ca/digital-library/clarity-english-language-learning",
      },
      {
        id: "vancouver-public-library-world-languages-collection",
        cost: "free",
        url: "https://www.vpl.ca/borrowing/world-languages",
      },
    ],
    logo: "/resources/logos/vancouver-public-library.svg",
    displayOrder: 2,
    active: true,
  },
  // ── Community & Belonging ───────────────────────────────────────────────
  {
    slug: "big-brothers-big-sisters",
    name: "Big Brothers Big Sisters",
    category: "communityBelonging",
    partnershipType: "resource",
    website: "https://www.bigbrothersvancouver.com/",
    // Contact points at the Greater Vancouver agency rather than the Toronto
    // national office, because that is the agency a person here would apply to.
    // National office: 905-639-0461 / 1-800-263-9133.
    phone: "604-876-2447",
    email: "officeadmin@bbgvf.com",
    programs: [
      {
        id: "big-brothers-big-sisters-community-mentoring",
        url: "https://www.bigbrothersvancouver.com/our-programs/big-brothers/",
      },
      {
        id: "big-brothers-big-sisters-in-school-mentoring",
        url: "https://www.bigbrothersvancouver.com/our-programs/in-school-mentor/",
      },
      {
        id: "big-brothers-big-sisters-teen-mentoring",
        url: "https://www.bigbrothersvancouver.com/our-programs/teen-mentor/",
      },
      {
        id: "big-brothers-big-sisters-mentoring-with-math",
        cost: "free",
        url: "https://www.bigbrothersvancouver.com/our-programs/mentoring-math/",
      },
      {
        id: "big-brothers-big-sisters-game-on",
        url: "https://www.bigbrothersvancouver.com/our-programs/game-on/",
      },
      {
        id: "big-brothers-big-sisters-roots-mentoring",
        url: "https://www.bigbrothersvancouver.com/our-programs/roots/",
      },
    ],
    logo: "/resources/logos/big-brothers-big-sisters.png",
    displayOrder: 0,
    active: true,
  },
  {
    slug: "united-way-bc",
    name: "United Way BC",
    category: "communityBelonging",
    partnershipType: "resource",
    website: "https://uwbc.ca/",
    phone: "604-294-8929",
    email: "info@uwbc.ca",
    address: "4543 Canada Way, Burnaby, BC V5G 4T4",
    programs: [
      {
        id: "united-way-bc-211",
        cost: "free",
        url: "https://bc.211.ca",
      },
      {
        id: "united-way-bc-bc-safe-haven-program",
        url: "https://uwbc.ca/program/bc-safe-haven/",
      },
      {
        id: "united-way-bc-food-security",
        url: "https://uwbc.ca/program/food-security/",
      },
      {
        id: "united-way-bc-transit-assistance",
        url: "https://uwbc.ca/program/transit-assistance-program/",
      },
      {
        id: "united-way-bc-better-at-home",
        url: "https://betterathome.ca",
      },
      {
        id: "united-way-bc-school-s-out",
        url: "https://uwbc.ca/stories/program/schools-out/",
      },
      {
        id: "united-way-bc-work-experience-opportunities-grant",
      },
      {
        id: "united-way-bc-youth-futures-education-fund",
      },
    ],
    logo: "/resources/logos/united-way-bc.svg",
    displayOrder: 1,
    active: true,
  },
  {
    slug: "trout-lake-community-centre",
    name: "Trout Lake Community Centre",
    category: "communityBelonging",
    partnershipType: "resource",
    website: "https://troutlakecc.com/",
    cost: "mixed",
    phone: "604-257-6955",
    email: "troutlakecc@vancouver.ca",
    address: "3360 Victoria Dr, Vancouver, BC V5N 4M4",
    // The `hours` copy is the building's; the office and front desk close 30
    // minutes earlier.
    programs: [
      {
        id: "trout-lake-community-centre-leisure-access-program-lap",
      },
      {
        id: "trout-lake-community-centre-tlcca-program-cost-assistance",
        url: "https://troutlakecc.com/programs/",
      },
      {
        id: "trout-lake-community-centre-adaptive-programs",
        url: "https://troutlakecc.com/program/adaptive-programs/",
      },
      {
        id: "trout-lake-community-centre-licensed-preschool",
        cost: "paid",
        url: "https://troutlakecc.com/program/licensed-preschool/",
      },
      {
        id: "trout-lake-community-centre-older-adult-programs",
        url: "https://troutlakecc.com/program/older-adult-programs/",
      },
    ],
    logo: "/resources/logos/trout-lake-community-centre.png",
    displayOrder: 2,
    active: true,
  },
  // ── Networks & Planning Tables ──────────────────────────────────────────
  {
    slug: "amssa",
    name: "AMSSA",
    category: "networksPlanning",
    partnershipType: "resource",
    website: "https://www.amssa.org/",
    cost: "mixed",
    phone: "604-718-2780",
    email: "amssa@amssa.org",
    address: "Metrotower II, Suite 2308, 4720 Kingsway, Burnaby, BC V5H 4N2",
    programs: [
      {
        id: "amssa-re-settlement-and-integration",
        url: "https://www.amssa.org/programs/resettlement-and-integration/",
      },
      {
        id: "amssa-migrant-worker-hub",
        url: "https://www.amssa.org/programs/migrant-worker-hub/",
      },
      {
        id: "amssa-amssa-institute",
        url: "https://www.amssa.org/programs/amssa-institute/",
      },
      {
        id: "amssa-canadian-humanitarian-assistance-response-char",
        url: "https://www.amssa.org/char/",
      },
      {
        id: "amssa-indigenous-truth-and-decolonization",
        url: "https://www.amssa.org/programs/indigenous-truth-and-decolonization/",
      },
      {
        id: "amssa-national-sector-engagement",
        url: "https://www.amssa.org/programs/",
      },
    ],
    logo: "/resources/logos/amssa.png",
    logoFit: "contain",
    displayOrder: 0,
    active: true,
  },
  {
    slug: "surrey-lip",
    name: "Surrey Local Immigration Partnership",
    category: "networksPlanning",
    partnershipType: "resource",
    website: "https://www.surreylip.ca/",
    programs: [
      {
        id: "surrey-lip-community-connector-project",
        url: "https://www.surreylip.ca/project/community-connector-project/",
      },
      {
        id: "surrey-lip-surrey-services-map",
        url: "https://www.surreylip.ca/surrey-services-map/",
      },
      {
        id: "surrey-lip-immigrant-advisory-round-table",
        url: "https://www.surreylip.ca/",
      },
      {
        id: "surrey-lip-youth-newcomer-council",
        url: "https://www.surreylip.ca/",
      },
      {
        id: "surrey-lip-bridging-indigenous-and-newcomer",
        url: "https://www.surreylip.ca/project/bridging-indigenous-and-newcomer-communities/",
      },
      {
        id: "surrey-lip-first-peoples-guide",
        url: "https://www.surreylip.ca/project/surrey-first-peoples-guide-for-newcomer-facilitation/",
      },
    ],
    logo: "/resources/logos/surrey-lip.png",
    displayOrder: 1,
    active: true,
  },
  {
    slug: "delta-lip",
    name: "Delta Local Immigration Partnership",
    category: "networksPlanning",
    partnershipType: "resource",
    website: "https://deltalip.ca/",
    email: "deltalip@dcrs.ca",
    programs: [
      {
        id: "delta-lip-delta-services-map",
        url: "https://deltalip.ca/delta-services-map/",
      },
      {
        id: "delta-lip-resource-library",
        url: "https://deltalip.ca/resources/",
      },
      {
        id: "delta-lip-delta-youth-newcomer-advisory-table-dynat",
      },
      {
        id: "delta-lip-immigrant-advisory-table",
      },
    ],
    logo: "/resources/logos/delta-lip.webp",
    logoFit: "contain",
    displayOrder: 2,
    active: true,
  },
  // ── International Students ──────────────────────────────────────────────
  {
    slug: "sfu-international",
    name: "SFU International Services for Students",
    category: "internationalStudents",
    partnershipType: "resource",
    website: "https://www.sfu.ca/students/iss.html",
    ctaLabelKey: "resources.cta.bookAdvising",
    phone: "778-782-4232",
    email: "iss_office@sfu.ca",
    address: "MBC 1200 – 8888 University Drive, Burnaby, BC V5A 1S6",
    programs: [
      {
        id: "sfu-international-international-and-newcomer-student-advising",
        url: "https://www.sfu.ca/students/isap.html",
      },
      {
        id: "sfu-international-refugee-and-newcomer-programs",
        url: "https://www.sfu.ca/refugeeprograms/students.html",
      },
      {
        id: "sfu-international-student-refugee-program",
        url: "https://www.sfu.ca/refugeeprograms/students.html",
      },
      {
        id: "sfu-international-global-student-centre",
        url: "https://www.sfu.ca/students/iss.html",
      },
      {
        id: "sfu-international-international-student-orientation-series",
        url: "https://www.sfu.ca/students/isap/programs/intlorientation.html",
      },
      {
        id: "sfu-international-international-student-career-week",
        url: "https://www.sfu.ca/students/isap/programs/IntlCareerWeek.html",
      },
    ],
    logo: "/resources/logos/sfu-international.png",
    displayOrder: 0,
    active: true,
  },
  {
    slug: "fraser-international-college",
    name: "Fraser International College",
    category: "internationalStudents",
    partnershipType: "resource",
    website: "https://www.fraseric.ca/",
    ctaLabelKey: "resources.cta.applyOnline",
    cost: "paid",
    phone: "(778) 782-5011",
    email: "info@fraseric.ca",
    address: "8999 Nelson Way, Burnaby, BC V5A 4B5",
    programs: [
      {
        id: "fraser-international-college-foundation-program-utp-stage-i",
        cost: "paid",
        url: "https://www.fraseric.ca/admissions/fees/",
      },
      {
        id: "fraser-international-college-international-year-one-utp-stage-ii",
        cost: "paid",
        url: "https://www.fraseric.ca/admissions/fees/",
      },
      {
        id: "fraser-international-college-associate-of-arts-degree",
        cost: "paid",
        url: "https://www.fraseric.ca/admissions/fees/",
      },
      {
        id: "fraser-international-college-student-success-team",
        url: "https://www.fraseric.ca/student-services/",
      },
      {
        id: "fraser-international-college-wellness-office",
        url: "https://www.fraseric.ca/student-services/",
      },
      {
        id: "fraser-international-college-student-support-services",
        url: "https://www.fraseric.ca/student-services/",
      },
    ],
    logo: "/resources/logos/fraser-international-college.png",
    displayOrder: 1,
    active: true,
  },
  // ── Insurance ───────────────────────────────────────────────────────────
  {
    slug: "tugo",
    name: "TuGo",
    category: "insurance",
    partnershipType: "referral",
    // Affiliate link supplied by the partner; deliberately unlabelled in the
    // UI and opened by the standard Website button.
    website: "https://tugo.partnerlinks.io/68e8fsmokbc7",
    ctaLabelKey: "resources.cta.getQuote",
    cost: "paid",
    phone: "1-855-929-8846",
    email: "info@tugo.com",
    address: "1200–6081 No. 3 Road, Richmond, BC V6Y 2B2",
    programs: [
      {
        id: "tugo-visitors-to-canada-insurance",
        cost: "paid",
      },
      {
        id: "tugo-basic-visitors-to-canada-insurance",
        cost: "paid",
      },
      {
        id: "tugo-student-insurance",
        cost: "paid",
      },
      {
        id: "tugo-trip-cancellation-trip-interruption-insurance",
        cost: "paid",
      },
      {
        id: "tugo-24-7-emergency-medical-assistance",
      },
    ],
    logo: "/resources/logos/tugo.png",
    displayOrder: 0,
    active: true,
  },
  // ── Money & Banking ─────────────────────────────────────────────────────
  {
    slug: "desjardins",
    name: "Desjardins",
    category: "money",
    partnershipType: "referral",
    website: "https://www.desjardins.com/ca/personal/you-are/newcomers-canada/",
    cost: "mixed",
    phone: "1-877-435-6098",
    programs: [
      {
        id: "desjardins-newcomers-chequing-account-unlimited-plan",
        cost: "mixed",
      },
      {
        id: "desjardins-free-legal-assistance-service",
        cost: "free",
      },
      {
        id: "desjardins-international-money-transfers",
      },
      {
        id: "desjardins-youth-and-student-accounts",
        cost: "mixed",
      },
    ],
    logo: "/resources/logos/desjardins.svg",
    logoFit: "contain",
    displayOrder: 0,
    active: true,
  },
];

/**
 * Active partners from an arbitrary list, sorted by displayOrder. Split out so
 * the filter is testable without an inactive partner in the shipped data.
 */
export const selectActivePartners = (partners: Partner[]): Partner[] =>
  partners.filter((p) => p.active).sort((a, b) => a.displayOrder - b.displayOrder);

/** Active partners only, sorted by displayOrder. */
export const getActivePartners = (): Partner[] => selectActivePartners(PARTNERS);

/** Active partners in a category, sorted by displayOrder. */
export const getPartnersByCategory = (category: PartnerCategory): Partner[] =>
  getActivePartners().filter((p) => p.category === category);

/** A single partner by slug (any active state), for the detail route. */
export const getPartnerBySlug = (slug: string): Partner | undefined =>
  PARTNERS.find((p) => p.slug === slug);

/**
 * Categories that have ≥1 active partner, in CATEGORY_ORDER, with counts.
 * Empty categories are omitted.
 */
export const getCategoriesWithPartners = (): CategoryWithCount[] => {
  const counts = new Map<PartnerCategory, number>();
  for (const p of getActivePartners()) {
    counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  }
  return CATEGORY_ORDER.filter((c) => counts.has(c)).map((category) => ({
    category,
    partnerCount: counts.get(category)!,
  }));
};

// ── Filter facets (web-only) ───────────────────────────────────────────────
//
// Structured values behind the Resources filters (service format, location,
// eligibility). Every value is derived ONLY from the partner's own English copy
// (resources.partners.<slug> in en/translation.json); the quoted source is on
// each line. Anything the copy doesn't clearly state is "unknown" (or an empty
// list), and the filter UI excludes that partner while the matching filter is
// active. Kept apart from PARTNERS so the synced records stay diffable against
// mobile.

/** How a partner's services are delivered. */
export type PartnerFormat = "in_person" | "online" | "both" | "unknown";

/**
 * Where a partner serves. City keys are BC municipalities; `metro_vancouver`,
 * `bc_wide` and `national` are wider scopes that also cover every BC city;
 * `outside_bc` serves only outside BC.
 */
export type LocationKey =
  | "vancouver"
  | "surrey"
  | "burnaby"
  | "richmond"
  | "delta"
  | "metro_vancouver"
  | "bc_wide"
  | "national"
  | "outside_bc";

/** Immigration-status groups a partner states it serves. */
export type EligibilityTag =
  | "permanent_residents"
  | "permits"
  | "refugees"
  | "everyone";

export interface PartnerFacets {
  format: PartnerFormat;
  /** Empty = the copy doesn't say. */
  locations: LocationKey[];
  /** Empty = the copy doesn't say. */
  eligibilityTags: EligibilityTag[];
  /** Founding year, only where the partner's own copy states it. */
  founded?: number;
}

export const PARTNER_FACETS: Record<string, PartnerFacets> = {
  diversecity: {
    format: "unknown",
    locations: ["surrey", "delta"], // serviceArea "Surrey and Delta"
    // eligibility: "open to permanent residents, refugees and protected persons
    // … Temporary residents, international students … refugee claimants"
    eligibilityTags: ["permanent_residents", "permits", "refugees"],
    founded: 1978, // description: "a BC-registered charity (since 1978)"
  },
  "burnaby-neighbourhood-house": {
    format: "unknown",
    locations: ["burnaby"], // serviceArea "Burnaby"
    // eligibility: "focus on permanent residents and convention refugees.
    // Community, food and childcare programs are open to everyone."
    eligibilityTags: ["permanent_residents", "refugees", "everyone"],
  },
  "ymca-bc": {
    format: "both", // Citizenship Test Prep: "A hybrid group program"
    locations: ["bc_wide"], // serviceArea "British Columbia"
    // English Conversation Club: "All immigration statuses except visitor visas"
    eligibilityTags: ["permanent_residents", "permits", "refugees"],
  },
  "iec-bc": {
    format: "online", // ASCEND: "Online, self-paced learning"
    locations: ["bc_wide"], // serviceArea "British Columbia"
    // FAST: "Permanent residents … refugees, international students, skilled
    // immigrants with a valid work permit"
    eligibilityTags: ["permanent_residents", "permits", "refugees"],
  },
  "newcomer-jobs-canada": {
    // "there is no BC office and no in-person service" + "Create a free account online"
    format: "online",
    locations: ["national"], // serviceArea "Canada"
    eligibilityTags: [],
  },
  // Tags only — Canada Shaws copy is contract-controlled and shown verbatim.
  "canada-shaw-immigration": {
    format: "unknown",
    locations: ["richmond"], // serviceArea "Richmond"
    // "helps clients worldwide" is about where clients are, not who qualifies;
    // neither the copy nor immshaws.com states eligibility → unknown.
    eligibilityTags: [],
  },
  // Inactive (mobile: held as unverifiable); kept so the facet table stays total.
  "global-connect-immigration": {
    format: "unknown",
    locations: ["surrey"], // serviceArea "Surrey"
    eligibilityTags: [],
  },
  "burnaby-public-library": {
    // English Conversation Circle: "Runs in branches and on Zoom."
    format: "both",
    locations: ["burnaby"], // serviceArea "Burnaby · 4 branches"
    // eligibility: "Membership is free for anyone who lives in Burnaby …
    // No identification is required"
    eligibilityTags: ["everyone"],
  },
  "surrey-libraries": {
    // howToStart: "Visit the Newcomer Welcome Centre at City Centre Branch"
    format: "in_person",
    locations: ["surrey"], // serviceArea "Surrey · 10 branches"
    // "No status restriction is stated." records silence, not openness; the
    // official newcomers page doesn't state eligibility either → unknown.
    eligibilityTags: [],
  },
  "vancouver-public-library": {
    // howToStart: "Walk in to any branch … or register online for a temporary
    // digital card"; Clarity English: "A free online language-learning resource"
    format: "both",
    locations: ["vancouver"], // serviceArea "Vancouver · 21 branches"
    eligibilityTags: ["everyone"], // eligibility: "Programs and events are open to everyone."
  },
  "big-brothers-big-sisters": {
    // Community Mentoring: "Mentors commit to a weekly 2–4 hour outing"
    format: "in_person",
    locations: ["metro_vancouver"], // serviceArea "Greater Vancouver"
    eligibilityTags: [],
  },
  "united-way-bc": {
    format: "unknown",
    locations: ["bc_wide"], // serviceArea "British Columbia"
    eligibilityTags: ["refugees"], // BC Safe Haven: "Refugee claimants."
  },
  "trout-lake-community-centre": {
    format: "in_person", // howToStart: "Drop in and ask at the front desk"
    locations: ["vancouver"], // serviceArea "Vancouver"
    eligibilityTags: [],
  },
  amssa: {
    format: "online", // AMSSA Institute: "An online learning platform"
    locations: ["bc_wide"], // serviceArea "British Columbia"
    eligibilityTags: [], // "serves member agencies … not individual newcomers"
  },
  "surrey-lip": {
    format: "online", // Surrey Services Map: "An online map of the services"
    locations: ["surrey"], // serviceArea "Surrey"
    eligibilityTags: [], // "does not deliver services to individuals"
  },
  "delta-lip": {
    format: "online", // Delta Services Map: "An online map of services"
    locations: ["delta"], // serviceArea "Delta"
    eligibilityTags: [], // "does not deliver services to individuals"
  },
  "sfu-international": {
    format: "both", // howToStart: "Drop in (in person or virtual)"
    locations: ["burnaby"], // serviceArea "SFU Burnaby campus"
    // "International students enrolled at SFU" + "students who identify as refugees"
    eligibilityTags: ["permits", "refugees"],
  },
  "fraser-international-college": {
    format: "unknown",
    locations: ["burnaby"], // serviceArea "Burnaby"
    eligibilityTags: [],
  },
  tugo: {
    format: "online", // howToStart: "Start a quote online through a TuGo insurance partner"
    locations: ["national"], // serviceArea "Canada and worldwide"
    // Student Insurance: "International students studying in Canada"
    eligibilityTags: ["permits"],
  },
  desjardins: {
    // howToStart: "Open an account online … or … confirm your identity at a
    // service location"
    format: "both",
    locations: ["outside_bc"], // serviceArea "Quebec and Ontario"
    // eligibility: "permanent residents, or temporary residents with a work permit"
    eligibilityTags: ["permanent_residents", "permits"],
  },
};

const UNKNOWN_FACETS: PartnerFacets = {
  format: "unknown",
  locations: [],
  eligibilityTags: [],
};

/** Same language under two spellings in the partner copy → one filter value. */
const LANGUAGE_ALIASES: Record<string, string> = {
  "Persian (Farsi)": "Farsi",
  "Filipino (Tagalog)": "Tagalog",
};

/** The English language name used as a stable filter value. */
export const canonicalLanguage = (name: string): string =>
  LANGUAGE_ALIASES[name] ?? name;

/**
 * A localized partner plus its filter facets. `languageKeys` are the English
 * language names (canonicalised), index-aligned with the localized
 * `languages`, so filter values and URLs stay the same in every language.
 */
export type ResourcePartner = LocalizedPartner &
  PartnerFacets & { languageKeys: string[] };

/**
 * Resolves a partner for display: copy in the language `t` is bound to, plus
 * facets and English language keys (via `enT`, a `t` fixed to "en").
 */
export function toResourcePartner(
  partner: Partner,
  t: TFunction,
  enT: TFunction,
): ResourcePartner {
  const english: unknown = enT(partnerCopyKey(partner.slug, "languages"), {
    returnObjects: true,
    defaultValue: [],
  });
  const languageKeys = Array.isArray(english)
    ? english
        .filter((l): l is string => typeof l === "string")
        .map(canonicalLanguage)
    : [];
  return {
    ...localizePartner(partner, t),
    ...(PARTNER_FACETS[partner.slug] ?? UNKNOWN_FACETS),
    languageKeys,
  };
}

/** Active partners resolved for display, sorted by displayOrder. */
export const getActiveResourcePartners = (
  t: TFunction,
  enT: TFunction,
): ResourcePartner[] =>
  getActivePartners().map((p) => toResourcePartner(p, t, enT));

/** Cost values in filter order. */
export const COST_ORDER: Cost[] = ["free", "paid", "mixed"];
