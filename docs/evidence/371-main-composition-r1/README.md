# Profile changes with current Web main

This is a local merge candidate. It needs independent SPEC and STANDARDS review. It does not accept ticket 371 or spec 359.

## Inputs and intent

- Feature parent: `5b27d12c6c7b8d5e93343b24ff5f027d4fd4c02d`, the reviewed profile-recovery candidate already pushed to draft PR 192.
- Main parent: `1919db74ac8859775f571ba96140dd787c5b867e`, read from the live main branch and fetched by exact identity. The PR API still reported the older base `6f9ccc23ded236844ce1ca02f3ccd02e020fcec2`. A merge against that older base was clean. A merge against actual main found the Checklist conflict.
- Private worktree: `/Volumes/Lexar/Dev.noindex/t3-worktrees/Unify-Web-App/root-companion-profile371-main-composition`.
- Branch: `fix/companion-profile-main-composition-371`.

The merge keeps both parents. The only application file with a manual resolution is `services/checklist.ts`. Main adds computed arrival stages, a prompt for old profiles with no arrival date, province-aware content links, and unrelated accepted changes. The feature adds authoritative profile changes and Checklist province filtering. Neither rule can replace the other.

## Resolution

The profile select keeps `persona`, `arrival_date`, `stage`, and `province`. The Checklist stage comes from Main's `resolveProfileStage` and `checklistStage`. A usable date overrides a stale cached stage. A dateless old stage-0 profile stays on the pre-arrival track. A dateless unknown profile uses Main's default Checklist track.

The private content reader has one province parameter. Its caller passes the resolved province once. The automatic merge had repeated the parameter and argument; this resolution removes those repetitions.

Checklist rows retain the feature's province projection and filtering after the content read. The filter accepts scalar tags, lists, empty national tags, and recognized legacy aliases. It uses Main's shared visibility rule after tag normalization. Main's scalar-only GROQ predicate is omitted because it would remove list and alias rows before that rule runs. No new query syntax is introduced. Main's module and submodule province checks remain on Learn links. Explicit tab links retain their earlier priority.

All seven locale files retain independent feature additions and Main changes. A flattened-key comparison against the merge base and both parents found zero mismatches. `types/index.ts` keeps Main's nullable computed stage, province types, and Circles removal. It also keeps the feature's Companion context type.

The incoming embedding adapter is byte-identical to both Web main and published Mobile main `8aef964b01f644ca6433af23d7c031d4c1779d9c`. It differs from the frozen Mobile feature branch. It is accepted upstream code, with no manual adapter edit here. This record does not claim that all service files still match the earlier Mobile feature tree.

## Checks and results

The falsifiers are a stale cached stage winning over an arrival date, loss of an old dateless pre-arrival track, another province's row or Learn target being shown, or a profile refresh changing retained task progress. `services/checklist.profileComposition.test.ts` exercises those cases through the real `getTasks` function with scripted database and CMS responses.

| Check | Result |
| --- | --- |
| New composition file | 21 passed |
| Composition plus stage, prompt, and province files | 38 passed |
| Full Web suite | 825 passed, 13 skipped, 76 files; exit 0 |
| TypeScript, translation parity, changed-file ESLint | exit 0 |
| Production build | exit 0 |
| Edge entry/shared type checks | 22 files; exit 0 |
| Complete Edge fixture suite | 287 passed; exit 0 |
| Push worker frozen-lock type check | exit 0 from the actual application directory |
| Full ESLint | exit 1; 12 errors and 8 warnings in five files identical to the feature parent |

The counts overlap and must not be added. Logs and command records are in `raw-evidence.tar.gz`. `raw-evidence-manifest.json` records each included file's size and SHA-256.

The feature-parent control replaces only the Checklist source with the unchanged feature-parent version. Six selected assertions fail, including date-derived stages and province-aware Learn targets. Removing the composed province filter causes all 15 selected province assertions to fail. Both deliberate changes were restored to the exact saved source hash `2afe6a736e9b93577f862aef7b15afccf08317349139755bd634c47701082fd6`. These controls test the new assertions. They are not a claim that the tests preceded the merge resolution.

One worker check failed in the private Edge copy because its frozen lock records the application workspace dependencies. The corrected check runs from the actual application directory with local node modules disabled. It passes. The failed log remains. Package files and the worker lock remain unchanged.

The twelve full-lint errors and eight warnings are not new. Every affected file is byte-identical to the feature parent. The map is in the archive. No lint rule or test assertion was weakened.

## Proof limits and cleanup

The composition tests prove client selection and mapping for scripted rows. They do not execute GROQ against hosted Sanity or establish the published CMS data shape. The build and Edge fixtures do not prove hosted permissions, provider behavior, delivery, native input, or screen-reader behavior. No local service suite or native run was repeated for this merge. The profile migration and action code are unchanged; their earlier local service results remain supplied evidence. Main's updated adapter has fresh local transport fixtures, not fresh hosted qualification.

No Docker operation, app server, simulator, hosted write, provider send, deployment, or integration branch change was performed for this candidate. The owned dependency copy, build cache, and private Deno copy are retained. They are outside version control. Frozen source checkouts remain unchanged. Impeccable stays at 3.9.1. Native criterion 8, tickets 367-374, and release acceptance remain incomplete. Earlier bridge-identity failures remain unresolved.

HANDOFF: COMPANION_PROFILE_371_MAIN_COMPOSITION_REVIEW_READY
