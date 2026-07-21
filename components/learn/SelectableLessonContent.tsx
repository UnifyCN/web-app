"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn, escapeRegExp } from "@/lib/utils";
import { PortableTextRenderer } from "./PortableTextRenderer";
import { SelectionActionBubble } from "./SelectionActionBubble";
import {
  usePageHighlights,
  useSaveHighlight,
  useDeleteHighlight,
} from "@/hooks/useHighlights";
import type { SanityBlock, SanitySpan } from "@/types";

interface SelectableLessonContentProps {
  blocks: SanityBlock[] | undefined;
  lessonId: string;
  pageKey: string;
  pageNum: number;
  moduleId: string;
  submoduleId: string;
  submoduleTitle: string;
  /** Open the Ask-AI modal for the given term. */
  onAskAI: (term: string) => void;
  /** Temporary search-term highlight (from `?highlight=`); cleared with the param. */
  highlightQuery?: string;
  className?: string;
}

/** Standard text blocks are word-selectable; everything else is delegated. */
function isSelectableBlock(block: SanityBlock): boolean {
  if (block._type !== "block" || block.listItem) return false;
  const style = block.style ?? "normal";
  return ["normal", "h2", "h3", "h4", "blockquote"].includes(style);
}

/** Split into word + whitespace tokens, preserving the whitespace runs. */
function tokenize(text: string): { text: string; isWord: boolean }[] {
  return text
    .split(/(\s+)/)
    .filter((t) => t.length > 0)
    .map((t) => ({ text: t, isWord: !/^\s+$/.test(t) }));
}

const SAFE_PROTOCOL = /^https?:\/\//i;

function resolveMarks(span: SanitySpan, block: SanityBlock) {
  const marks = span.marks ?? [];
  let linkHref: string | undefined;
  for (const m of marks) {
    const def = block.markDefs?.find((d) => d._key === m);
    if (def && def._type === "link") {
      const href = (def as { href?: unknown }).href;
      if (typeof href === "string" && SAFE_PROTOCOL.test(href)) linkHref = href;
    }
  }
  return {
    strong: marks.includes("strong"),
    em: marks.includes("em"),
    code: marks.includes("code"),
    linkHref,
  };
}

type Tok =
  | {
      kind: "word";
      idx: number;
      text: string;
      strong: boolean;
      em: boolean;
      code: boolean;
      linkHref?: string;
    }
  | { kind: "space"; text: string };

function blockTokens(block: SanityBlock): Tok[] {
  const toks: Tok[] = [];
  let wordIdx = 0;
  for (const span of block.children ?? []) {
    const m = resolveMarks(span, block);
    for (const t of tokenize(span.text)) {
      if (t.isWord) {
        toks.push({ kind: "word", idx: wordIdx++, text: t.text, ...m });
      } else {
        toks.push({ kind: "space", text: t.text });
      }
    }
  }
  return toks;
}

interface ActiveSelection {
  blockKey: string;
  start: number;
  end: number;
  text: string;
  x: number;
  y: number;
  canRemove: boolean;
}

export function SelectableLessonContent({
  blocks,
  lessonId,
  pageKey,
  pageNum,
  moduleId,
  submoduleId,
  submoduleTitle,
  onAskAI,
  highlightQuery,
  className,
}: SelectableLessonContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const firstMatchRef = useRef<HTMLElement | null>(null);
  const [selection, setSelection] = useState<ActiveSelection | null>(null);

  const { data: highlights = [] } = usePageHighlights(lessonId, pageKey);
  const save = useSaveHighlight(lessonId, pageKey);
  const del = useDeleteHighlight(lessonId, pageKey);

  // blockKey -> ordered word list (for reconstructing merged text).
  const blockWords = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const block of blocks ?? []) {
      if (!isSelectableBlock(block)) continue;
      map[block._key] = (block.children ?? []).flatMap((span) =>
        tokenize(span.text)
          .filter((t) => t.isWord)
          .map((t) => t.text),
      );
    }
    return map;
  }, [blocks]);

  // blockKey -> word indices covered by a search-term match. The query is split
  // into words and consecutive runs that match the full phrase are marked, so
  // multi-word queries (e.g. "social insurance") highlight, not just single words.
  const searchMatches = useMemo<Record<string, Set<number>>>(() => {
    const map: Record<string, Set<number>> = {};
    const q = highlightQuery?.trim();
    if (!q) return map;
    // Per-query-word whole-word matchers (tolerate punctuation on a token).
    const res = q
      .split(/\s+/)
      .map((w) => new RegExp(`\\b${escapeRegExp(w)}\\b`, "i"));
    const n = res.length;
    for (const [blockKey, words] of Object.entries(blockWords)) {
      const set = new Set<number>();
      for (let i = 0; i + n <= words.length; i++) {
        let ok = true;
        for (let j = 0; j < n; j++) {
          if (!res[j].test(words[i + j])) {
            ok = false;
            break;
          }
        }
        if (ok) for (let j = 0; j < n; j++) set.add(i + j);
      }
      if (set.size > 0) map[blockKey] = set;
    }
    return map;
  }, [blockWords, highlightQuery]);

  // blockKey -> saved highlight ranges.
  const ranges = useMemo(() => {
    const map: Record<string, { start: number; end: number }[]> = {};
    for (const h of highlights) {
      (map[h.blockKey] ??= []).push({
        start: h.startWordIndex,
        end: h.endWordIndex,
      });
    }
    return map;
  }, [highlights]);

  function clearSelection() {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }

  function handleMouseUp() {
    const sel = window.getSelection();
    const container = containerRef.current;
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !container) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) {
      setSelection(null);
      return;
    }

    const wordEls = Array.from(
      container.querySelectorAll<HTMLElement>(
        "[data-word-index][data-block-key]",
      ),
    ).filter((el) => range.intersectsNode(el));
    if (wordEls.length === 0) {
      setSelection(null);
      return;
    }

    // Snap to a single block (the first one the selection touches).
    const blockKey = wordEls[0].dataset.blockKey as string;
    const inBlock = wordEls
      .filter((el) => el.dataset.blockKey === blockKey)
      .sort(
        (a, b) => Number(a.dataset.wordIndex) - Number(b.dataset.wordIndex),
      );
    const start = Number(inBlock[0].dataset.wordIndex);
    const end = Number(inBlock[inBlock.length - 1].dataset.wordIndex);
    // Reconstruct from the block's word list (same source as start/end and the
    // saved range) so the stored selected_text always matches the stored range.
    const blockWordList = blockWords[blockKey] ?? [];
    const text = blockWordList.slice(start, end + 1).join(" ");
    const rect = range.getBoundingClientRect();
    const canRemove = (ranges[blockKey] ?? []).some(
      (r) => r.start <= end && r.end >= start,
    );
    setSelection({
      blockKey,
      start,
      end,
      text,
      x: rect.left + rect.width / 2,
      y: rect.top,
      canRemove,
    });
  }

  // Dismiss the bubble on outside click / scroll.
  useEffect(() => {
    if (!selection) return;
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-selection-bubble]")) return;
      setSelection(null);
    }
    function onScroll() {
      setSelection(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSelection(null);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    window.addEventListener("scroll", onScroll, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [selection]);

  // Scroll the first search-term match into view when arriving from search.
  useEffect(() => {
    if (!highlightQuery) return;
    firstMatchRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [highlightQuery, pageKey]);

  function onHighlight() {
    if (!selection) return;
    save.mutate({
      lessonId,
      pageKey,
      blockKey: selection.blockKey,
      startWordIndex: selection.start,
      endWordIndex: selection.end,
      selectedText: selection.text,
      existingHighlights: highlights,
      allWordsInBlock: blockWords[selection.blockKey] ?? [],
      navContext: { moduleId, submoduleId, submoduleTitle, pageNum },
    });
    clearSelection();
  }

  function onRemove() {
    if (!selection) return;
    const overlapping = highlights.filter(
      (h) =>
        h.blockKey === selection.blockKey &&
        h.startWordIndex <= selection.end &&
        h.endWordIndex >= selection.start,
    );
    overlapping.forEach((h) => del.mutate(h.id));
    clearSelection();
  }

  function onAsk() {
    if (!selection) return;
    onAskAI(selection.text);
    clearSelection();
  }

  if (!blocks || blocks.length === 0) return null;

  // Fall back to plain rendering when the page has no stable key to scope
  // highlights against (shouldn't happen for real Sanity content).
  if (!pageKey) {
    return <PortableTextRenderer value={blocks} className={className} />;
  }

  // Segment into selectable text blocks and delegated runs (lists, callout
  // boxes, images) so @portabletext still groups list items correctly.
  type Segment =
    | { type: "sel"; block: SanityBlock }
    | { type: "delegate"; blocks: SanityBlock[] };
  const segments: Segment[] = [];
  let buffer: SanityBlock[] = [];
  const flush = () => {
    if (buffer.length) {
      segments.push({ type: "delegate", blocks: buffer });
      buffer = [];
    }
  };
  for (const block of blocks) {
    if (isSelectableBlock(block)) {
      flush();
      segments.push({ type: "sel", block });
    } else {
      buffer.push(block);
    }
  }
  flush();

  // Tracks whether the scroll anchor ref has been placed; only the first
  // matching word (blocks render top-to-bottom in order) gets it.
  let firstSearchMatchAssigned = false;

  function renderSelectableBlock(block: SanityBlock): ReactNode {
    const blockKey = block._key;
    const blockRanges = ranges[blockKey] ?? [];
    const isHL = (idx: number) =>
      blockRanges.some((r) => r.start <= idx && idx <= r.end);
    const blockSearchSet = searchMatches[blockKey];
    // Search highlight never overrides a saved highlight.
    const isSearchHL = (idx: number) =>
      !isHL(idx) && (blockSearchSet?.has(idx) ?? false);
    const toks = blockTokens(block);

    // The link href covering token i. Spaces between two words of the same
    // link inherit it so the whole run (and its underline) stays continuous.
    const linkAt = (i: number): string | undefined => {
      const t = toks[i];
      if (t.kind === "word") return t.linkHref;
      const prev = toks[i - 1];
      const next = toks[i + 1];
      if (
        prev?.kind === "word" &&
        next?.kind === "word" &&
        prev.linkHref &&
        prev.linkHref === next.linkHref
      ) {
        return prev.linkHref;
      }
      return undefined;
    };

    // Render one token. `insideLink` omits the per-word link styling because the
    // wrapping <a> owns the colour + underline.
    const renderTok = (t: Tok, i: number, insideLink: boolean): ReactNode => {
      if (t.kind === "space") {
        const prev = toks[i - 1];
        const next = toks[i + 1];
        const savedBetween =
          prev?.kind === "word" &&
          next?.kind === "word" &&
          isHL(prev.idx) &&
          isHL(next.idx);
        const searchBetween =
          prev?.kind === "word" &&
          next?.kind === "word" &&
          isSearchHL(prev.idx) &&
          isSearchHL(next.idx);
        const spaceBg = savedBetween
          ? "var(--color-highlight-amber)"
          : searchBetween
            ? "var(--color-search-highlight)"
            : undefined;
        return (
          <span
            key={i}
            style={spaceBg ? { backgroundColor: spaceBg } : undefined}
          >
            {t.text}
          </span>
        );
      }
      const cls = cn(
        t.strong && "font-semibold",
        t.em && "italic",
        t.code && "rounded bg-surface-gray px-1 py-0.5 text-xs",
        !insideLink &&
          t.linkHref &&
          "text-blue-600 underline underline-offset-2",
      );
      // Saved highlights (amber) win over the temporary search highlight (#FDE68A).
      const savedHL = isHL(t.idx);
      const searchHL = isSearchHL(t.idx);
      const isFirstSearchHit = searchHL && !firstSearchMatchAssigned;
      if (isFirstSearchHit) firstSearchMatchAssigned = true;
      const bg = savedHL
        ? "var(--color-highlight-amber)"
        : searchHL
          ? "var(--color-search-highlight)"
          : undefined;
      return (
        <span
          key={i}
          ref={isFirstSearchHit ? firstMatchRef : undefined}
          data-block-key={blockKey}
          data-word-index={t.idx}
          data-search-match={searchHL ? "" : undefined}
          className={cls || undefined}
          style={bg ? { backgroundColor: bg } : undefined}
        >
          {t.text}
        </span>
      );
    };

    // Group consecutive tokens that share a link into a single <a>; render
    // everything else inline.
    const children: ReactNode[] = [];
    let i = 0;
    while (i < toks.length) {
      const href = linkAt(i);
      if (href) {
        const start = i;
        const group: ReactNode[] = [];
        while (i < toks.length && linkAt(i) === href) {
          group.push(renderTok(toks[i], i, true));
          i++;
        }
        children.push(
          <a
            key={`a-${start}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline underline-offset-2"
          >
            {group}
          </a>,
        );
      } else {
        children.push(renderTok(toks[i], i, false));
        i++;
      }
    }

    switch (block.style) {
      case "h2":
        return (
          <h2
            key={blockKey}
            className="mt-6 text-lg font-semibold text-ink-secondary"
          >
            {children}
          </h2>
        );
      case "h3":
        return (
          <h3
            key={blockKey}
            className="mt-4 text-base font-semibold text-ink-secondary"
          >
            {children}
          </h3>
        );
      case "h4":
        return (
          <h4
            key={blockKey}
            className="mt-3 text-sm font-semibold text-ink-secondary"
          >
            {children}
          </h4>
        );
      case "blockquote":
        return (
          <blockquote
            key={blockKey}
            className="border-s-2 border-border-card ps-4 text-sm italic text-ink-muted"
          >
            {children}
          </blockquote>
        );
      default:
        return (
          <p
            key={blockKey}
            className="text-sm leading-relaxed text-ink-secondary"
          >
            {children}
          </p>
        );
    }
  }

  return (
    <>
      <div
        ref={containerRef}
        onMouseUp={handleMouseUp}
        className={cn("space-y-3", className)}
      >
        {segments.map((seg, i) =>
          seg.type === "sel" ? (
            renderSelectableBlock(seg.block)
          ) : (
            <PortableTextRenderer key={`d-${i}`} value={seg.blocks} />
          ),
        )}
      </div>
      {selection && (
        <SelectionActionBubble
          x={selection.x}
          y={selection.y}
          canRemove={selection.canRemove}
          onHighlight={onHighlight}
          onRemove={onRemove}
          onAskAI={onAsk}
        />
      )}
    </>
  );
}
