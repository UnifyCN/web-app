"use client";

import { useIsRtl } from "@/hooks/useDirection";

/** Hebrew, Arabic and related right-to-left script blocks. */
const RTL_SCRIPT = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

/**
 * Runs that must read left-to-right even inside RTL text: phone numbers
 * ("604-597-0205" would otherwise reorder to "0205-597-604"), emails and URLs.
 */
const LTR_RUN =
  /(\+?\d[\d\s().-]{5,}\d|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|https?:\/\/\S+)/g;

/** Splits RTL text so each LTR run is its own isolate. */
function withLtrRuns(text: string) {
  return text.split(LTR_RUN).map((part, i) =>
    i % 2 === 1 ? (
      <bdi key={i} dir="ltr">
        {part}
      </bdi>
    ) : (
      part
    ),
  );
}

/**
 * Isolates partner copy so its direction can't scramble the surrounding line.
 *
 * `dir="auto"` alone picks the direction from the first strong character, and
 * mobile's Arabic copy often opens with an English name ("DIVERSEcity …
 * جمعية"), which flips a whole Arabic paragraph to LTR. So in an RTL UI,
 * text containing RTL script is RTL, with phone numbers / emails / URLs kept
 * LTR inside it; purely Latin text (an untranslated name or fallback) is left
 * to `auto`, which keeps its punctuation LTR.
 */
export function Bidi({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const rtlUi = useIsRtl();
  const rtl = rtlUi && RTL_SCRIPT.test(children);
  return (
    <bdi dir={rtl ? "rtl" : "auto"} className={className}>
      {rtl ? withLtrRuns(children) : children}
    </bdi>
  );
}
