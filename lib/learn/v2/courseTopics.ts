import {
  Banknote,
  Book,
  BookUser,
  Brain,
  Briefcase,
  BriefcaseMedical,
  Earth,
  FileText,
  GraduationCap,
  House,
  IdCard,
  Landmark,
  ShieldCheck,
  TramFront,
  type LucideIcon,
} from "lucide-react";

/**
 * Course icon tiles, replacing the old colour waves. Mirrors the mobile app's
 * `components/learn/CategorySymbol.tsx`: a course is mapped to a topic by its
 * stable Sanity `_id`, then by its legacy `icon` string, then to a book.
 * Mobile draws SF Symbols / Material icons; web uses the closest lucide icon.
 * Colours are the `--color-topic-*` tokens in app/globals.css (copied from
 * mobile). Only courses get a tile; module and lesson rows do not.
 */

export type CourseTopic =
  | "documentation"
  | "employment"
  | "housing"
  | "healthcare"
  | "safety"
  | "education"
  | "finance"
  | "culture"
  | "immigration"
  | "mental-health"
  | "taxes"
  | "transport"
  | "university"
  | "fallback";

export const TOPIC_ICONS: Record<CourseTopic, LucideIcon> = {
  documentation: IdCard,
  employment: Briefcase,
  housing: House,
  healthcare: BriefcaseMedical,
  safety: ShieldCheck,
  education: GraduationCap,
  finance: Banknote,
  culture: Earth,
  immigration: BookUser,
  "mental-health": Brain,
  taxes: FileText,
  transport: TramFront,
  university: Landmark,
  fallback: Book,
};

/** Course `_id` → topic (mobile `TOPICS`). */
const TOPIC_BY_ID: Record<string, CourseTopic> = {
  "0777d5d9-02fe-4e7d-b644-2e25d1c4579a": "documentation",
  "baeece22-8ac0-48a0-b310-baab55e38f88": "employment",
  "23aeb3ad-65e7-4e03-97b2-a3e14ffde080": "housing",
  "1f43061d-0062-4ea5-bd82-6b25e8ee5a55": "healthcare",
  "4044e0bc-d26b-4a1e-9b7d-6a5e95c7f8ce": "safety",
  "40bfab0e-63a5-46e4-8911-24de6dd72ca2": "education",
  "4c79ebb5-b03a-47aa-862e-6d0853eba7d4": "finance",
  "80e8804e-c063-4264-ba4d-a02354718e57": "culture",
  "9717e260-bdeb-4ee4-8d39-4159a48eb627": "immigration",
  "ccf7fd11-ab7e-4dc1-a6a7-4ea6036b1a86": "mental-health",
  "e0e9106e-c685-439a-8c67-2db46d7e7472": "taxes",
  "fd8898a8-5802-4bd2-aa0b-097f89df5de0": "transport",
  "1c0e599c-22a4-4b6f-ac12-3f4c01153eeb": "university",
  "84087dee-349a-4755-86d9-4843295e2e77": "university",
  "fcd707b0-cbd9-4069-a768-6e89e11d14f9": "university",
};

/** Legacy Sanity `icon` string → topic (mobile `ICON_TOPICS`). */
const TOPIC_BY_ICON: Record<string, CourseTopic> = {
  article: "documentation",
  ArticleOutlined: "documentation",
  work: "employment",
  AssignmentIndOutlined: "employment",
  cottage: "housing",
  CottageOutlined: "housing",
  medical_services: "healthcare",
  local_hospital: "healthcare",
  school: "education",
  account_balance: "finance",
  AccountBalanceOutlined: "finance",
  language: "culture",
  passport: "immigration",
  PassportOutlined: "immigration",
  psychology: "mental-health",
  calculate: "taxes",
};

/** The base document id: drafts prefix and language suffix removed, so a
 * translated or draft course maps like its English original. */
export function baseSanityId(id: string): string {
  return id.replace(/^drafts\./, "").replace(/-(ar|es|fr-CA|hi|pa|vi)$/, "");
}

export function courseTopic(course: {
  _id: string;
  icon?: string | null;
}): CourseTopic {
  return (
    TOPIC_BY_ID[baseSanityId(course._id)] ??
    (course.icon ? TOPIC_BY_ICON[course.icon] : undefined) ??
    "fallback"
  );
}

/** Tailwind classes for a topic's tile (background) and icon (foreground). */
export function topicClasses(topic: CourseTopic): {
  tile: string;
  icon: string;
} {
  return { tile: TILE[topic], icon: ICON[topic] };
}

// Spelled out so Tailwind sees every class name.
const TILE: Record<CourseTopic, string> = {
  documentation: "bg-topic-documentation-bg",
  employment: "bg-topic-employment-bg",
  housing: "bg-topic-housing-bg",
  healthcare: "bg-topic-healthcare-bg",
  safety: "bg-topic-safety-bg",
  education: "bg-topic-education-bg",
  finance: "bg-topic-finance-bg",
  culture: "bg-topic-culture-bg",
  immigration: "bg-topic-immigration-bg",
  "mental-health": "bg-topic-mental-health-bg",
  taxes: "bg-topic-taxes-bg",
  transport: "bg-topic-transport-bg",
  university: "bg-topic-university-bg",
  fallback: "bg-topic-fallback-bg",
};
const ICON: Record<CourseTopic, string> = {
  documentation: "text-topic-documentation",
  employment: "text-topic-employment",
  housing: "text-topic-housing",
  healthcare: "text-topic-healthcare",
  safety: "text-topic-safety",
  education: "text-topic-education",
  finance: "text-topic-finance",
  culture: "text-topic-culture",
  immigration: "text-topic-immigration",
  "mental-health": "text-topic-mental-health",
  taxes: "text-topic-taxes",
  transport: "text-topic-transport",
  university: "text-topic-university",
  fallback: "text-topic-fallback",
};
