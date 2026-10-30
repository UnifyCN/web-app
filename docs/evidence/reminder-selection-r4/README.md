R368-SPEC-4 is corrected. These are review candidates. No ticket or native acceptance is granted.

The web task drawer, Companion page and Checklist page now keep their local state within the actual Auth generation. An account change or either batched reset remounts that state. A same-account token refresh keeps it. This clears the selected task, retained title, return target and open review state together. The two production parents also clear their incoming selection and proposal props. A removed task still keeps its receipt within the same session.

Companion no longer waits for a profile ID to decide which account owns its page. Its welcome content uses a profile only when its ID matches Auth. The shared legacy current-user key keeps its existing value and hook re-export. It moves to a pure module so the private cleanup policy can cancel and remove it on a full account reset. The kept-account cleanup path leaves it alone. No profile service, request, SQL, migration, locale, style, dependency or endpoint changed.

The new page boundaries exposed an initial-load focus defect. The generation hook previously returned zero while Auth was pending, even when an earlier generation existed. Resolving the first session then remounted the page. It now reads the generation from the existing external-store subscription. Its server snapshot stays zero. The pending session preserves the input DOM node and focus.

Falsifiers: a private title or open account-owned view after reset; loss of selection, date or input focus on refresh/initial load; a stale profile in Companion; loss of a same-session removal receipt; changed service inputs or mirrors; or a test that cannot detect its deliberate fault.

Test order and limits:

- The exact R4 reviewer source is saved as reviewer-original.test.tsx.txt. The executable copy changes only its observer output path. Before the fix, account replacement fails at the private heading assertion and refresh passes. The later exact two-case copy passes. Its temporary executable is removed. These two cases also overlap the permanent cases.
- The first page correction passed replacement but the reviewer refresh case could not select a task during first-session remount. This setup failure is preserved in reviewer-green. A permanent initial-read case then proved input identity loss at an assertion. Its first driver made a fresh held promise on each read and never settled. The corrected driver reuses one promise. That run fails at input identity before the generation fix and passes after it.
- The direct drawer case fails before its own boundary is added. Checklist and profile-cache cases fail before their fixes. The expanded final nine-case file has seven assertion failures and two controls on unchanged 660e9ca8. The extra batched and late-profile cases were written after their code. They are regression evidence, not test-first evidence.
- Six final deliberate faults each fail at assertions: retain drawer selection, retain the Companion view, retain the Checklist view, omit profile cleanup, omit the profile owner check, or return zero during a pending session. The first profile mutation survived an early test. The revised case waits for a real profile observer to render the late value. An incomplete onboarding fixture first crashed the view. A non-reactive observer then remained on the removed query. Both driver failures remain. A session-owned observer and complete relevant fixture arrays now reach the intended private-name assertion. All source files are restored byte for byte after the campaign.
- Two removed-receipt fixture tests needed explicit account-hook stubs. The old sign-out test now reopens the Checklist controls after signing in, because reset closes them. No existing assertion changed. The first selected/full runs retain the missing-mock and missing-provider failures.

Final results:

- Web: 754 passed, 13 skipped, 71 files. The new file has nine passes. Normal TypeScript, translation parity, changed-file lint and build pass. Processes exit naturally. Full lint still has twelve errors in the same three baseline files, distributed 7/1/4. Their bytes are unchanged.
- Browser: 50 existing context/drawer checks pass. The first browser run overlapped the source-mutation campaign. That record is preserved as source-overlap and is not used as final proof. The final run starts after exact source restoration and passes. This harness uses actual page components with substituted data hooks. It does not prove real Auth or Next.js cold loading.
- Mounted ownership: actual pages, Auth hooks, query cache, drawer, panel and editor execute. The SDK, profile/Checklist/conversation services and action endpoint are scripted. These tests prove the rendered state under the scripted events. They do not prove real provider timing, RLS or a hosted session.
- Preservation: all 163 executed service inputs remain exact (140 web, 23 mobile). All 21 mirrors match, including 16 SQL pairs. Mobile 19c2d0d6 is unchanged and clean. Prior service/Cron/race/rollback proof and bounded native review remain supplied evidence. No fresh service or native run occurred.

The new late-profile case injects a cache result to check the rendered caller guard. It does not model an actual provider read or add owner checks to legacy non-Companion profile writers.

Raw command output and JSON are compressed without loss. compressed-records.json records each original byte count and SHA-256. final-recount.json contains counts from the final machine-filtered sets. Earlier failed records remain. Ignored dependencies and build caches remain. The browser server is stopped and port 3432 is free. No Docker, simulator, device, hosted, provider, push, PR, issue or integration action occurred.

COMPANION_REMINDER_368_SELECTION_CORRECTION_R4_DONE
