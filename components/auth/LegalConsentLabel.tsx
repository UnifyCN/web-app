"use client";

import { Trans } from "react-i18next";
import { LEGAL_URLS } from "@/lib/legalUrls";

function LegalLink({
  href,
  children,
}: {
  href?: string;
  children?: React.ReactNode;
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
 * signup uses "&" (auth.legalSignUp), the standalone consent gate uses ", and"
 * (auth.legalConsent). Both keys carry <terms>/<privacy>/<guidelines> tags that
 * <Trans> maps onto the links — reusing mobile's translated consent strings.
 */
export function LegalConsentLabel({ oxford = false }: { oxford?: boolean }) {
  return (
    <Trans
      i18nKey={oxford ? "auth.legalConsent" : "auth.legalSignUp"}
      components={{
        terms: <LegalLink href={LEGAL_URLS.termsOfService} />,
        privacy: <LegalLink href={LEGAL_URLS.privacyPolicy} />,
        guidelines: <LegalLink href={LEGAL_URLS.communityGuidelines} />,
      }}
    />
  );
}
