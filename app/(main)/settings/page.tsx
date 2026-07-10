"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Camera, ChevronRight, KeyRound, LogOut, Mail, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { LanguagePicker } from "@/components/LanguagePicker";
import { useToast } from "@/components/ui/ToastProvider";
import { OnboardingEditModal } from "@/components/onboarding/OnboardingEditModal";
import { ChangeEmailModal } from "@/components/account/ChangeEmailModal";
import { ChangePasswordModal } from "@/components/account/ChangePasswordModal";
import { DeleteAccountModal } from "@/components/account/DeleteAccountModal";
import { BlockedAccountsList } from "@/components/moderation/BlockedAccountsList";
import { useAuthUser } from "@/hooks/useAuthUser";
import { signOut } from "@/services/auth";
import { trackUserSignedOut } from "@/lib/analytics";
import {
  useCurrentUser,
  useRemoveAvatar,
  useUpdateAvatar,
  useUpdateUserDetails,
  useUpdateUsername,
} from "@/hooks/useProfile";
import {
  useUpdateDisplayName,
  useUpdateLearningReminders,
} from "@/hooks/useOnboarding";
import { USERNAME_RE } from "@/lib/supabase/username";
import { cn, moveCaretToEnd } from "@/lib/utils";
import type { UserProfile } from "@/types";

/** Readable text for a failed mutation, falling back when there's no message. */
function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

const inputClass =
  "w-full rounded-lg border border-border-card bg-surface px-3 py-2 text-base text-ink-muted outline-none focus:border-primary";
const labelClass = "block text-sm font-medium text-ink-secondary";

/** A titled settings card. */
function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-card border border-border-card bg-surface p-5">
      <h2 className="text-base font-semibold text-ink-secondary">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/* ---- Edit profile ------------------------------------------------------- */

/** Display name → onboarding first_name. Only rendered when an onboarding row
 *  exists (otherwise the partial update would silently no-op). */
function DisplayNameField({ initial }: { initial: string }) {
  const toast = useToast();
  const { t } = useTranslation();
  // Seeded once on mount; the parent re-keys this field on the persisted value,
  // so it remounts (re-seeding) after a successful save — no render-time re-sync.
  const [draft, setDraft] = useState(initial);
  const mutation = useUpdateDisplayName();
  const dirty = draft.trim() !== initial.trim();

  const handleSave = () => {
    mutation.mutate(draft, {
      onSuccess: () => toast.success(t("settingsWeb.displayNameUpdated")),
      onError: (error) => console.error("updateDisplayName failed", error),
    });
  };

  return (
    <div>
      <label className={labelClass} htmlFor="settings-display-name">
        {t("settingsWeb.displayName")}
      </label>
      <p className="mt-0.5 text-xs text-ink-muted">
        {t("settingsWeb.displayNameHelper")}
      </p>
      <div className="mt-1.5 flex gap-2">
        <input
          id="settings-display-name"
          value={draft}
          maxLength={50}
          placeholder={t("settingsWeb.displayNamePlaceholder")}
          onChange={(event) => {
            setDraft(event.target.value);
            mutation.reset();
          }}
          onFocus={moveCaretToEnd}
          className={inputClass}
        />
        <Button
          size="sm"
          loading={mutation.isPending}
          disabled={!dirty}
          onClick={handleSave}
        >
          {t("common.save")}
        </Button>
      </div>
      {mutation.isError && (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {errorText(mutation.error, t("settingsWeb.displayNameError"))}
        </p>
      )}
    </div>
  );
}

/** Username → users.username. Live charset validation; the unique-violation
 *  message comes back from the mutation. */
function UsernameField({ initial }: { initial: string }) {
  const toast = useToast();
  const { t } = useTranslation();
  const [draft, setDraft] = useState(initial);
  const mutation = useUpdateUsername();
  const trimmed = draft.trim();
  const dirty = trimmed !== initial.trim();
  const formatError =
    trimmed.length > 0 && !USERNAME_RE.test(trimmed)
      ? t("settingsWeb.usernameFormatError")
      : null;
  const canSave = dirty && trimmed.length > 0 && !formatError;

  const handleSave = () => {
    mutation.mutate(trimmed, {
      onSuccess: () => toast.success(t("settingsWeb.usernameUpdated")),
      onError: (error) => console.error("updateUsername failed", error),
    });
  };

  return (
    <div>
      <label className={labelClass} htmlFor="settings-username">
        {t("editName.usernameLabel")}
      </label>
      <p className="mt-0.5 text-xs text-ink-muted">
        {t("settingsWeb.usernameHelper")}
      </p>
      <div className="mt-1.5 flex gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-ink-placeholder">
            @
          </span>
          <input
            id="settings-username"
            value={draft}
            maxLength={20}
            onChange={(event) => {
              setDraft(event.target.value);
              mutation.reset();
            }}
            onFocus={moveCaretToEnd}
            className={cn(inputClass, "pl-7")}
          />
        </div>
        <Button
          size="sm"
          loading={mutation.isPending}
          disabled={!canSave}
          onClick={handleSave}
        >
          {t("common.save")}
        </Button>
      </div>
      {formatError && (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {formatError}
        </p>
      )}
      {mutation.isError && (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {errorText(mutation.error, t("settingsWeb.usernameError"))}
        </p>
      )}
    </div>
  );
}

/** Bio + pronouns → users.biography / users.pronouns, saved together. */
function BioPronounsField({
  initialBio,
  initialPronouns,
}: {
  initialBio: string;
  initialPronouns: string;
}) {
  const toast = useToast();
  const { t } = useTranslation();
  const [bio, setBio] = useState(initialBio);
  const [pronouns, setPronouns] = useState(initialPronouns);
  const mutation = useUpdateUserDetails();
  const dirty =
    bio.trim() !== initialBio.trim() ||
    pronouns.trim() !== initialPronouns.trim();

  const handleSave = () => {
    mutation.mutate(
      { bio, pronouns },
      {
        onSuccess: () => toast.success(t("settingsWeb.profileUpdated")),
        onError: (error) => console.error("updateUserDetails failed", error),
      },
    );
  };

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass} htmlFor="settings-bio">
          {t("settingsWeb.bio")}
        </label>
        <textarea
          id="settings-bio"
          value={bio}
          rows={3}
          maxLength={300}
          placeholder={t("settingsWeb.bioPlaceholder")}
          onChange={(event) => {
            setBio(event.target.value);
            mutation.reset();
          }}
          className={cn(inputClass, "mt-1.5 resize-none")}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="settings-pronouns">
          {t("settingsWeb.pronouns")}
        </label>
        <input
          id="settings-pronouns"
          value={pronouns}
          maxLength={30}
          placeholder={t("settingsWeb.pronounsPlaceholder")}
          onChange={(event) => {
            setPronouns(event.target.value);
            mutation.reset();
          }}
          onFocus={moveCaretToEnd}
          className={cn(inputClass, "mt-1.5")}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          loading={mutation.isPending}
          disabled={!dirty}
          onClick={handleSave}
        >
          {t("common.save")}
        </Button>
        {mutation.isError && (
          <p className="text-xs text-destructive" role="alert">
            {errorText(mutation.error, t("settingsWeb.saveChangesError"))}
          </p>
        )}
      </div>
    </div>
  );
}

function EditProfileSection({ profile }: { profile: UserProfile }) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const updateAvatar = useUpdateAvatar();
  const removeAvatar = useRemoveAvatar();
  const avatarBusy = updateAvatar.isPending || removeAvatar.isPending;

  const avatarError = updateAvatar.isError
    ? errorText(updateAvatar.error, t("settingsWeb.photoUpdateError"))
    : removeAvatar.isError
      ? errorText(removeAvatar.error, t("settingsWeb.photoRemoveError"))
      : null;

  const handleAvatarFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so re-picking the same file still fires onChange.
    event.target.value = "";
    if (file) updateAvatar.mutate(file);
  };

  return (
    <Section title={t("settingsWeb.editProfile")}>
      <div className="flex items-center gap-4">
        <Avatar
          username={profile.username}
          profilePictureUrl={profile.profilePictureUrl}
          size={64}
        />
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarFile}
          />
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Camera className="h-4 w-4" aria-hidden />}
            loading={updateAvatar.isPending}
            disabled={avatarBusy}
            onClick={() => fileInputRef.current?.click()}
          >
            {t("settingsWeb.changePhoto")}
          </Button>
          {profile.profilePictureUrl && (
            <Button
              variant="ghost"
              size="sm"
              loading={removeAvatar.isPending}
              disabled={avatarBusy}
              onClick={() => removeAvatar.mutate()}
            >
              {t("settingsWeb.remove")}
            </Button>
          )}
        </div>
      </div>
      {avatarError && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {avatarError}
        </p>
      )}

      <div className="mt-5 space-y-5">
        {profile.onboarding ? (
          // key = the persisted value, so the field remounts (re-seeds) only on a
          // real server change after save — never mid-edit, since typing doesn't
          // change the key. This replaces the buggy render-time re-sync.
          <DisplayNameField
            key={`displayName-${profile.onboarding.firstName ?? ""}`}
            initial={profile.onboarding.firstName ?? ""}
          />
        ) : (
          <p className="text-xs text-ink-placeholder">
            {t("settingsWeb.finishProfileForName")}
          </p>
        )}
        <UsernameField
          key={`username-${profile.username}`}
          initial={profile.username}
        />
        <BioPronounsField
          key={JSON.stringify([profile.bio ?? "", profile.pronouns ?? ""])}
          initialBio={profile.bio ?? ""}
          initialPronouns={profile.pronouns ?? ""}
        />
      </div>
    </Section>
  );
}

/* ---- Preferences -------------------------------------------------------- */

function PreferencesSection({ profile }: { profile: UserProfile }) {
  const toast = useToast();
  const { t } = useTranslation();
  const [editingOnboarding, setEditingOnboarding] = useState(false);
  const updateReminders = useUpdateLearningReminders();
  const hasOnboarding = profile.onboarding != null;
  const serverReminders = profile.onboarding?.learningReminders ?? false;

  // Optimistic toggle value: while the write is in flight, show the value being
  // written (`variables`); otherwise the server value. On error the pending
  // state clears and it snaps back to the server value — no extra state needed.
  const reminders =
    updateReminders.isPending && updateReminders.variables !== undefined
      ? updateReminders.variables
      : serverReminders;

  return (
    <Section title={t("settings.preferences")}>
      <div className="space-y-4">
        {/* Language — always available (even before onboarding / signed out). */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-secondary">
              {t("language.title")}
            </p>
            <p className="text-xs text-ink-muted">
              {t("settingsWeb.languageDesc")}
            </p>
          </div>
          <LanguagePicker className="shrink-0" />
        </div>

        {hasOnboarding ? (
          <>
            <div className="flex items-center justify-between gap-4 border-t border-border-card pt-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-secondary">
                  {t("settingsWeb.learningReminders")}
                </p>
                <p className="text-xs text-ink-muted">
                  {t("settingsWeb.learningRemindersDesc")}
                </p>
                {updateReminders.isError && (
                  <p className="mt-1 text-xs text-destructive" role="alert">
                    {errorText(
                      updateReminders.error,
                      t("settingsWeb.remindersError"),
                    )}
                  </p>
                )}
              </div>
              <Switch
                checked={reminders}
                disabled={updateReminders.isPending}
                onChange={(next) =>
                  updateReminders.mutate(next, {
                    onSuccess: () =>
                      toast.success(
                        next
                          ? t("settingsWeb.remindersOn")
                          : t("settingsWeb.remindersOff"),
                      ),
                    onError: (error) =>
                      console.error("updateLearningReminders failed", error),
                  })
                }
                aria-label={t("settingsWeb.learningReminders")}
              />
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-border-card pt-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-secondary">
                  {t("settingsWeb.onboardingAnswers")}
                </p>
                <p className="text-xs text-ink-muted">
                  {t("settingsWeb.onboardingAnswersDesc")}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEditingOnboarding(true)}
              >
                {t("settingsWeb.redoOnboarding")}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-4 border-t border-border-card pt-4">
            <p className="text-sm text-ink-muted">
              {t("settingsWeb.completeProfilePrompt")}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0"
              onClick={() => setEditingOnboarding(true)}
            >
              {t("settingsWeb.completeProfile")}
            </Button>
          </div>
        )}
      </div>

      <OnboardingEditModal
        open={editingOnboarding}
        onClose={() => setEditingOnboarding(false)}
        profile={profile.onboarding}
      />
    </Section>
  );
}

/* ---- Legal -------------------------------------------------------------- */

const LEGAL_LINKS = [
  {
    labelKey: "settings.privacyPolicy",
    href: "https://www.notion.so/Unify-s-Privacy-Policy-2e15af89dddb80b0b37ee497e6d4e38c",
  },
  {
    labelKey: "settings.termsOfService",
    href: "https://www.notion.so/Unify-s-Terms-Conditions-3185af89dddb80a68410fa8d65d615c7",
  },
  {
    labelKey: "settings.communityGuidelines",
    href: "https://www.notion.so/Unify-s-Community-Guidelines-2e55af89dddb8098aff0d1460b3fb694",
  },
];

function LegalSection() {
  const { t } = useTranslation();
  return (
    <Section title={t("settings.legal")}>
      <div className="divide-y divide-border-card">
        {LEGAL_LINKS.map((link) => (
          <a
            key={link.labelKey}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-2 py-3 text-sm text-ink-muted transition-colors first:pt-0 last:pb-0 hover:text-ink"
          >
            <span>{t(link.labelKey)}</span>
            <ChevronRight
              className="h-4 w-4 shrink-0 text-ink-placeholder"
              aria-hidden
            />
          </a>
        ))}
      </div>
    </Section>
  );
}

/* ---- Account ------------------------------------------------------------ */

function AccountSection() {
  const router = useRouter();
  const toast = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: authUser } = useAuthUser();
  const [signingOut, setSigningOut] = useState(false);
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);

  // The change-email magic link lands back here as /settings?emailChanged=1
  // (via the auth callback). Confirm it once, then strip the param so a reload
  // doesn't re-toast. Read from the URL directly to avoid a Suspense boundary.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("emailChanged") === "1") {
      toast.success(t("settingsWeb.emailUpdated"));
      params.delete("emailChanged");
      const query = params.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname + (query ? `?${query}` : ""),
      );
    }
  }, [toast, t]);

  const handleSignOut = async () => {
    setSigningOut(true);
    // Capture before sign-out: signOut() triggers the auth listener's
    // resetPostHog(), which clears the identity the event needs to attach to.
    trackUserSignedOut();
    const { error } = await signOut();
    if (error) {
      console.error("Sign out failed", error);
      setSigningOut(false);
      return; // stay put rather than pretend the session is cleared
    }
    // Clear cached data so the next session starts clean, then to /welcome.
    queryClient.clear();
    router.replace("/welcome");
  };

  return (
    <Section title={t("settings.account")}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-secondary">
              {t("nav.signOut")}
            </p>
            <p className="text-xs text-ink-muted">
              {t("settingsWeb.signOutDesc")}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<LogOut className="h-4 w-4" aria-hidden />}
            loading={signingOut}
            onClick={handleSignOut}
          >
            {t("nav.signOut")}
          </Button>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border-card pt-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-secondary">
              {t("settingsWeb.changeEmail")}
            </p>
            <p className="truncate text-xs text-ink-muted">
              {authUser?.email
                ? t("settingsWeb.changeEmailCurrent", { email: authUser.email })
                : t("settingsWeb.changeEmailDesc")}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Mail className="h-4 w-4" aria-hidden />}
            onClick={() => setShowChangeEmail(true)}
          >
            {t("settingsWeb.change")}
          </Button>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border-card pt-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-secondary">
              {t("settingsWeb.changePassword")}
            </p>
            <p className="text-xs text-ink-muted">
              {t("settingsWeb.changePasswordDesc")}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<KeyRound className="h-4 w-4" aria-hidden />}
            onClick={() => setShowChangePassword(true)}
          >
            {t("settingsWeb.change")}
          </Button>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border-card pt-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-secondary">
              {t("settings.deleteAccount")}
            </p>
            <p className="text-xs text-ink-muted">
              {t("settingsWeb.deleteAccountDesc")}
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="shrink-0"
            leftIcon={<Trash2 className="h-4 w-4" aria-hidden />}
            onClick={() => setShowDeleteAccount(true)}
          >
            {t("settings.deleteAccount")}
          </Button>
        </div>
      </div>

      <ChangeEmailModal
        open={showChangeEmail}
        onClose={() => setShowChangeEmail(false)}
        currentEmail={authUser?.email ?? undefined}
      />
      <ChangePasswordModal
        open={showChangePassword}
        onClose={() => setShowChangePassword(false)}
        currentEmail={authUser?.email ?? undefined}
      />
      <DeleteAccountModal
        open={showDeleteAccount}
        onClose={() => setShowDeleteAccount(false)}
      />
    </Section>
  );
}

/* ---- Page --------------------------------------------------------------- */

function SettingsSkeleton() {
  return (
    <div className="space-y-5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-card border border-border-card bg-surface p-5"
          aria-hidden
        >
          <div className="h-4 w-32 rounded bg-surface-gray" />
          <div className="mt-4 space-y-3">
            <div className="h-9 w-full rounded-lg bg-surface-gray" />
            <div className="h-9 w-2/3 rounded-lg bg-surface-gray" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const { data: profile, isLoading, isError } = useCurrentUser();
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[680px] animate-fade-in px-6 py-6">
        <h1 className="mb-5 text-center text-xl font-semibold text-ink-secondary">
          {t("settings.title")}
        </h1>
        <SettingsSkeleton />
      </div>
    );
  }

  // Transport / query failure — distinct from a genuine no-session below, so we
  // don't mislead the user into thinking they're signed out.
  if (isError) {
    return (
      <div
        className="mx-auto max-w-[680px] px-6 py-16 text-center text-sm text-destructive"
        role="alert"
      >
        {t("settingsWeb.loadError")}
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-[680px] px-6 py-16 text-center text-sm text-ink-placeholder">
        {t("settingsWeb.signInPrompt")}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[680px] animate-fade-in px-6 py-6">
      <h1 className="mb-5 text-center text-xl font-semibold text-ink-secondary">
        {t("settings.title")}
      </h1>
      <div className="space-y-5">
        {/* Profile entry — mobile only. The phone bottom nav has no Profile tab,
            so this is the path to the user's own /profile page there; on desktop
            the sidebar already has a Profile nav item, so it's hidden (md:hidden)
            and the page starts with Edit profile. */}
        <Link
          href="/profile"
          className="flex items-center gap-3 rounded-card border border-border-card bg-surface p-4 transition-colors hover:bg-surface-card md:hidden"
        >
          <Avatar
            username={profile.username}
            profilePictureUrl={profile.profilePictureUrl}
            size={44}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink-secondary">
              {profile.username}
            </p>
            <p className="text-xs text-ink-placeholder">
              {t("settingsWeb.viewProfile")}
            </p>
          </div>
          <ChevronRight
            className="h-5 w-5 shrink-0 text-ink-placeholder"
            aria-hidden
          />
        </Link>
        <EditProfileSection profile={profile} />
        <PreferencesSection profile={profile} />
        <Section title={t("settingsWeb.blockedAccounts")}>
          <BlockedAccountsList />
        </Section>
        <LegalSection />
        <AccountSection />
      </div>
    </div>
  );
}
