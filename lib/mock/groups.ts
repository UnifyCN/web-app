import type { Group, GroupMemberAvatar } from "@/types";

/** Four seeded members for a group's avatar stack (initials fallback — mock /
 *  local-dev has no real pictures; the real path resolves member avatars). */
function memberAvatars(seed: string): GroupMemberAvatar[] {
  return [1, 2, 3, 4].map((n) => ({
    username: `${seed}-m${n}`,
    profilePictureUrl: null,
  }));
}

// TODO: replace with real data — mock Canadian newcomer groups.
export const groups: Group[] = [
  {
    id: 1,
    groupName: "Newcomers to Toronto",
    groupDescription:
      "Tips, meetups, and support for people settling into the GTA.",
    nameI18n: null,
    descriptionI18n: null,
    memberCount: 4820,
    coverPhotoUrl: "https://picsum.photos/seed/grp-toronto/480/270",
    joinedByMe: true,
    memberAvatars: memberAvatars("grp-toronto"),
  },
  {
    id: 2,
    groupName: "Settling in BC",
    groupDescription:
      "Everything from MSP to rentals for newcomers across British Columbia.",
    nameI18n: null,
    descriptionI18n: null,
    memberCount: 3110,
    coverPhotoUrl: "https://picsum.photos/seed/grp-bc/480/270",
    joinedByMe: true,
    memberAvatars: memberAvatars("grp-bc"),
  },
  {
    id: 3,
    groupName: "Newcomer Parents",
    groupDescription:
      "Schools, childcare, and family life for parents new to Canada.",
    nameI18n: null,
    descriptionI18n: null,
    memberCount: 1975,
    coverPhotoUrl: "https://picsum.photos/seed/grp-parents/480/270",
    joinedByMe: true,
    memberAvatars: memberAvatars("grp-parents"),
  },
  {
    id: 4,
    groupName: "Job Search Canada",
    groupDescription:
      "Resume help, Canadian workplace culture, and job leads.",
    nameI18n: null,
    descriptionI18n: null,
    memberCount: 6340,
    coverPhotoUrl: "https://picsum.photos/seed/grp-jobs/480/270",
    joinedByMe: false,
    memberAvatars: memberAvatars("grp-jobs"),
  },
  {
    id: 5,
    groupName: "Tech Professionals in Canada",
    groupDescription:
      "Networking and referrals for newcomers working in tech.",
    nameI18n: null,
    descriptionI18n: null,
    memberCount: 2580,
    coverPhotoUrl: "https://picsum.photos/seed/grp-tech/480/270",
    joinedByMe: false,
    memberAvatars: memberAvatars("grp-tech"),
  },
  {
    id: 6,
    groupName: "International Students Network",
    groupDescription:
      "Study permits, campus life, and post-graduation pathways.",
    nameI18n: null,
    descriptionI18n: null,
    memberCount: 5170,
    coverPhotoUrl: "https://picsum.photos/seed/grp-students/480/270",
    joinedByMe: false,
    memberAvatars: memberAvatars("grp-students"),
  },
  {
    id: 7,
    groupName: "French for Newcomers",
    groupDescription:
      "Practise French and prepare for life in francophone Canada.",
    nameI18n: null,
    descriptionI18n: null,
    memberCount: 1340,
    coverPhotoUrl: "https://picsum.photos/seed/grp-french/480/270",
    joinedByMe: false,
    memberAvatars: memberAvatars("grp-french"),
  },
  {
    id: 8,
    groupName: "Groceries & Cooking in Canada",
    groupDescription:
      "Where to find familiar ingredients and budget grocery tips.",
    nameI18n: null,
    descriptionI18n: null,
    memberCount: 2890,
    coverPhotoUrl: "https://picsum.photos/seed/grp-food/480/270",
    joinedByMe: false,
    memberAvatars: memberAvatars("grp-food"),
  },
];

export function getGroupById(id: number): Group | undefined {
  return groups.find((group) => group.id === id);
}
