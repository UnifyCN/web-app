"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BriefcaseBusiness, Globe, Handshake } from "lucide-react";
import { ModalShell } from "@/components/ui/ModalShell";
import { useAuthUser } from "@/hooks/useAuthUser";
import {
  trackWhatsNewDismissed,
  trackWhatsNewShowMe,
  trackWhatsNewShown,
} from "@/lib/analytics";
import { cn, RTL_FLIP } from "@/lib/utils";
import {
  WHATS_NEW_ITEMS,
  closeWhatsNew,
  hasSeenWhatsNew,
  markWhatsNewSeen,
  openWhatsNew,
  requestHighlight,
  whatsNewOpenStore,
  type WhatsNewItem,
  type WhatsNewItemId,
} from "@/lib/whatsNew";

const ICONS: Record<WhatsNewItemId, React.ComponentType<{ className?: string }>> = {
  job_tools: BriefcaseBusiness,
  resources: Handshake,
  language: Globe,
};

/** True while another modal dialog (e.g. the resume announcement) is open. */
function otherDialogOpen(): boolean {
  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}

/**
 * One-time "What's new" card, mounted once in the (main) layout. Built on the
 * same ModalShell + motion vocabulary as the first-visit ResumeAnnouncementModal
 * (Escape / backdrop / close all dismiss, focus trapped), with the items easing
 * in like that popup's illustration (static under reduced motion).
 *
 * Auto-opens once per user (localStorage, keyed by user id) on the next visit,
 * waiting for any other open dialog to close first so two popups never stack.
 * Settings reopens it through `openWhatsNew()`. "Show me" closes the card,
 * navigates, and queues a highlight on the target (WhatsNewHighlight).
 */
export function WhatsNewCard() {
  const { t } = useTranslation();
  const router = useRouter();
  const reduce = useReducedMotion();
  const { data: user } = useAuthUser();
  const userId = user?.id;
  const trigger = useSyncExternalStore(
    whatsNewOpenStore.subscribe,
    whatsNewOpenStore.get,
    () => null,
  );
  const open = trigger !== null;

  // Auto-open once per user. Marked seen the moment it shows, so a reload or a
  // second tab never re-shows it.
  useEffect(() => {
    if (!userId || hasSeenWhatsNew(userId)) return;
    const show = () => {
      if (hasSeenWhatsNew(userId)) return true;
      if (otherDialogOpen()) return false;
      markWhatsNewSeen(userId);
      openWhatsNew("auto");
      return true;
    };
    if (show()) return;
    // Another dialog is up: wait for it to close.
    const observer = new MutationObserver(() => {
      if (show()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [userId]);

  // `whats_new_shown` once per opening (auto or from Settings).
  const lastTrigger = useRef<typeof trigger>(null);
  useEffect(() => {
    if (trigger && lastTrigger.current !== trigger) {
      trackWhatsNewShown({ trigger });
    }
    lastTrigger.current = trigger;
  }, [trigger]);

  function dismiss() {
    if (userId) markWhatsNewSeen(userId);
    trackWhatsNewDismissed();
    closeWhatsNew();
  }

  function showMe(item: WhatsNewItem) {
    if (userId) markWhatsNewSeen(userId);
    trackWhatsNewShowMe({ item: item.id });
    closeWhatsNew();
    requestHighlight(item);
    router.push(item.href);
  }

  return (
    <ModalShell open={open} title={t("whatsNew.title")} onClose={dismiss}>
      <p className="-mt-2 mb-4 text-sm text-ink-muted">{t("whatsNew.subtitle")}</p>
      {/* Scrolls on short phones so "Got it" stays reachable. */}
      <ul className="-mx-1 max-h-[60dvh] space-y-3 overflow-y-auto px-1">
        {WHATS_NEW_ITEMS.map((item, i) => {
          const Icon = ICONS[item.id];
          return (
            <motion.li
              key={item.id}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.07, duration: 0.25, ease: "easeOut" }}
              className="flex items-start gap-3 rounded-card border border-border-card bg-surface-card p-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-bg text-primary">
                <Icon className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-secondary">
                  {t(`whatsNew.items.${item.key}.title`)}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                  {t(`whatsNew.items.${item.key}.body`)}
                </p>
                <button
                  type="button"
                  onClick={() => showMe(item)}
                  className="mt-2 inline-flex cursor-pointer items-center gap-1 rounded-full bg-primary-bg px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary-subtle"
                >
                  {t("whatsNew.showMe")}
                  <ArrowRight className={cn("h-3.5 w-3.5", RTL_FLIP)} aria-hidden />
                </button>
              </div>
            </motion.li>
          );
        })}
      </ul>
      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={dismiss}
          className="cursor-pointer rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          {t("whatsNew.gotIt")}
        </button>
      </div>
    </ModalShell>
  );
}
