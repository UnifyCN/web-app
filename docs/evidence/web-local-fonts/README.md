# Self-hosted fonts: the build makes no Google Fonts request

Candidate for independent review. This note gives no acceptance or release claim.

Base: `feat/companion-actions-359` at `02377a331cd384f2eb6638d7e952a1a5630821e0`
(tree `bad74eb12922d5f7b6825dfa3f0d3c4dd09349d4`). The remote branch tip was
read again before the commit and had not moved. No #364 or #366 change is in this branch.

## Change

`app/layout.tsx` no longer calls `next/font/google`. The same 18 font files
are in `app/fonts/`. `app/fonts/fonts.css` declares the same 51 `@font-face`
rules, 4 fallback faces and 4 `--font-*` variables. `app/fonts/preload.ts`
preloads the same 5 files with `react-dom` `preload()`. The bundler emits each
file once to `/_next/static/media/<name>.<content hash>.woff2`. The content
hash parts are equal to the ones the original build used.

`app/fonts/sources.json` holds the source URL, size and SHA-256 of each file.
It also holds the reference faces, fallbacks, variables and preload set.
`app/fonts/fonts.test.ts` checks `fonts.css`, `preload.ts`, the files, the
licenses and the layout against that reference. `scripts/verify-local-fonts.mjs`
is the browser check below. No package, lockfile, config, CI or test limit changed.

`next/font/local` was not used. Its loader (`validate-local-font-function-call.js`,
`loader.js`) accepts only `path`, `weight` and `style` for each source. Its
`declarations` apply to every face. It cannot give a different `unicode-range`
to each subset file. It also computes new fallback metrics from the file,
not the values next/font/google used.

## Sources and licenses

| Family | Files | Version (name table) | License |
| --- | --- | --- | --- |
| Inter | 7 subsets, `wght` 100-900 | 4.001;git-66647c0bb | OFL 1.1, `OFL-Inter.txt` |
| Noto Sans Devanagari | 3 subsets, `wght` 100-900 | 2.006 | OFL 1.1, `OFL-NotoSansDevanagari.txt` |
| Noto Sans Arabic | 5 subsets, `wght` 100-900 | 2.012 | OFL 1.1, `OFL-NotoSansArabic.txt` |
| Noto Sans Gurmukhi | 3 subsets, `wght` 100-900 | 2.004 | OFL 1.1, `OFL-NotoSansGurmukhi.txt` |

- The 18 URLs are the unique URLs in the four Google css2 responses that the
  diagnosis captured at 2026-10-27T21:35:34Z (51 URL occurrences).
  `assets/download-records.json`: 18 of 18 HTTP 200, `font/woff2`, size equal to
  `Content-Length`, `wOF2` signature, SHA-256 recorded.
- `assets/font-metadata.json`: family name, version, copyright and license URL
  from each file's name table. All seven Inter binaries report copyright 2016;
  the pinned `OFL-Inter.txt` reports 2020. The files match their official sources,
  and the original notices remain unchanged.
- License files: `google/fonts` at commit `ddf386ba1b9fbc6b2c818f1ddcd9148f54ced94b`
  (`assets/google-fonts-commit.txt`), `ofl/<family>/OFL.txt`, byte-equal to `main`
  at download time. `METADATA.pb` for each family gives `license: "OFL"`.
- 15 of 18 files are byte-equal to the files today's normal baseline build
  emitted (`output/original-today-media-sha256.txt`).

### Devanagari version drift (decision for review)

At 21:35Z Google returned Noto Sans Devanagari `v30` URLs. At 21:53Z the same
request returned `v33` URLs (`assets/devanagari-css-today.css`). Only the
3 Devanagari URLs and bytes changed; every descriptor and range is equal.
Today's baseline build emitted the `v33` bytes
(`assets/devanagari-v33-today-sha256.txt` matches 3 baseline files).

This candidate pins `v30`, as the brief requires (the captured records). The
`v30` files have the content hash parts that the diagnosis's normal build
emitted (`0z52yf238t5rz` and the two others), so they are the bytes that build
used. Which version production serves now is not known. A change to `v33` is
3 files plus 3 `sources.json` entries. In the browser check below, `v30` and
`v33` gave equal text size and glyph counts for every Hindi and Punjabi case.
The live response changing between two requests 18 minutes apart is a
further reason to pin the files.

## Network-blocked builds (red and green)

Blocker (`tools/run.py --blocked`): `sandbox-exec` with `tools/deny-remote.sb`
denies every outbound connection except loopback. `HTTP(S)_PROXY` points at
`tools/proxy.mjs` on port 3126, which logs and answers 403 to every request.
Kernel denials come from the unified log (the kernel merges repeated reports,
so the count is a lower bound). Each build started without `.next`.

| Run | Source | Exit | Seconds | Requests |
| --- | --- | --- | --- | --- |
| `baseline-normal-build` | baseline, network on | 0 | 12.4 | not observed |
| `red-baseline-blocked-build` | baseline | **1** | 5.2 | 4 x `CONNECT fonts.googleapis.com:443` -> 403 |
| `green-candidate-blocked-build` | candidate | **0** | 11.7 | 0 proxied; 1 kernel denial report (3 merged) to `*:443` |
| `diag-candidate-blocked-node-env-proxy` | candidate, `NODE_USE_ENV_PROXY=1` | 0 | 11.4 | 2 x `CONNECT o1.ingest.sentry.io:443` -> 403 |
| `final-candidate-normal-build` | candidate, network on | 0 | 11.3 | not observed |
| `final-candidate-blocked-build` | candidate | 0 | 11.1 | 0 proxied; 1 kernel denial report (3 merged) |

- Red: the log has `Failed to fetch` once for each of the 4 families. The
  native loader honours the proxy, so the blocker sees and rejects it.
  The red record's `sandbox_network_denials` line is the `log show` command
  itself (filter fixed after that run); it is not a denial.
- Green: no font host was contacted. The one direct `node` attempt is the
  Sentry build plugin's telemetry (`o1.ingest.sentry.io`), shown by the
  diagnostic run that sends Node's own fetch through the proxy. It is rejected
  and the build passes. The baseline has the same Sentry configuration.

### Diagnosis fixtures on the candidate (controlled, separate from the product builds)

Same blocker, `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` set to each diagnosis fixture:
`control`, `extensionless-ampersand`, `extensionless-no-ampersand`,
`suffix-ampersand`, `plain-extensionless`. All 5 exit 0 with 0 proxied
requests. At the baseline the diagnosis recorded 1 pass and 4 failures for
the same files. The candidate does not read Google CSS, so no response shape
can reach the loader.

## Build output compared with the original (`output/compare-result.json`)

References: the diagnosis's normal build CSS and manifest (`v30`, 21:35Z)
and today's normal baseline build (`v33`).

- `@font-face` with a file: 51 = 51. Against the `v30` build: 0 differences
  in family, style, weight, stretch, display, `unicode-range`, order or file
  content hash. Against today's build: 12 differences, all Devanagari faces,
  file hash only (`v30` against `v33`).
- Fallback faces: 4 = 4, 0 differences in `local(Arial)`, ascent, descent,
  line-gap and `size-adjust`.
- Variables: equal values in equal order. The original sets them with 4
  classes on `<html>`, the candidate on `:root`. The other `<html>` classes
  (`h-full antialiased`), `lang`, `dir` and the motion `style` are equal.
- All CSS outside the font rules: byte-equal after blank-line normalisation.
  Font rules come before the Tailwind layers in both.
- Preload (`/welcome` `Link` header, `next start`): the 5 candidate preloads
  have the content hashes of the `v30` manifest preload set, with equal
  `as="font"; crossorigin=""; type="font/woff2"`.
- Font responses: 18 of 18 `200`, `font/woff2`,
  `Cache-Control: public, max-age=31536000, immutable`.

Two head differences, from Next 16.2.6 `crates/next-api/src/font.rs`
(`tools/next-v16.2.6-crates-next-api-src-font.rs`):

1. The candidate also sends `</>; rel=preconnect; crossorigin=""`. Turbopack
   adds a page to the font manifest when the page has any font file. It lists
   for preload only files with `.p.` in the name. A page with fonts and no
   listed preload gets this same-origin preconnect. It opens no new host.
2. `<meta name="next-size-adjust">` is present in both. In the candidate it
   comes from the same file heuristic (any font path with `-s`, here
   `noto-sans-...`). No client code reads it in Next 16.2.6.

## Rendered text in headless Chromium (`browser/`)

`scripts/verify-local-fonts.mjs` serves each build's real CSS chunk and font
files, renders the Companion welcome title plus the tab labels from each
locale file (en, fr-CA, es, vi, hi, ar RTL, pa) at 400/500/600/700, and en also
at 100 and 900. Each case uses a new browser context. Chromium reports the font
of each glyph (`CSS.getPlatformFontsForNode`). Mode `stack` uses the app's
`font-sans`. Mode `direct` uses only the language's own family.

| Run | Cases | Failed | Compared | Differing |
| --- | --- | --- | --- | --- |
| original today, candidate, original `v30` | 180 | 0 | 120 | 24 |
| original `v30`, candidate | 120 | 0 | 60 | 0 |
| candidate only (default) | 60 | 0 | 0 | 0 |

All 24 differences are the requested Devanagari file (`v33` against `v30`) in
hi and pa cases. Text width, height and glyph counts per font are equal in all
120 comparisons. Inter width at 100/400/900: 1539.36 / 1612.78 / 1700.81 px in
all three builds.

Negative controls (candidate, one file aborted):

| Aborted file | Exit | Failed cases |
| --- | --- | --- |
| `noto-sans-devanagari-devanagari` | 1 | 12: direct hi x4, stack hi x4, stack pa x4 |
| `noto-sans-arabic-arabic` | 1 | 4: direct ar x4 |
| `noto-sans-gurmukhi-gurmukhi` | 1 | 8: direct pa x4, stack pa x4 |
| `inter-latin` | 1 | 60 of 60 |

Stack pa fails without the Devanagari file because the danda `।` (U+0964)
is in the Devanagari range, so Noto Sans Devanagari draws it. The original
does the same.

### Existing Arabic behavior, kept and not fixed

In both the original and the candidate, Arial draws the Arabic glyphs in the
app stack (89 glyphs, Noto Sans Arabic 0). The chain is `"Inter", "Inter Fallback",
"Noto Sans Devanagari", ...`. `Inter Fallback` is `local(Arial)` with no
`unicode-range`, and Arial on macOS (and Windows) has Arabic glyphs. So the
Arabic file is preloaded but does not draw text on those systems. That is why
stack ar cannot fail when the Arabic file is aborted; direct ar does fail. This
change keeps that behavior because the scope is preservation. A fix (for
example a `unicode-range` on the fallback faces) is a separate visual change.

## Original implementation gates

- `npm test`: 53 files, 635 tests passed (`gates/npm-test.log`).
- `app/fonts/fonts.test.ts`: the first run failed during module setup
  (`fonts.css` missing, `gates/red-unit-test.log`) and ran zero tests. It is not
  assertion-level red evidence. After the implementation, 7 of 7 passed.
- `npx tsc --noEmit`: exit 0. Focused product/verifier lint exited 0. That check
  did not cover the added inspection script under `docs/evidence/`.
- The retained `npm run lint` log reports 12 errors, all `no-explicit-any` in
  three files this change does not touch:
  `supabase/probes/companion-context-362/context_rls_test.ts`,
  `supabase/tests/companion-actions/rollback_test.ts`,
  `supabase/tests/companion-actions/support.ts` (`gates/lint.log`).
- Independent review of the final original commit `1c704c1f` found 15 errors:
  those 12 plus three import errors in the added `inspect-fonts.cjs`. The earlier
  lint log did not qualify that final tree.
- `npm run build`, network on: exit 0. With the blocker: exit 0.

## Review corrections

The inspection entrypoint is now `tools/inspect-fonts.mjs`. It has zero focused
lint errors and produces the same metadata bytes for all 18 fonts as the original
script. Full lint reports 12 errors in the same three unchanged Supabase files.
The final tree adds no lint error. Current `npm test` passes 635 tests in 53 files,
and the normal production build exits 0. See `corrections-r1/README.md` for exact
commands, raw logs, counts, source equality and proof limits.

## What each part proves

- Blocked builds: the uncorrected loader contacts Google and fails when it
  cannot; the candidate builds with no font request. They do not prove a
  hosted (Vercel) build.
- Unit test: the source files equal the captured reference. It does not run
  the bundler.
- Output comparison: the bundler output keeps every descriptor, range, file,
  fallback metric, variable and preload of the original, and the files are
  served as immutable. It reads one route's headers (`/welcome`).
- Browser check: each script reaches its file and the files hold the glyphs;
  the text sizes are equal. Chromium on macOS only, with `Arial` present. No
  Safari, Firefox, Windows, Linux, Android, iOS, screen reader, preload timing
  or authenticated page was checked. No native device or hosted deployment
  was used.

## Limits

- The two earlier failing candidate builds did not save their Google CSS. This
  note does not prove which response shape they received. It shows only that
  the candidate no longer reads that response.
- The `v30` bytes come from Google today. Their equality with the diagnosis
  build rests on Turbopack's content hash parts, not on saved binaries.
- `CLAUDE.md` line 446 and `design-system/MASTER.md` line 121 still say Inter
  loads through `next/font/google`. They are instruction files and were not edited.

`tools/` holds the runner, blocker, comparison and download scripts used. They
use absolute paths of the review checkout.
