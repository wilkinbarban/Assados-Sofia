# PR3B Static Boundary Evidence

## Acceptance Basis

This is the user-approved, artifact-only replacement for retrospective Git-delta
proof. It was refreshed from local file bytes only; no code, Git, service, network,
credential, staging, production, or other external operation occurred.

## Declared Owned-Path Manifest

The following paths are the declared PR3B-2 boundary for review and rollback. This
declaration describes the approved work unit; it is not a claim of historic or
Git-proven ownership.

- `scripts/audit-slice2-pr3b-boundary.sh`
- `tests/unit/slice2-pr3b-boundary-audit.test.ts`
- `openspec/changes/staging-slice2-receipt-pipeline/pr3b-boundary-evidence.md`

## Deterministic Current-Byte Manifest

Hash algorithm: SHA-256. Line algorithm: `wc -l`. The evidence output is excluded
from its own hash inputs so the manifest is not self-referential.

| Manifest input | SHA-256 | Current lines |
|---|---|---:|
| `scripts/audit-slice2-pr3b-boundary.sh` | `a636ae6429407352979ee79bfa73addaa7e2aeb145cad47fd241df050f6c8877` | 101 |
| `tests/unit/slice2-pr3b-boundary-audit.test.ts` | `c390622a5d2e601e14c85c501079176c1dd93fcfe3325eb1b3c9c1a0159343ad` | 65 |
| **Static current-input estimate** | — | **166** |

## Explicit Non-Git Limitation

No pre-change snapshot was supplied. This evidence intentionally does not invoke or
derive conclusions from Git. The 166-line figure is a current-input estimate, not a
historical changed-line count. These hashes identify current bytes only; they cannot
prove a Git delta, historic ownership, or the exact number of lines changed. No such
claim is made by task 3.1 under its amended acceptance criterion.

## Rollback Boundary

Revert only the three declared paths above and the associated acceptance wording in
the PR3 OpenSpec spec, design, tasks, and apply-progress artifacts. Do not alter the
receipt runner, wrapper, unrelated workspace files, or external state.
