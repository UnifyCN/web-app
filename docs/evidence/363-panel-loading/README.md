# Ticket363 draft panel loading correction

The web draft panel used the shared PhaseMessage helper. Its Saving and Checking text appeared before the required300ms delay. The cards already used the shared delay.

PhaseMessage now uses loading-delayed for saving and checking only. Its paragraph has a phase key. This starts a new delay when an unresolved save moves to result lookup. Stable results and recovery controls keep their immediate display. No mobile, server, schema, translation or approval logic changed.

## Verification

Before the source fix, the expanded existing browser check had30 passing assertions,4 timing failures and0 setup errors. The failures were Saving and Checking in each motion mode. After the fix, all34 assertions pass with0 errors. The check starts actual card and panel operations concurrently. A simultaneous control proves the CSS delay is active. It checks initial invisibility, later visibility, a new lookup delay, status-region presence and immediate receipt/refusal display. It uses the real components, store and CSS with synthetic Auth and transport adapters. It does not prove a native app, a real session, server authorization or persistence.

The full web unit suite passes628 tests in52 files. The web build passes. ESLint passes for both changed files. The existing i18n parity command passes. The logs and browser result JSON files are in this directory. Build and unit logs have trailing whitespace removed; assertions and exit results are unchanged. No mobile suite or broad mutation campaign was repeated for this web-only change.

The original reviewer fixture was adapted into the existing permanent browser script before the source fix. Product code was still at690072556ce9170d543464ff0b53404272f65c0c during the red run. No assertion was removed. The new assertions also check visibility after each delay. The two-line source change passed them on its first run.

## Remaining qualification

The prior Spec round2 report is INCOMPLETE because Docker setup did not reach a fresh database assertion. That is an infrastructure result, not a product failure. Independent public-boundary verification of the immutable historical receipt title and surrounding replay/Undo/rollback still gates ticket363 acceptance. Nothing in these browser or unit results supplies that proof. No hosted, device, screen-reader, Safari or live-provider result is claimed.
