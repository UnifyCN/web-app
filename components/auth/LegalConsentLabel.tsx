import { LEGAL_URLS } from "@/lib/legalUrls";

function LegalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-mention-blue underline"
    >
      {children}
    </a>
  );
}

/**
 * The "I agree to the Terms of Service, Privacy Policy {&|and} Community
 * Guidelines" consent text. `oxford` switches the separator to match each design:
 * signup uses "&", the standalone consent gate uses ", and".
 */
export function LegalConsentLabel({ oxford = false }: { oxford?: boolean }) {
  return (
    <>
      I agree to the{" "}
      <LegalLink href={LEGAL_URLS.termsOfService}>Terms of Service</LegalLink>,{" "}
      <LegalLink href={LEGAL_URLS.privacyPolicy}>Privacy Policy</LegalLink>
      {oxford ? "," : ""} {oxford ? "and" : "&"}{" "}
      <LegalLink href={LEGAL_URLS.communityGuidelines}>
        Community Guidelines
      </LegalLink>
    </>
  );
}
