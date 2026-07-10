import {
  Megaphone,
  MoreHorizontal,
  Music2,
  Newspaper,
  Search,
  Smartphone,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { REFERRAL_OPTIONS } from "@/lib/onboarding/constants";
import { SelectableCard } from "../SelectableCard";
import { StepHeading } from "../StepHeading";
import type { OnboardingStepProps } from "../types";

/* lucide-react no longer ships brand glyphs, so social sources use neutral icons. */
const REFERRAL_ICON: Record<string, React.ReactNode> = {
  facebook_instagram: <Megaphone className="h-5 w-5" />,
  google_search: <Search className="h-5 w-5" />,
  app_store: <Smartphone className="h-5 w-5" />,
  friends_family: <Users className="h-5 w-5" />,
  news_article: <Newspaper className="h-5 w-5" />,
  tiktok: <Music2 className="h-5 w-5" />,
  other: <MoreHorizontal className="h-5 w-5" />,
};

export function ReferralStep({ draft, update }: OnboardingStepProps) {
  const { t } = useTranslation();
  return (
    <div>
      <StepHeading
        title={t("onboardingWeb.referral.title")}
        subtitle={t("onboardingWeb.referral.subtitle")}
      />
      <div className="mt-5 space-y-2.5">
        {REFERRAL_OPTIONS.map((opt) => (
          <SelectableCard
            key={opt.value}
            selected={draft.referralSource === opt.value}
            onToggle={() =>
              update({
                referralSource:
                  draft.referralSource === opt.value ? null : opt.value,
              })
            }
            label={t(`onboardingWeb.referral.options.${opt.value}`)}
            icon={REFERRAL_ICON[opt.value]}
          />
        ))}
      </div>
    </div>
  );
}
