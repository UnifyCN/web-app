# C1: wait for the step RPC to leave the cache

This root correction follows the combined review round 1. Its base is
`66575de13cf881f8efa4394c7101d99869fd6624`. Mobile stays at `e30c1902`.
No candidate is integrated or accepted by this record.

The helper for the #366 rollback used the general plan setup cache state.
That state correctly permits installed steps. It could therefore return before
the rollback reached the API cache. The helper now uses separate rollback
states. They require the step RPC to be absent and require the expected plan
schema to stay present or absent. General plan setup keeps its earlier rule.
Only test support, a regression case and this evidence change. Product code,
SQL, migration identities, dependencies and configuration stay unchanged.

## Checks

- A permanent regression calls the actual migration helper. It supplies the
  stale API schema first and the fresh schema next. Before the fix it fails
  at the intended assertion: rollback returned while the step RPC remained.
  The plan setup control passes with installed steps. After the fix both pass.
- On the owned local database, the step rollback file has two passing cases.
  The plan rollback file has three passing cases, including one cleanup.
  Both files exit zero naturally. This is five checks, not five behavior paths.
- Four controlled-cache cases pass. Both rollback states reject a constant
  stale step RPC and accept the correct step-free cache. These use fixture
  keys, make no SQL query and make no outbound HTTP request. They were added
  after the fix. The reviewer's original up364 rejection expectation is
  superseded by the explicit rollback states; it did not pass unchanged.
- Deno checks both changed files with exit zero. The changed rollback test
  passes lint. Full lint remains exit one: twelve earlier errors, zero warnings.
  No lint rule changes. Source line numbers after the helper can shift.

The first temporary cache-control run failed a Deno timer sanitizer check.
Its behavior assertions passed. The failed record is kept. The later run
explicitly finishes the imported auth fixture initialization before these
cache-only checks. All four then pass with the sanitizer enabled. No product
failure or mutation sensitivity is claimed from that first failure.

## Proof limits and cleanup

Migration helper: these runs prove stale-cache rejection and local migration
recovery through the tested helper. They do not measure hosted cache timing.
Product service: no product code or SQL changed. The prior composition and
round-1 independent results remain prior evidence. Full web unit/build gates
were not repeated for this test-only correction. Their last root results are
in the preceding test-quality record at `66575de1`.

The earlier four-file JavaScript equality result belongs to `66575de1`.
This C1 correction intentionally changes executable test-helper code.

The isolated project was `unify-root-cache-c1`, on ports 61431-61434 and 3196.
The container project and workdir labels were checked before operations.
Only that project was stopped. No owned container or volume remains. All five
ports are free. The copied workdir and temporary probe are removed. Tracked
configuration is byte-identical. No hosted operation, deploy, paid provider,
live model, device, browser or child ran for this correction.

The manifest records every compressed artifact's size and hash. Environment
files and key material are excluded. CLI 2.118.0 help and current official
changelog/docs were read. No CLI upgrade was made.
