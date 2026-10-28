# Combined plan and step test corrections

This is a root correction after the #364/#366 composition handoff. The base is
`f1e4f93bb0c9d2a472475b26da48dcd7e82e8799`. Mobile remains at
`e30c1902280f3b127ff6231358d4d6883686b748`. Neither candidate is integrated.

## Changes

- Four backend test files use explicit types. The transaction uses the existing
  postgres package type. Public step records and stored rows have separate types.
  No assertion, SQL statement or executable backend test code changes.
- The web Reveal test reads its initial style in the same turn as the click.
  Its earlier asynchronous query could yield to an animation frame. The pointer
  assertion still requires opacity zero. The keyboard assertion still requires
  visible content. No product component or animation changes.

The check would reject this correction if normalized backend test JavaScript
changed, a type check failed, or either Reveal assertion failed.

## Observed checks

| Check | Result | Limit |
| --- | --- | --- |
| Full lint before | Exit 1, 23 errors | Original composition candidate |
| Full lint after | Exit 1, 12 errors, zero warnings | The same twelve earlier diagnostics remain |
| Changed-file lint | Exit 0 | Four files without prior errors; support retains four earlier diagnostics |
| Deno check, four backend files | Exit 0 before and after | Deno 2.7.14, not a new CI run |
| Backend test JavaScript comparison | All four files equal | TypeScript 5.9.3 ES2022/ESNext, comments removed; esbuild 0.25.12 whitespace normalization only |
| Reveal pointer and keyboard cases | Two pass in each of six runs | Same two cases repeated; do not sum them as unique tests |
| Full web tests | 677 pass, nine skipped, 57 files, exit 0 | Includes scripted clients; local-stack tests skip without their environment |
| Web build | Exit 0, 41 static pages generated | No hosted build |
| TypeScript and locale parity | Exit 0 | No runtime or translation quality claim |

The eleven removed diagnostics are seven in steps_parent_race_test.ts, two in
support.ts and one in each of the two plan review tests. No lint rule, ignore,
package, lockfile, migration, SQL, service, font or product component changes.
The remaining diagnostics match the original written list by file, rule and line:
seven in context_rls_test.ts, one in rollback_test.ts and four in support.ts.

The first type edit exposed three possibly-undefined parent accesses in a test.
That failed check is kept. Non-null type assertions preserve the earlier runtime
accesses. The final Deno check passes. This was a test correction, not new feature
TDD. The earlier composition record keeps the original animation failures.

## Evidence and proof classes

`manifest.json` names every compressed record and its raw and compressed hash.
`source-pins.json` proves each saved before-file matches git at the stated base.
`runtime-equality.json` records equal complete normalized output hashes.
`web-test.json.gz` contains the full machine-readable test distribution.

Backend: this correction proves type checking and equal executable test output.
It does not add a database execution. The composition worker's 154 local service
checks remain supplied evidence. The unchanged service and SQL are not re-tested
by the JavaScript comparison.

Web: these runs prove the rendered scripted-client assertions, the corrected
initial-frame observation, type checking and a local build. They do not prove
hosted authorization, native behavior, a live provider or an observed screen
reader. The unchanged mobile candidate retains its earlier evidence only.

No server, database stack, hosted operation or child ran for this correction.
All commands ended normally. Ignored dependencies and local build output remain
in the owned checkout. The records exclude environment files and credentials.
