import type { UserProfile } from "@/types";

// TODO: replace with real data — mock users.

export const currentUser: UserProfile = {
  id: "u-me",
  username: "Maya Okonkwo",
  profilePictureUrl: "https://picsum.photos/seed/user-maya/160/160",
  isPremium: true,
  permissions: [],
  followerCount: 142,
  followingCount: 98,
  bio: "Mechanical engineer from Lagos, settling in Metro Vancouver. Sharing what I learn about getting licensed and finding work in my field.",
  pronouns: "she/her",
  onboarding: {
    id: "ob-me",
    firstName: "Maya",
    persona: "skilled_worker",
    referralSource: "friends_family",
    arrivalDate: "2025-09-01",
    city: "Burnaby",
    province: "BC",
    stage: 2,
    goals: ["Find work in my field", "Build a local network"],
    learningInterests: ["Banking", "Housing", "Employment"],
    hobbies: ["career_growth", "explore_canada", "personal_finance"],
    learningReminders: true,
  },
};

export const priya: UserProfile = {
  id: "u1",
  username: "Priya Sharma",
  profilePictureUrl: "https://picsum.photos/seed/priya/96/96",
  isPremium: true,
  permissions: [],
  followerCount: 320,
  followingCount: 180,
  bio: "International student at U of T. Posting tips on study permits, part-time work, and budgeting in Toronto.",
  pronouns: "she/her",
  onboarding: {
    id: "ob-u1",
    firstName: "Priya",
    persona: "international_student",
    referralSource: "facebook_instagram",
    arrivalDate: "2025-01-15",
    city: "Toronto",
    province: "ON",
    stage: 2,
    goals: ["Graduate and find a job"],
    learningInterests: ["Documentation", "Employment"],
    hobbies: ["education_learning", "food_cooking"],
    learningReminders: true,
  },
};

export const ahmed: UserProfile = {
  id: "u2",
  username: "Ahmed Hassan",
  profilePictureUrl: null,
  isPremium: false,
  permissions: [],
  followerCount: 210,
  followingCount: 140,
  bio: "Moved to Calgary with my family in 2024. Happy to help other newcomers navigate housing and healthcare.",
  pronouns: "he/him",
  onboarding: {
    id: "ob-u2",
    firstName: "Ahmed",
    persona: "skilled_worker",
    referralSource: "google_search",
    arrivalDate: "2024-06-01",
    city: "Calgary",
    province: "AB",
    stage: 3,
    goals: ["Settle my family"],
    learningInterests: ["Housing", "Healthcare"],
    hobbies: ["family_parenting", "fitness_sports"],
    learningReminders: false,
  },
};

export const mei: UserProfile = {
  id: "u3",
  username: "Mei Chen",
  profilePictureUrl: "https://picsum.photos/seed/mei/96/96",
  isPremium: false,
  permissions: [],
  followerCount: 175,
  followingCount: 130,
  bio: "New to Vancouver as of early 2026. Figuring out MSP, banking, and the tech job market one step at a time.",
  pronouns: "she/her",
  onboarding: {
    id: "ob-u3",
    firstName: "Mei",
    persona: "skilled_worker",
    referralSource: "app_store",
    arrivalDate: "2026-02-10",
    city: "Vancouver",
    province: "BC",
    stage: 1,
    goals: ["Get provincial health coverage"],
    learningInterests: ["Healthcare", "Banking"],
    hobbies: ["tech_digital", "wellness_growth"],
    learningReminders: true,
  },
};

export const carlos: UserProfile = {
  id: "u4",
  username: "Carlos Mendoza",
  profilePictureUrl: null,
  isPremium: false,
  permissions: [],
  followerCount: 260,
  followingCount: 90,
  bio: "Came to Edmonton as a refugee in 2022, now preparing for citizenship. Here to support others on the same path.",
  pronouns: "he/him",
  onboarding: {
    id: "ob-u4",
    firstName: "Carlos",
    persona: "refugee",
    referralSource: "news_article",
    arrivalDate: "2022-11-01",
    city: "Edmonton",
    province: "AB",
    stage: 4,
    goals: ["Apply for citizenship"],
    learningInterests: ["Daily Life", "Employment"],
    hobbies: ["music_arts", "movies"],
    learningReminders: false,
  },
};

export const olena: UserProfile = {
  id: "u5",
  username: "Olena Kovalenko",
  profilePictureUrl: "https://picsum.photos/seed/olena/96/96",
  isPremium: true,
  permissions: [],
  followerCount: 198,
  followingCount: 210,
  bio: "Nurse from Kyiv working on getting my credentials recognised in Ontario. Sharing the licensing journey as I go.",
  pronouns: "she/her",
  onboarding: {
    id: "ob-u5",
    firstName: "Olena",
    persona: "skilled_worker",
    referralSource: "tiktok",
    arrivalDate: "2025-04-20",
    city: "Ottawa",
    province: "ON",
    stage: 2,
    goals: ["Get my credentials recognised"],
    learningInterests: ["Employment", "Documentation"],
    hobbies: ["career_growth", "education_learning"],
    learningReminders: true,
  },
};

export const otherUsers: UserProfile[] = [priya, ahmed, mei, carlos, olena];

export function getUserById(id: string): UserProfile | undefined {
  return [currentUser, ...otherUsers].find((user) => user.id === id);
}

/** A saved text highlight from a Learn lesson. */
export interface LessonHighlight {
  id: string;
  text: string;
  lessonTitle: string;
  moduleTitle: string;
}

// TODO: replace with real data — mock saved lesson highlights.
export const lessonHighlights: LessonHighlight[] = [
  {
    id: "hl-1",
    text: "Apply for your SIN the week you arrive — you can't start a job or open most accounts without it.",
    lessonTitle: "Applying for a Social Insurance Number",
    moduleTitle: "Documentation & Identification",
  },
  {
    id: "hl-2",
    text: "Provincial health coverage can take up to three months to begin, so line up interim insurance first.",
    lessonTitle: "The coverage waiting period",
    moduleTitle: "Healthcare Essentials",
  },
  {
    id: "hl-3",
    text: "A reference letter from your employer can stand in for a Canadian credit history when renting.",
    lessonTitle: "Your rights as a tenant",
    moduleTitle: "Finding a Home",
  },
];
