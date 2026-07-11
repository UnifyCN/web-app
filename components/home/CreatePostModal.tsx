"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Check, ImagePlus, Search } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useCreatePost } from "@/hooks/useFeed";
import { useGroups, useJoinGroup } from "@/hooks/useCommunity";
import { uploadPostImages } from "@/lib/supabase/uploadImage";
import { cn } from "@/lib/utils";

/** Stable destination ids — translated only at render. */
type Destination = "forYou" | "group";

const DESTINATIONS: Destination[] = ["forYou", "group"];
const DESTINATION_LABEL_KEYS: Record<Destination, string> = {
  forYou: "posts.forYou",
  group: "posts.group",
};

/** Error state keeps an i18n key (or a raw upstream message) — never a
 *  translated string — so the copy re-resolves on language switch. */
type PostError = { key: string } | { message: string };

const TITLE_MAX = 100;
const BODY_MAX = 2000;
const IMAGE_MAX = 4;

interface SelectedImage {
  file: File;
  /** Object URL for the local preview thumbnail. */
  url: string;
}

interface CreatePostModalProps {
  open: boolean;
  onClose: () => void;
}

/** Create-post composer — wired to `useCreatePost` (uploads any selected
 *  images to the post-images bucket first, then inserts the post). */
export function CreatePostModal({ open, onClose }: CreatePostModalProps) {
  const { t } = useTranslation();
  const [destination, setDestination] = useState<Destination>("forYou");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [groupSearch, setGroupSearch] = useState("");
  const [joiningId, setJoiningId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<PostError | null>(null);
  const [posted, setPosted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createPost = useCreatePost();
  const { data: allGroups = [], isLoading: groupsLoading } = useGroups();
  const joinGroup = useJoinGroup();

  // Escape to close + lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  // The modal is conditionally mounted by its parent (ComposeButton), so it
  // unmounts on close and all state resets on the next open — no reset effect
  // needed. Revoke any remaining preview object URLs on unmount.
  const imagesRef = useRef<SelectedImage[]>([]);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  useEffect(
    () => () => {
      imagesRef.current.forEach((img) => URL.revokeObjectURL(img.url));
    },
    [],
  );

  if (!open) return null;

  const canPost =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    (destination === "forYou" || groupId !== null);

  const selectedGroup = allGroups.find((group) => group.id === groupId) ?? null;
  const groupQuery = groupSearch.trim().toLowerCase();
  const filteredGroups = groupQuery
    ? allGroups.filter((group) =>
        group.groupName.toLowerCase().includes(groupQuery),
      )
    : allGroups;
  const joinedGroups = filteredGroups.filter((group) => group.joinedByMe);
  const discoverGroups = filteredGroups.filter((group) => !group.joinedByMe);

  function handleAddFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const remaining = IMAGE_MAX - images.length;
    if (remaining <= 0) return;
    const next = Array.from(list)
      .slice(0, remaining)
      .map((file) => ({ file, url: URL.createObjectURL(file) }));
    setImages((prev) => [...prev, ...next]);
  }

  function handleRemoveImage(index: number) {
    setImages((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handlePost() {
    if (!canPost || submitting) return;
    setSubmitting(true);
    setError(null);

    // Upload first so image validation errors (size / type) surface their
    // specific message, separate from a generic post-create failure.
    let postImageUrls: string[];
    try {
      postImageUrls = await uploadPostImages(images.map((i) => i.file));
    } catch (err) {
      console.error("image upload failed", err);
      setError(
        err instanceof Error
          ? { message: err.message }
          : { key: "posts.imageUploadFailed" },
      );
      setSubmitting(false);
      return;
    }

    try {
      await createPost.mutateAsync({
        title,
        content: body,
        groupId: destination === "forYou" ? null : groupId,
        postImageUrls,
      });
      setPosted(true);
      window.setTimeout(onClose, 800);
    } catch (err) {
      console.error("create post failed", err);
      setError({ key: "posts.createPostFailed" });
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-card bg-surface shadow-lg"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t("posts.createPostAria")}
      >
        {posted ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-priority-optional-bg">
              <Check className="h-6 w-6 text-priority-optional" aria-hidden />
            </span>
            <h2 className="mt-4 text-base font-semibold text-ink-secondary">
              {t("posts.postedHeading")}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              {t("posts.postedSubtext")}
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border-card px-4 py-3">
              <button
                type="button"
                onClick={onClose}
                aria-label={t("common.close")}
                className="cursor-pointer rounded-md p-2 text-ink-muted transition-colors hover:bg-surface-gray hover:text-ink"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
              <Button
                variant="primary"
                size="sm"
                disabled={!canPost || submitting}
                loading={submitting}
                onClick={handlePost}
              >
                {t("posts.postButton")}
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {/* Destination toggle */}
              <div className="flex gap-2">
                {DESTINATIONS.map((dest) => (
                  <button
                    key={dest}
                    type="button"
                    onClick={() => {
                      setDestination(dest);
                      if (dest === "forYou") {
                        setGroupId(null);
                        setGroupSearch("");
                      }
                    }}
                    className={cn(
                      "cursor-pointer rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors",
                      destination === dest
                        ? "border-primary bg-primary text-white"
                        : "border-border-card text-ink-muted hover:bg-surface-gray",
                    )}
                  >
                    {t(DESTINATION_LABEL_KEYS[dest])}
                  </button>
                ))}
              </div>
              {destination === "forYou" && (
                <p className="mt-2 text-xs italic text-ink-placeholder">
                  {t("posts.postingToForYou")}
                </p>
              )}

              {/* Group destination — selected pill, else the picker */}
              {destination === "group" && selectedGroup && (
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <span className="font-semibold text-ink-secondary">
                    {t("posts.postingTo", { name: selectedGroup.groupName })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setGroupId(null)}
                    aria-label={t("posts.clearGroupAria")}
                    className="cursor-pointer rounded-md p-0.5 text-ink-muted transition-colors hover:bg-surface-gray hover:text-ink"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              )}

              {destination === "group" && !selectedGroup && (
                <div className="mt-3">
                  {/* Search — pinned above the scrollable list */}
                  <div className="flex items-center gap-2 rounded-full bg-surface-gray px-3.5 py-2">
                    <Search
                      className="h-4 w-4 shrink-0 text-ink-placeholder"
                      aria-hidden
                    />
                    <input
                      type="text"
                      value={groupSearch}
                      onChange={(event) => setGroupSearch(event.target.value)}
                      placeholder={t("groups.searchGroups")}
                      aria-label={t("groups.searchGroups")}
                      className="w-full bg-transparent text-base text-ink-secondary placeholder:text-ink-placeholder focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                    />
                  </div>

                  {groupsLoading ? (
                    <p className="mt-4 text-sm text-ink-muted">
                      {t("groups.loadingGroups")}
                    </p>
                  ) : (
                    <div className="relative mt-1">
                      {/* Scrolls internally; the bottom fade hints there are more
                          groups below the visible rows. pb-6 keeps the last row
                          clear of the fade. */}
                      <div className="max-h-72 overflow-y-auto pb-6">
                        {/* Your Groups */}
                        <h3 className="text-sm font-bold text-ink-secondary">
                          {t("groups.yourGroups")}
                        </h3>
                        {joinedGroups.length > 0 ? (
                          <div className="mt-1 space-y-1">
                            {joinedGroups.map((group) => (
                              <button
                                key={group.id}
                                type="button"
                                onClick={() => setGroupId(group.id)}
                                className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-gray"
                              >
                                <Avatar
                                  username={group.groupName}
                                  profilePictureUrl={group.coverPhotoUrl}
                                  size={40}
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-ink-secondary">
                                    {group.groupName}
                                  </p>
                                  {group.groupDescription && (
                                    <p className="line-clamp-2 text-xs text-ink-muted">
                                      {group.groupDescription}
                                    </p>
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-1 text-sm text-ink-muted">
                            {t("groups.notJoinedHint")}
                          </p>
                        )}

                        {/* Discover More Groups */}
                        {discoverGroups.length > 0 && (
                          <>
                            <h3 className="mt-4 text-sm font-bold text-ink-secondary">
                              {t("groups.discoverMore")}
                            </h3>
                            <p className="text-xs text-ink-muted">
                              {t("groups.joinToPost")}
                            </p>
                            <div className="mt-1 space-y-1">
                              {discoverGroups.map((group) => (
                                <div
                                  key={group.id}
                                  className="flex items-center gap-3 rounded-lg px-2 py-2"
                                >
                                  <Avatar
                                    username={group.groupName}
                                    profilePictureUrl={group.coverPhotoUrl}
                                    size={40}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-ink-secondary">
                                      {group.groupName}
                                    </p>
                                    {group.groupDescription && (
                                      <p className="line-clamp-2 text-xs text-ink-muted">
                                        {group.groupDescription}
                                      </p>
                                    )}
                                  </div>
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    className="shrink-0"
                                    loading={joiningId === group.id}
                                    disabled={joiningId !== null}
                                    onClick={() => {
                                      setJoiningId(group.id);
                                      joinGroup.mutate(group.id, {
                                        onSuccess: () => setGroupId(group.id),
                                        onSettled: () => setJoiningId(null),
                                      });
                                    }}
                                  >
                                    {t("posts.joinAndPost")}
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                      {/* Bottom fade — affordance that more groups scroll below. */}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-surface to-transparent" />
                    </div>
                  )}
                </div>
              )}

              {/* Title */}
              <div className="mt-5 border-b border-border-card pb-2">
                <input
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={TITLE_MAX}
                  placeholder={t("posts.titlePlaceholder")}
                  aria-label={t("posts.postTitleAria")}
                  className="w-full bg-transparent text-lg font-semibold text-ink-secondary placeholder:text-ink-placeholder focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                />
                <p className="mt-1 text-right text-xs text-ink-placeholder">
                  {title.length}/{TITLE_MAX}
                </p>
              </div>

              {/* Body */}
              <div className="mt-3">
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={BODY_MAX}
                  placeholder={t("posts.contentPlaceholder")}
                  aria-label={t("posts.postBodyAria")}
                  className="min-h-[160px] w-full resize-none bg-transparent text-base leading-relaxed text-ink-muted placeholder:text-ink-placeholder focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                />
                <p className="text-right text-xs text-ink-placeholder">
                  {body.length}/{BODY_MAX}
                </p>
              </div>

              {/* Image previews */}
              {images.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {images.map((img, index) => (
                    <div
                      key={img.url}
                      className="relative h-20 w-20 overflow-hidden rounded-lg border border-border-card"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- local object-URL preview, not a remote asset */}
                      <img
                        src={img.url}
                        alt={t("posts.selectedImageAlt", { number: index + 1 })}
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(index)}
                        aria-label={t("posts.removeImageAria", {
                          number: index + 1,
                        })}
                        className="absolute right-1 top-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-ink/60 text-white transition-colors hover:bg-ink/80"
                      >
                        <X className="h-3 w-3" aria-hidden />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add photos */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={(event) => {
                  handleAddFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={images.length >= IMAGE_MAX}
                className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full border border-border-card px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-gray disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ImagePlus className="h-4 w-4" aria-hidden />
                {images.length > 0
                  ? t("posts.addPhotosCount", {
                      count: images.length,
                      max: IMAGE_MAX,
                    })
                  : t("posts.addPhotos")}
              </button>

              {error && (
                <p className="mt-3 text-sm text-destructive" role="alert">
                  {"key" in error ? t(error.key) : error.message}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
