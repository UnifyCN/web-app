# Falsifiers recorded before each check

1. Baseline normal build (network allowed): exit != 0 would mean the baseline itself is broken now; the comparison base would be invalid.
2. Red build (baseline, blocked): exit 0, or no proxy request / sandbox denial naming a Google font host or port 443, disproves that the blocker observes and rejects the uncorrected loader.
3. Binding unit test before implementation: if it passes on the unchanged baseline, it does not bind the change.
4. Asset download: any status != 200, wrong content type, missing wOF2 magic, or SHA-256 differing from the baseline build's emitted file disproves "same font bytes".
5. Green build (candidate, blocked, same condition): exit != 0, or any proxy request / sandbox denial, disproves independence from Google.
6. Descriptor manifest: any difference in family, style, weight, stretch, display, unicode-range, file bytes, fallback metrics, variable values/order, or preload set disproves equivalence.
7. Diagnostic fixture matrix on candidate: any nonzero exit disproves that the candidate no longer depends on Google CSS shape.
8. Browser check: any expected face not loaded from the local asset, any glyph reported missing, or metric difference > 0.01px versus baseline disproves rendering equivalence. Negative control: with one script asset removed the check must FAIL; a pass there disproves the check's sensitivity.
