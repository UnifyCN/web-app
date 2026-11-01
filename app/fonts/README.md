# Self-hosted fonts

The app used to load these faces with `next/font/google`, which downloads the
Google Fonts CSS during `next build`. That made every build depend on
Google's live response, and the font loader in Next 16.2.6 fails on some
response shapes (vercel/next.js#99114). The same files now ship in the repo,
so the build makes no font request.

- `fonts.css`: one `@font-face` per subset and weight, with the descriptors and
  `unicode-range` values of the Google response, the metric-matched `Arial`
  fallback faces next/font computed, and the `--font-*` variables that
  `--font-sans` in `app/globals.css` reads in this order:
  - Inter (variable, 100-900): Latin, Vietnamese and the other Inter subsets.
  - Noto Sans Devanagari (400-700): Hindi. Inter has no Devanagari.
  - Noto Sans Arabic (400-700): Arabic (RTL).
  - Noto Sans Gurmukhi (400-700): Punjabi.
- `preload.ts`: preloads the five files next/font preloaded (Inter latin and
  vietnamese, and the main subset of each script font). The bundler emits each
  file once under `/_next/static/media/` with a content hash, so it is cached
  as immutable.
- `sources.json`: the source URL, size and SHA-256 of each file, and the
  reference faces, fallbacks, variables and preload set that `fonts.test.ts`
  checks `fonts.css`, `preload.ts` and the files against.
- `OFL-*.txt`: each family is under the SIL Open Font License 1.1. The files
  come from the `google/fonts` repository at the commit in `sources.json`.

To update a font, download the new files from the URLs in a fresh css2
response (Chrome User-Agent, `display=swap`), then update the files,
`sources.json` and `fonts.css` together and run `npm test`.
