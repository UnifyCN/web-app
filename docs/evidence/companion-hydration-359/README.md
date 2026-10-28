# Companion online-state hydration correction

Status: implemented. Independent review and full-page browser proof remain required.

The local base is `21df0701f12f99b5d1dd8af246fa4b5f8acb41ae`.
The branch is `fix/companion-online-hydration-359`.
The composition review named the prior defect H359-1. It reproduced on the accepted
base and on the saved-details composition. This correction does not accept #370.

## Failure and correction

The server can expose `navigator` without `navigator.onLine`. The old initializer
treated that value as offline. The first browser render treated the connection as
online. The real task entry therefore produced different server and browser text.
React reported a hydration mismatch and replaced the rendered tree.

`useOnline` now uses `useSyncExternalStore`. Its server snapshot and hydration
snapshot both return true. The client snapshot then reads the current browser
value. The existing online and offline events update the same subscription.
See the [React reference](https://react.dev/reference/react/useSyncExternalStore#adding-support-for-server-rendering).
No task write, account check, database schema, design, translation or dependency changed.

## Binding proof

Falsifier: the real task entry reports a hydration error, replaces the input,
loses its draft or focus, or fails to respond to a connection event.

The test uses the actual task entry, task-progress hook and account hook. Only the
external session client is controlled. Its pending session represents a hard
navigation while authentication has not resolved. A real server render precedes
hydration. The test checks input identity, value, focus, connection events and the
recoverable-error callback.

The first online case was written before the correction. The offline case and
event controls were added after it. They are regression checks, not a claim that
every added assertion preceded implementation.

| Record | Observed result |
| --- | --- |
| `red-hydration.log` | One assertion failure on the unchanged source. React reported the task-entry mismatch. |
| `red-hydration-locked.log` | The same failure after `npm ci` installed the committed lockfile. |
| `green-hydration.log` | Initial online case passed. |
| `green-focused.log` | 21 tests passed in two files. These include two hydration cases and 19 task-action cases. |
| `full-web-tests.log` | 687 passed and nine skipped. The command exited with code zero. |
| `production-build-final-result.json` | The final production build exited with code zero. |

The first installed React Query version was 5.104.5. The lockfile installs 5.100.10.
The binding red and final checks use the locked version. React and React DOM are
19.2.4. Neither manifest nor lockfile changed.

The root also observed zero exits from TypeScript, changed-file ESLint and the
translation-key check. ESLint reported no remaining warning in the two code files.
The earlier full-lint baseline has twelve mapped errors. This record does not
claim that full lint passes.

## Proof limits

The new tests use jsdom. They prove the real component's server-to-client transition
with a controlled session. They do not prove a full Next.js cold navigation, a
browser accessibility tree, real session ordering or hosted access. The prior
review's browser reproduction remains supplied evidence of the original defect.
Independent review must check the corrected cold-navigation case before integration.
Existing jsdom navigation errors remain visible in the full-test log. They are not
new test failures or evidence of a clean browser console.

No database, local service, browser server, native simulator or hosted service ran
for this root correction. All child resources remain separate.
