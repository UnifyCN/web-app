"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Globe,
  Info,
  Languages,
  Mail,
  MapPin,
  Navigation,
  Phone,
  type LucideIcon,
} from "lucide-react";
import { cn, externalHref, telHref } from "@/lib/utils";
import { OrgMonogram } from "./OrgMonogram";
import { BackLink } from "./BackLink";
import { CostChip } from "./CostChip";
import { FilterPill } from "./FilterPill";
import {
  PARTNER_CATEGORY_COLORS,
  PARTNER_CATEGORY_TINTS,
  PARTNER_CATEGORY_LABEL_KEYS,
  COST_LABEL_KEYS,
  categoryIconSrc,
} from "@/lib/resources/categories";
import type { ResourcePartner } from "@/lib/resources/partners";
import { programCopyKey } from "@/lib/resources/localizePartner";
import {
  trackResourcesPartnerOpened,
  trackResourcesPartnerWebsiteOpened,
  trackResourcesProgramOpened,
} from "@/lib/analytics";

/**
 * Referral-partnership disclosure — temporarily hidden pending Savar's confirmation
 * that the `referral` partners (Canada-Shaw, Global Connect, TuGo, Desjardins) are
 * actual live partnerships and not categorization placeholders ported from his draft.
 * Flip to `true` to re-enable; the `partnershipType` data + the
 * `resources.referralDisclosure` i18n string are left intact so this is a one-line reversal.
 */
const SHOW_REFERRAL_DISCLOSURE = false;

/**
 * Contract-controlled listings: copy is shown exactly as supplied — never
 * re-shaped into steps — and their filter tags stay filter-only (no pills), so
 * the page adds nothing they didn't write.
 */
const VERBATIM_SLUGS = new Set(["canada-shaw-immigration"]);

/**
 * "How to register" steps: the partner's `howToStart` split at sentence ends.
 * Presentation only — the words are unchanged.
 */
function registerSteps(partner: ResourcePartner): string[] {
  const text = partner.howToStart?.trim();
  if (!text) return [];
  if (VERBATIM_SLUGS.has(partner.slug)) return [text];
  return text.split(/(?<=[.!?])\s+(?=[A-Z"“])/).filter(Boolean);
}

/**
 * Letter-spacing breaks Arabic joining and Devanagari / Gurmukhi head-strokes,
 * so tracked labels fall back to normal spacing in those scripts.
 */
const SCRIPT_SAFE_TRACKING =
  "[:lang(ar)_&]:tracking-normal [:lang(hi)_&]:tracking-normal [:lang(pa)_&]:tracking-normal";

const SECTION_LABEL = `text-[11px] font-bold tracking-[0.3px] text-res-count uppercase ${SCRIPT_SAFE_TRACKING}`;

/**
 * Organization detail (Figma 8681:851). Desktop: sidebar (Provided by + actions)
 * beside the main column. Mobile: title → sections → Provided by, with the
 * actions in a sticky bar above the bottom nav.
 */
export function PartnerDetail({ partner }: { partner: ResourcePartner }) {
  const { t, i18n } = useTranslation();
  // Analytics keep the English program name, whatever the UI language.
  const enT = i18n.getFixedT("en");
  const color = PARTNER_CATEGORY_COLORS[partner.category];
  const tint = PARTNER_CATEGORY_TINTS[partner.category];
  const categoryLabel = t(PARTNER_CATEGORY_LABEL_KEYS[partner.category]);
  const website = externalHref(partner.website);
  // `ctaOnly` partners attribute referrals through the website CTA, so it must be
  // the only outbound link: no directions, call, email, or program links.
  const ctaOnly = partner.ctaOnly === true;
  const mapsHref =
    partner.address && !ctaOnly
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          partner.address,
        )}`
      : null;
  const phoneHref = partner.phone && !ctaOnly ? telHref(partner.phone) : null;
  const emailHref = partner.email && !ctaOnly ? `mailto:${partner.email}` : null;
  const languages = partner.languages ?? [];
  const steps = registerSteps(partner);

  // Fire on mount so deep links + list clicks both count once.
  useEffect(() => {
    trackResourcesPartnerOpened({
      slug: partner.slug,
      category: partner.category,
      partnershipType: partner.partnershipType,
    });
  }, [partner.slug, partner.category, partner.partnershipType]);

  const facts: { label: string; value: string }[] = [
    partner.cost && {
      label: t("resources.costLabel"),
      value: t(COST_LABEL_KEYS[partner.cost]),
    },
    partner.format !== "unknown" && {
      label: t("resources.detail.format"),
      value: t(`resources.format.${partner.format}`),
    },
    languages.length > 0 && {
      label: t("resources.languages"),
      value:
        languages.length <= 2
          ? languages.join(", ")
          : t("resources.detail.languageCount", { count: languages.length }),
    },
  ].filter((f): f is { label: string; value: string } => Boolean(f));

  const quickActions = [
    phoneHref && { href: phoneHref, icon: Phone, label: t("resources.call"), a11y: t("resources.callA11y") },
    emailHref && { href: emailHref, icon: Mail, label: t("resources.email"), a11y: t("resources.emailA11y") },
    mapsHref && {
      href: mapsHref,
      icon: Navigation,
      label: t("resources.detail.map"),
      a11y: t("resources.detail.mapA11y", { name: partner.name }),
      external: true,
    },
  ].filter(Boolean) as {
    href: string;
    icon: LucideIcon;
    label: string;
    a11y: string;
    external?: boolean;
  }[];

  const verbatim = VERBATIM_SLUGS.has(partner.slug);
  const tagPills = verbatim ? [] : partner.eligibilityTags;
  const whoHasContent = tagPills.length > 0 || Boolean(partner.eligibility);
  const hasActions = Boolean(website) || quickActions.length > 0;
  const ctaLabel = partner.ctaLabelKey
    ? t(partner.ctaLabelKey)
    : t("resources.visitWebsite");
  const trackWebsite = () =>
    trackResourcesPartnerWebsiteOpened({
      slug: partner.slug,
      partnershipType: partner.partnershipType,
    });

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1000px] animate-fade-in px-4 py-6 md:px-8 md:py-16",
        // Clear the sticky action bar on phones.
        hasActions && "pb-28",
      )}
    >
      <BackLink
        href={`/resources/category/${partner.category}`}
        label={categoryLabel}
      />

      <div className="mt-6 grid grid-cols-1 gap-5 [grid-template-areas:'head'_'body'_'side'] md:mt-8 md:grid-cols-[240px_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:[grid-template-areas:'side_head'_'side_body']">
        {/* ── Title block ─────────────────────────────────────────────── */}
        <header className="flex min-w-0 flex-col gap-2 [grid-area:head]">
          <h1
            className={cn(
              "text-2xl font-bold tracking-[-0.3px] break-words text-res-heading",
              SCRIPT_SAFE_TRACKING,
            )}
          >
            <bdi dir="auto">{partner.name}</bdi>
          </h1>
          <p className="text-sm font-medium text-res-secondary">
            <bdi dir="auto">{partner.tagline}</bdi>
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-2">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-[5px] text-[11.5px] font-semibold"
              style={{ backgroundColor: tint, color }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVG glyph */}
              <img src={categoryIconSrc(partner.category)} alt="" width={13} height={13} />
              {categoryLabel}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-res-search px-2.5 py-[5px] text-[11.5px] font-semibold text-res-secondary">
              <MapPin className="h-[13px] w-[13px] shrink-0" aria-hidden />
              <bdi dir="auto">{partner.serviceArea}</bdi>
            </span>
          </div>

          {facts.length > 0 && (
          <dl className="mt-2 grid grid-cols-2 gap-y-3 self-stretch rounded-[10.5px] border border-res-border bg-surface px-[13px] py-[11px] sm:flex sm:w-fit sm:max-w-full sm:flex-wrap sm:gap-y-2 sm:self-start">
            {facts.map((fact, i) => (
              <div
                key={fact.label}
                className={
                  "flex min-w-[82px] flex-col gap-0.5 pe-[10.5px] sm:border-res-divider " +
                  (i > 0 ? "sm:border-s sm:ps-[10.5px]" : "")
                }
              >
                <dt
                  className={cn(
                    "text-xs font-semibold tracking-[0.6px] text-res-count uppercase",
                    SCRIPT_SAFE_TRACKING,
                  )}
                >
                  {fact.label}
                </dt>
                <dd className="text-xs font-semibold break-words text-res-card-text">
                  <bdi dir="auto">{fact.value}</bdi>
                </dd>
              </div>
            ))}
          </dl>
          )}
        </header>

        {/* ── Sidebar: Provided by + actions ─────────────────────────── */}
        <aside className="flex flex-col gap-[15px] self-start [grid-area:side]">
          <section className="flex flex-col gap-2.5 rounded-xl border border-res-border bg-surface p-[13px]">
            <h2
              className={cn(
                "text-[10.5px] font-extrabold tracking-[0.9px] text-res-count uppercase",
                SCRIPT_SAFE_TRACKING,
              )}
            >
              {t("resources.detail.providedBy")}
            </h2>
            <div className="flex items-center gap-2.5">
              <OrgMonogram
                name={partner.name}
                color={color}
                logo={partner.logo}
                fit={partner.logoFit}
                size={40}
                className="rounded-lg"
              />
              <div className="min-w-0">
                <p className="text-sm font-bold break-words text-res-card-text">
                  <bdi dir="auto">{partner.name}</bdi>
                </p>
                <p className="text-[11.5px] font-medium text-res-count">
                  {categoryLabel}
                  {partner.founded !== undefined &&
                    ` · ${t("resources.detail.since", { year: partner.founded })}`}
                </p>
              </div>
            </div>
            <ul className="flex flex-col gap-1.5">
              {partner.address && (
                <ContactRow icon={MapPin} text={partner.address} />
              )}
              {partner.phone && (
                <ContactRow icon={Phone} text={partner.phone} href={phoneHref} />
              )}
              {partner.email && (
                <ContactRow icon={Mail} text={partner.email} href={emailHref} />
              )}
              {partner.hours && <ContactRow icon={Clock} text={partner.hours} />}
              {languages.length > 0 && (
                <ContactRow icon={Languages} text={languages.join(", ")} />
              )}
            </ul>
          </section>

          {hasActions && (
            <section className="hidden flex-col gap-2 rounded-xl border border-res-border bg-surface p-[13px] md:flex">
              {website && (
                <a
                  href={website}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={trackWebsite}
                  className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-center text-sm leading-tight font-bold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  style={{ backgroundColor: color }}
                >
                  <Globe className="h-4 w-4 shrink-0" aria-hidden />
                  {ctaLabel}
                </a>
              )}
              {quickActions.length > 0 && (
                <div className="grid auto-cols-fr grid-flow-col gap-1.5">
                  {quickActions.map((a) => (
                    <a
                      key={a.label}
                      href={a.href}
                      aria-label={a.a11y}
                      {...(a.external
                        ? { target: "_blank", rel: "noopener noreferrer" }
                        : {})}
                      className="flex min-h-9 items-center justify-center gap-1 rounded-[11px] border border-res-outline px-1 py-2 text-center text-xs leading-tight font-bold text-res-link transition-colors hover:bg-res-free-bg"
                    >
                      <a.icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span>{a.label}</span>
                    </a>
                  ))}
                </div>
              )}
              {SHOW_REFERRAL_DISCLOSURE && partner.partnershipType === "referral" && (
                <p className="flex items-center gap-1.5 text-xs text-res-count">
                  <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>{t("resources.referralDisclosure")}</span>
                </p>
              )}
            </section>
          )}
        </aside>

        {/* ── Sections ────────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-[18px] [grid-area:body]">
          <section className="flex flex-col gap-[5px]">
            <h2 className={SECTION_LABEL}>{t("resources.detail.whatTheyOffer")}</h2>
            {/* Blank-line-separated paragraphs (partner-supplied copy can run long). */}
            {partner.description.split(/\n\s*\n/).map((para, i) => (
              <p key={i} className="text-[13.5px] leading-[20.9px] text-res-body">
                <bdi dir="auto">{para}</bdi>
              </p>
            ))}
            {partner.highlights.length > 0 && (
              <ul className="flex flex-col gap-[5px] pt-[3px]">
                {partner.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-1.5 text-xs font-medium text-res-body">
                    <CheckCircle2 className="mt-px h-[13px] w-[13px] shrink-0 text-res-link" aria-hidden />
                    <bdi dir="auto">{h}</bdi>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {whoHasContent && (
            <section className="flex flex-col gap-[5px]">
              <h2 className={SECTION_LABEL}>{t("resources.detail.whoCanAccess")}</h2>
              {tagPills.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tagPills.map((tag) => (
                    <FilterPill key={tag} label={t(`resources.eligibilityTag.${tag}`)} />
                  ))}
                </div>
              )}
              {partner.eligibility && (
                <p className="text-[13.5px] leading-[20.9px] text-res-body">
                  <bdi dir="auto">{partner.eligibility}</bdi>
                </p>
              )}
            </section>
          )}

          {steps.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className={SECTION_LABEL}>{t("resources.detail.howToRegister")}</h2>
              <ol className="flex flex-col gap-1.5">
                {steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-[7.5px] text-xs leading-[15.2px] font-medium text-res-body">
                    <span className="flex h-[16.5px] w-[16.5px] shrink-0 items-center justify-center rounded-full bg-res-free-bg text-[11px] font-black text-res-link">
                      {i + 1}
                    </span>
                    <span className="min-w-0 break-words pt-px"><bdi dir="auto">{step}</bdi></span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {partner.programs && partner.programs.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className={SECTION_LABEL}>{t("resources.programs")}</h2>
              <ul className="flex flex-col gap-3">
                {partner.programs.map((program) => {
                  const purl = ctaOnly ? null : externalHref(program.url);
                  return (
                    <li
                      key={program.id}
                      className="rounded-[15px] border border-res-border bg-surface px-[15px] py-[14px]"
                    >
                      {purl ? (
                        <a
                          href={purl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() =>
                            trackResourcesProgramOpened({
                              slug: partner.slug,
                              programName: enT(
                                programCopyKey(partner.slug, program.id, "name"),
                              ),
                            })
                          }
                          className="inline-flex items-center gap-1.5 text-sm font-bold text-res-card-text transition-colors hover:text-res-link"
                        >
                          <bdi dir="auto">{program.name}</bdi>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-res-count" aria-hidden />
                        </a>
                      ) : (
                        <p className="text-sm font-bold text-res-card-text">
                          <bdi dir="auto">{program.name}</bdi>
                        </p>
                      )}
                      <p className="mt-1 text-[13px] leading-[18.2px] text-res-secondary">
                        <bdi dir="auto">{program.description}</bdi>
                      </p>
                      {program.eligibility && (
                        <p className="mt-1.5 text-xs leading-relaxed text-res-secondary">
                          <span className="font-semibold text-res-body">
                            {t("resources.whoItsFor")}:
                          </span>{" "}
                          <bdi dir="auto">{program.eligibility}</bdi>
                        </p>
                      )}
                      {program.cost && <CostChip cost={program.cost} className="mt-2" />}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </div>

      {/* ── Phones: sticky action bar above the bottom nav ─────────────── */}
      {hasActions && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-res-divider bg-surface px-4 py-2.5 md:hidden">
          <div className="mx-auto flex max-w-[680px] items-stretch gap-2">
            {website && (
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer"
                onClick={trackWebsite}
                className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-center text-sm leading-tight font-bold text-white"
                style={{ backgroundColor: color }}
              >
                <Globe className="h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0">{ctaLabel}</span>
              </a>
            )}
            {quickActions.map((a) => (
              <a
                key={a.label}
                href={a.href}
                aria-label={a.a11y}
                title={a.label}
                {...(a.external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className={cn(
                  "flex min-h-11 items-center justify-center rounded-xl border border-res-outline text-res-link",
                  website ? "w-11 shrink-0" : "flex-1 gap-1.5 text-xs font-bold",
                )}
              >
                <a.icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                {!website && <span>{a.label}</span>}
              </a>
            ))}
          </div>
          {SHOW_REFERRAL_DISCLOSURE && partner.partnershipType === "referral" && (
            <p className="mx-auto mt-1.5 flex max-w-[680px] items-center gap-1.5 text-xs text-res-count">
              <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{t("resources.referralDisclosure")}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ContactRow({
  icon: Icon,
  text,
  href,
}: {
  icon: LucideIcon;
  text: string;
  /** Linked only when set — `ctaOnly` partners show plain text. */
  href?: string | null;
}) {
  return (
    <li className="flex items-start gap-[7px] text-[12.5px] leading-snug font-medium text-res-body">
      <Icon className="mt-0.5 h-[14px] w-[14px] shrink-0 text-res-count" aria-hidden />
      {href ? (
        <a href={href} className="min-w-0 break-words text-res-link hover:underline">
          <bdi dir="auto">{text}</bdi>
        </a>
      ) : (
        <bdi dir="auto" className="min-w-0 break-words">{text}</bdi>
      )}
    </li>
  );
}
