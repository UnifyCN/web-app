# Reminder Standards corrections R1

The root corrected 368-S1, 368-S2 and 368-S3 in the web reminder component. This is an implementation result. Independent review is still required. No ticket or release is accepted.

Checkout: `/Users/savargupta/.t3/worktrees/Unify-Web-App/fix-reminder-standards-368-r1-root`. Verified branch: `fix/reminder-standards-368-r1-root`. Base: `4a2834a51fd1d389e5ebf7d22e60ad588fe5fc2a`. The mobile candidate remains `157081d3d5b0aaca10b06f9b2456c504f4b9d5df`. The canonical candidates used by the running SPEC review remain unchanged. No shared contract, SQL, migration, rollback, translation, dependency or action request changed.

## Corrections and falsifiers

- 368-S1: Saving and Checking use the existing `loading-delayed` class. A phase key restarts the delay when Saving changes to Checking. A visible message before 300 ms, or a delayed recovery control, would fail the check. Pending, failed lookup and confirmed not-applied recovery remain immediate.
- 368-S2: Review preparation, cancellation preparation and Undo confirmation retain whether the user used the keyboard. Both actual shared Reveal instances receive that input method. A keyboard action with `instant=false`, or a pointer action forced instant, would fail the check. The flag survives the held preparation response.
- 368-S3: The nine gray utilities now use the approved `border-card`, `ink-secondary`, `ink-muted` and `surface-card` tokens. An unapproved utility or a wrong computed token color would fail the check. The existing design contract supplies all values.

The advisory duplication observation 368-H1 is unchanged. It is separate from the three written-rule findings.

## Results

| Check | Result | Proof boundary |
| --- | --- | --- |
| New presentation tests before the fix | 6 assertion failures, 6 controls pass | Real component and Reveal with controlled editor state |
| Focused tests after the fix | 19 pass in three files | Presentation plus existing reminder and navigation tests |
| Final browser script on the unchanged base component | 16 assertion failures, 22 controls pass | Same CSS and script; original component bytes from the fixed Git object |
| Final browser script on the corrected component | 38 pass, zero failures | Chromium, 390 pixels, normal and reduced motion |
| Full web suite | 732 pass, 13 skipped, 68 passing files | Natural exit 0 |
| TypeScript | Pass | A new test's HTMLElement typing was corrected before the final check |
| Production build | Pass | Natural exit 0; product and unit-test bytes match the tested final inputs |
| Changed-file lint | Pass | Component, new unit test and browser script |
| Full web lint | Failed, 12 prior errors | The affected source files match the base; no suppression or unrelated fix |

The unit tests were written first. The first run failed at the intended assertions. The three recovery controls and three pointer controls passed. A later test-only type correction changed a direct disabled-property read to an equivalent attribute check. The full suite includes that correction. The full suite and build ran after the product fix. Later browser-script changes do not enter the application or Vitest program.

The browser script uses the actual ReminderSection, shared Reveal and Tailwind CSS. Its editor is a controlled stand-in. It checks same-frame hidden loading text against a simultaneous positive delay control, then checks visible text after the delay. It drives Enter and pointer clicks in Chromium. The real Reveal wrapper records the resulting instant property. This proves input-method wiring. It does not prove screen-reader use or every painted animation frame. The script also checks immediate recovery, computed ink/border colors and narrow overflow. It blocks browser network requests. No database, service or provider was used.

The initial browser helper reused transitions between scenarios and encountered ambiguous controls. A selector change did not solve that helper problem. A diagnostic run recorded the extra controls. Each final gesture case now starts in a fresh page. All failed helper logs remain. One earlier ambiguous-control HTML/JSON snapshot was overwritten by the next diagnostic; the earlier failure log remains. These attempts count as helper failures, not product results. The final red and green runs use the same script bytes and positive controls.

## Design route and limits

The root used the `/design` direct route for a fixed bug in an existing system. The authoritative `design-system/MASTER.md` supplies the palette, loading rule and keyboard exception. Impeccable remains 3.9.1. Its context helper reported `NO_PRODUCT_MD`; the broader polish/init flow was not completed. No new product strategy, design contract or instruction file was invented. The fixed component screenshot was inspected for labels, spacing and narrow fit.

No real-service or Cron suite was repeated because the changes affect presentation only. The running independent SPEC review owns that boundary. Mobile native input, VoiceOver/TalkBack, hosted behavior, the actual Next.js shell and reminder observation/delivery remain outside this proof. Full web lint remains failed. No push, integration update, ticket change or acceptance occurred.

All root check sessions ended. Every Chromium instance closed. No server, container, simulator or Metro process was started. Installed dependencies and the build cache remain ignored in this checkout. The prior sources, reports, active native check and active SPEC review remain unchanged.

## Reproduction

```sh
npx vitest run components/companion/tasks/ReminderPresentation.test.tsx components/companion/tasks/Reminders.test.tsx components/companion/tasks/ReminderNavigation.test.tsx
node scripts/verify-companion-reminder-presentation.mjs
```

```sh
REMINDER_PRESENTATION_COMPONENT=docs/evidence/reminder-standards-corrections-r1/baseline-ReminderSection.txt REMINDER_PRESENTATION_OUT=docs/evidence/reminder-standards-corrections-r1/browser-red node scripts/verify-companion-reminder-presentation.mjs
```

The baseline command must exit 1. The default command must exit 0. `gate-summary.json` records the exact source and script hashes, result counts and failed baseline files. Raw logs and screenshots are retained beside this report.

COMPANION_REMINDER_368_STANDARDS_CORRECTIONS_R1_DONE
