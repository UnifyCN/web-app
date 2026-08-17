"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Check,
  Clock,
  ExternalLink,
  Globe,
  Languages,
  Mail,
  MapPin,
  Phone,
  Wallet,
} from "lucide-react";
import { cn, RTL_FLIP, externalHref } from "@/lib/utils";
import { OrgMonogram } from "./OrgMonogram";
import {
  PARTNER_CATEGORY_COLORS,
  PARTNER_CATEGORY_TINTS,
  PARTNER_CATEGORY_LABEL_KEYS,
  COST_LABEL_KEYS,
} from "@/lib/resources/categories";
import {
  trackResourcesPartnerOpened,
  trackResourcesPartnerWebsiteOpened,
  trackResourcesProgramOpened,
} from "@/lib/analytics";
import type { Partner } from "@/types";

/** Full partner profile: hero, About, highlights, how-to-get-help, programs. */
export function PartnerDetail({ partner }: { partner: Partner }) {
  const { t } = useTranslation();
  const color = PARTNER_CATEGORY_COLORS[partner.category];
  const tint = PARTNER_CATEGORY_TINTS[partner.category];
  const website = externalHref(partner.website);
  const mapsHref = partner.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        partner.address,
      )}`
    : null;

  // Fire on mount so deep links + list clicks both count once.
  useEffect(() => {
    trackResourcesPartnerOpened({
      slug: partner.slug,
      category: partner.category,
      partnershipType: partner.partnershipType,
    });
  }, [partner.slug, partner.category, partner.partnershipType]);

  return (
    <div className="mx-auto max-w-[680px] px-6 py-6">
      <Link
        href="/resources"
        className="mb-4 inline-flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className={cn("h-4 w-4", RTL_FLIP)} aria-hidden />
        {t("resources.title")}
      </Link>

      {/* Hero — heroImage or a category-tinted gradient fallback. */}
      <div className="overflow-hidden rounded-card border border-border-card">
        {partner.heroImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- partner hero URLs are arbitrary public hosts
          <img
            src={partner.heroImage}
            alt=""
            className="h-36 w-full object-cover"
          />
        ) : (
          <div
            className="h-36 w-full"
            style={{
              backgroundImage: `linear-gradient(135deg, ${color}, ${tint})`,
            }}
            aria-hidden
          />
        )}
      </div>

      {/* Identity — monogram pulled up over the hero. */}
      <div className="px-1">
        <div className="-mt-10 flex items-end gap-4">
          <OrgMonogram
            name={partner.name}
            color={color}
            logo={partner.logo}
            size={72}
            className="border-4 border-surface shadow-sm"
          />
          <span
            className="mb-1 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ backgroundColor: `${color}1A`, color }}
          >
            {t(PARTNER_CATEGORY_LABEL_KEYS[partner.category])}
          </span>
        </div>

        <h1 className="mt-3 text-xl font-bold text-ink-secondary">
          {partner.name}
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          {partner.tagline}
        </p>
        <p className="mt-2 flex items-center gap-2 text-xs text-ink-placeholder">
          <MapPin className="h-4 w-4 shrink-0" aria-hidden />
          <span>{partner.serviceArea}</span>
        </p>
      </div>

      {website && (
        <a
          href={website}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() =>
            trackResourcesPartnerWebsiteOpened({
              slug: partner.slug,
              partnershipType: partner.partnershipType,
            })
          }
          className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {partner.ctaLabelKey
            ? t(partner.ctaLabelKey)
            : t("resources.visitWebsite")}
          <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      )}

      {/* About */}
      <h2 className="mt-7 text-base font-semibold text-ink-secondary">
        {t("resources.about")}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        {partner.description}
      </p>

      {/* How they help */}
      {partner.highlights.length > 0 && (
        <>
          <h2 className="mt-7 text-base font-semibold text-ink-secondary">
            {t("resources.howTheyHelp")}
          </h2>
          <ul className="mt-2 space-y-2">
            {partner.highlights.map((highlight, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-ink-muted">
                <span
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${color}1A`, color }}
                >
                  <Check className="h-3 w-3" aria-hidden />
                </span>
                <span className="leading-relaxed">{highlight}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* How to get help */}
      <HowToGetHelp partner={partner} mapsHref={mapsHref} />

      {/* Programs */}
      {partner.programs && partner.programs.length > 0 && (
        <>
          <h2 className="mt-7 text-base font-semibold text-ink-secondary">
            {t("resources.programs")}
          </h2>
          <div className="mt-3 space-y-3">
            {partner.programs.map((program) => {
              const purl = externalHref(program.url);
              return (
                <div
                  key={program.name}
                  className="rounded-card border border-border-card/60 bg-surface-card p-4"
                >
                  {purl ? (
                    <a
                      href={purl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        trackResourcesProgramOpened({
                          slug: partner.slug,
                          programName: program.name,
                        })
                      }
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-secondary transition-colors hover:text-primary"
                    >
                      {program.name}
                      <ExternalLink
                        className="h-3.5 w-3.5 text-ink-placeholder"
                        aria-hidden
                      />
                    </a>
                  ) : (
                    <p className="text-sm font-semibold text-ink-secondary">
                      {program.name}
                    </p>
                  )}
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                    {program.description}
                  </p>
                  {program.eligibility && (
                    <p className="mt-1.5 text-xs leading-relaxed text-ink-placeholder">
                      <span className="font-medium">
                        {t("resources.whoItsFor")}:
                      </span>{" "}
                      {program.eligibility}
                    </p>
                  )}
                  {program.cost && (
                    <span
                      className="mt-2 inline-flex items-center rounded-full bg-surface-gray px-2 py-0.5 text-[11px] font-medium text-ink-tertiary"
                    >
                      {t(COST_LABEL_KEYS[program.cost])}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** The "how to get help" block: eligibility + how-to-start prose, then a card of
 *  contact rows. Every field is optional and rendered only when present. */
function HowToGetHelp({
  partner,
  mapsHref,
}: {
  partner: Partner;
  mapsHref: string | null;
}) {
  const { t } = useTranslation();

  const hasContact =
    partner.cost ||
    partner.phone ||
    partner.email ||
    partner.address ||
    partner.hours ||
    (partner.languages && partner.languages.length > 0);

  if (
    !partner.eligibility &&
    !partner.howToStart &&
    !hasContact
  ) {
    return null;
  }

  return (
    <>
      <h2 className="mt-7 text-base font-semibold text-ink-secondary">
        {t("resources.howToGetHelp")}
      </h2>

      {partner.eligibility && (
        <div className="mt-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-placeholder">
            {t("resources.whoItsFor")}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            {partner.eligibility}
          </p>
        </div>
      )}

      {partner.howToStart && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-placeholder">
            {t("resources.howToStart")}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            {partner.howToStart}
          </p>
        </div>
      )}

      {hasContact && (
        <dl className="mt-3 divide-y divide-border-card/60 overflow-hidden rounded-card border border-border-card/60">
          {partner.cost && (
            <ContactRow icon={Wallet} label={t("resources.costLabel")}>
              {t(COST_LABEL_KEYS[partner.cost])}
            </ContactRow>
          )}
          {partner.phone && (
            <ContactRow icon={Phone} label={t("resources.phone")}>
              <a
                href={`tel:${partner.phone.replace(/\s+/g, "")}`}
                className="text-primary hover:underline"
              >
                {partner.phone}
              </a>
            </ContactRow>
          )}
          {partner.email && (
            <ContactRow icon={Mail} label={t("resources.email")}>
              <a
                href={`mailto:${partner.email}`}
                className="break-all text-primary hover:underline"
              >
                {partner.email}
              </a>
            </ContactRow>
          )}
          {partner.address && (
            <ContactRow icon={MapPin} label={t("resources.address")}>
              {mapsHref ? (
                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {partner.address}
                </a>
              ) : (
                partner.address
              )}
            </ContactRow>
          )}
          {partner.hours && (
            <ContactRow icon={Clock} label={t("resources.hours")}>
              {partner.hours}
            </ContactRow>
          )}
          {partner.languages && partner.languages.length > 0 && (
            <ContactRow icon={Languages} label={t("resources.languages")}>
              {partner.languages.join(", ")}
            </ContactRow>
          )}
        </dl>
      )}
    </>
  );
}

function ContactRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Globe;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 bg-surface px-4 py-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-placeholder" aria-hidden />
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-medium text-ink-placeholder">{label}</dt>
        <dd className="mt-0.5 text-sm leading-relaxed text-ink-secondary">
          {children}
        </dd>
      </div>
    </div>
  );
}
