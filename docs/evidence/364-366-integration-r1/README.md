# #364 + #366 integration (r1)

The paired mobile record is DOCS/companion-actions/364-366-integration.md with evidence in
DOCS/companion-actions/evidence/364-366-integration-r1/ (compressed logs, size/SHA-256 manifest).

Web merges accepted #366 0f6b8209 into approved #364 a914019c. Functional deltas beyond the
union of both sides: rag-query extracts plan, then task, then step suggestions from one
answer; test support applies 361, 363, 364, 366 and rolls back in reverse. One mounted
composition case was added after the merge. Service suite 154 passed (19 files), rag-query
226, mounted plans 9, npm test 677 passed (9 skipped), build/types/parity/changed lint exit 0.
Full lint: 23 errors (#366's 21 plus two #364 test-file diagnostics), not changed.
Not integrated; fresh scoped review required.

Root follow-up: `../364-366-test-quality-root-r1/README.md` records eleven test
type corrections and the initial-frame test timing correction. Full lint now
reports the twelve earlier errors. The four backend tests compile to the same
JavaScript. Web tests (677 pass, nine skipped), build, types and parity pass.
