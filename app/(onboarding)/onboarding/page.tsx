import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

/**
 * First-run onboarding. Gating lives in `proxy.ts` (it routes un-onboarded
 * users here and bounces onboarded ones to /home), so this page just renders
 * the wizard — and stays reachable for QA in the mock build where the proxy
 * passes through.
 */
export default function OnboardingPage() {
  return <OnboardingWizard />;
}
