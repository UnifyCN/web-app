import type { Group } from "@/types";

/** Four seeded member-avatar URLs for a group's avatar stack. */
function memberAvatars(id: string): string[] {
  return [1, 2, 3, 4].map(
    (n) => `https://picsum.photos/seed/${id}-m${n}/64/64`,
  );
}

// TODO: replace with real data — mock Canadian newcomer groups.
export const groups: Group[] = [
  {
    id: "g-toronto",
    groupName: "Newcomers to Toronto",
    groupDescription:
      "Tips, meetups, and support for people settling into the GTA.",
    memberCount: 4820,
    coverPhotoUrl: "https://picsum.photos/seed/grp-toronto/480/270",
    joinedByMe: true,
    memberAvatars: memberAvatars("g-toronto"),
  },
  {
    id: "g-bc",
    groupName: "Settling in BC",
    groupDescription:
      "Everything from MSP to rentals for newcomers across British Columbia.",
    memberCount: 3110,
    coverPhotoUrl: "https://picsum.photos/seed/grp-bc/480/270",
    joinedByMe: true,
    memberAvatars: memberAvatars("g-bc"),
  },
  {
    id: "g-parents",
    groupName: "Newcomer Parents",
    groupDescription:
      "Schools, childcare, and family life for parents new to Canada.",
    memberCount: 1975,
    coverPhotoUrl: "https://picsum.photos/seed/grp-parents/480/270",
    joinedByMe: true,
    memberAvatars: memberAvatars("g-parents"),
  },
  {
    id: "g-jobs",
    groupName: "Job Search Canada",
    groupDescription:
      "Resume help, Canadian workplace culture, and job leads.",
    memberCount: 6340,
    coverPhotoUrl: "https://picsum.photos/seed/grp-jobs/480/270",
    joinedByMe: false,
    memberAvatars: memberAvatars("g-jobs"),
  },
  {
    id: "g-tech",
    groupName: "Tech Professionals in Canada",
    groupDescription:
      "Networking and referrals for newcomers working in tech.",
    memberCount: 2580,
    coverPhotoUrl: "https://picsum.photos/seed/grp-tech/480/270",
    joinedByMe: false,
    memberAvatars: memberAvatars("g-tech"),
  },
  {
    id: "g-students",
    groupName: "International Students Network",
    groupDescription:
      "Study permits, campus life, and post-graduation pathways.",
    memberCount: 5170,
    coverPhotoUrl: "https://picsum.photos/seed/grp-students/480/270",
    joinedByMe: false,
    memberAvatars: memberAvatars("g-students"),
  },
  {
    id: "g-french",
    groupName: "French for Newcomers",
    groupDescription:
      "Practise French and prepare for life in francophone Canada.",
    memberCount: 1340,
    coverPhotoUrl: "https://picsum.photos/seed/grp-french/480/270",
    joinedByMe: false,
    memberAvatars: memberAvatars("g-french"),
  },
  {
    id: "g-food",
    groupName: "Groceries & Cooking in Canada",
    groupDescription:
      "Where to find familiar ingredients and budget grocery tips.",
    memberCount: 2890,
    coverPhotoUrl: "https://picsum.photos/seed/grp-food/480/270",
    joinedByMe: false,
    memberAvatars: memberAvatars("g-food"),
  },
];

export function getGroupById(id: string): Group | undefined {
  return groups.find((group) => group.id === id);
}
