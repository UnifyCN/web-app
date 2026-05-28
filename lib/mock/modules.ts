import type { LearnModuleView, SanityLesson } from "@/types";

/**
 * Mock fallback used by services/learn.ts when Sanity isn't configured
 * (local dev without env vars). The real source is the
 * `fercgabp/production` Sanity dataset (13 modules / 54 submodules /
 * 199 lessons). Small placeholder set.
 */

export const mockModules: LearnModuleView[] = [
  {
    _id: "mock-mod-docs",
    _type: "module",
    title: "Documentation & Identification",
    description: "Get your SIN, health card, and other essentials set up.",
    colorTheme: { hex: "#5182C7" },
    icon: null,
    submodules: [
      {
        _id: "mock-sub-docs-1",
        _type: "submodule",
        title: "First-week essentials",
        description: "Apply for your SIN and find an address.",
        order: 1,
        lessons: [
          {
            _id: "mock-lesson-sin",
            _type: "lesson",
            title: "Applying for a SIN",
            order: 1,
            description: "What to bring and where to go.",
            lesson_page_count: 2,
          },
          {
            _id: "mock-lesson-id",
            _type: "lesson",
            title: "Getting a provincial photo ID",
            order: 2,
            description: "An ID you can carry day-to-day.",
            lesson_page_count: 3,
          },
        ],
      },
    ],
    status: "in_progress",
    progressPercent: 50,
    isFavourite: true,
  },
  {
    _id: "mock-mod-banking",
    _type: "module",
    title: "Banking & Credit",
    description: "Open an account and start building Canadian credit.",
    colorTheme: { hex: "#FFB570" },
    icon: null,
    submodules: [
      {
        _id: "mock-sub-banking-1",
        _type: "submodule",
        title: "Choosing a bank",
        description: "Newcomer packages compared.",
        order: 1,
        lessons: [
          {
            _id: "mock-lesson-bank",
            _type: "lesson",
            title: "Newcomer bank accounts",
            order: 1,
            description: "Fee-free options for your first year.",
            lesson_page_count: 2,
          },
        ],
      },
    ],
    status: "not_started",
    progressPercent: 0,
    isFavourite: false,
  },
];

export const mockLessonsById: Record<string, SanityLesson> = {
  "mock-lesson-sin": {
    _id: "mock-lesson-sin",
    _type: "lesson",
    title: "Applying for a SIN",
    description: "What to bring and where to go.",
    order: 1,
    pages: [
      {
        _key: "p1",
        _type: "page",
        title: "What is a SIN?",
        order: 1,
        content: [
          {
            _key: "b1",
            _type: "block",
            style: "normal",
            markDefs: [],
            children: [
              {
                _key: "s1",
                _type: "span",
                marks: [],
                text: "Your Social Insurance Number (SIN) is a 9-digit number you'll need to work in Canada and access most government services.",
              },
            ],
          },
        ],
      },
    ],
    ending_pages: [
      {
        _key: "e1",
        _type: "endingPage",
        title: "You now know how to:",
        order: 1,
        content: [
          {
            _key: "b1",
            _type: "block",
            style: "normal",
            listItem: "bullet",
            level: 1,
            markDefs: [],
            children: [
              {
                _key: "s1",
                _type: "span",
                marks: [],
                text: "Apply for a Social Insurance Number in person.",
              },
            ],
          },
        ],
      },
    ],
  },
};

export function getMockModuleById(id: string): LearnModuleView | undefined {
  return mockModules.find((m) => m._id === id);
}

export function getMockLessonById(id: string): SanityLesson | undefined {
  return mockLessonsById[id];
}
