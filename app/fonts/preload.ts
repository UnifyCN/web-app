import { preload } from "react-dom";
import interLatin from "./inter-latin.woff2";
import interVietnamese from "./inter-vietnamese.woff2";
import notoDevanagari from "./noto-sans-devanagari-devanagari.woff2";
import notoArabic from "./noto-sans-arabic-arabic.woff2";
import notoGurmukhi from "./noto-sans-gurmukhi-gurmukhi.woff2";

// The files next/font/google preloaded: Inter latin + vietnamese and the main
// subset of each script font. The other subsets load on demand through their
// unicode-range in fonts.css. The imports resolve to the same content-hashed
// /_next/static/media URLs that fonts.css points at.
const PRELOADED = [interLatin, interVietnamese, notoDevanagari, notoArabic, notoGurmukhi];

export function preloadFonts() {
  for (const href of PRELOADED) {
    preload(href, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  }
}
