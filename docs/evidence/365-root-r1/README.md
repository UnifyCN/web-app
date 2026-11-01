# Partial #365 root corrections

The command card now takes current, undoable and undoneBy from a refreshed receipt only when its operation identity matches. It keeps the original saved values.

The mounted history test failed before this change. All six mounted task-edit tests now pass. Types and changed-file lint exit 0. Full proof is in the mobile repo at DOCS/companion-actions/evidence/365-root-r1.

The five content-fixture configuration lines from accepted #366 are restored. A fresh local-stack run is still required. Compound command handling and waiting-reason receipts remain open. No acceptance is claimed.
