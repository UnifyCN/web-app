/**
 * Unify legal-document URLs (Notion). Single source of truth for the links shown
 * in the signup consent checkbox, the "Before you continue" gate, the sign-in
 * footer, and the Settings → Legal section. Mirrors the mobile app's
 * `utils/legalUrls.ts`.
 */
export const LEGAL_URLS = {
  termsOfService:
    "https://www.notion.so/Unify-s-Terms-Conditions-3185af89dddb80a68410fa8d65d615c7",
  privacyPolicy:
    "https://www.notion.so/Unify-s-Privacy-Policy-2e15af89dddb80b0b37ee497e6d4e38c",
  communityGuidelines:
    "https://www.notion.so/Unify-s-Community-Guidelines-2e55af89dddb8098aff0d1460b3fb694",
} as const;
