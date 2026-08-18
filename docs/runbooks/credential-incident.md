# Contain exposed credentials without crossing authorization gates

This runbook is fail-closed. It records fingerprints, counts, decisions, and hashes only. Never paste, print, log, commit, or attach a credential value. Proposal approval does not authorize any operation below.

## Current stop point

Only baseline preservation and precondition validation are authorized. Replacement, revocation, Git sanitation, garbage collection, publication, deployment, and production mutation remain blocked.

## Safe preflight

1. Record the canonical repository path, HEAD, dirty-state counts, refs, worktrees, and remote count without reading file contents or printing remote URLs.
2. In an owner-only directory outside the repository, create quarantined staged/unstaged patches, an untracked archive, a repository bundle, and `SHA256SUMS`.
3. Create a detached clean sibling worktree at the recorded HEAD. Never reuse another worktree's `.codegraph` index.
4. Generate staged and unstaged patches with `git diff --binary`, plus an untracked-file SHA-256 manifest and archive. Never substitute non-empty placeholders.
5. Run `git bundle verify`, restore the bundle, apply both patches, and extract the validated archive in a disposable private clone. Compare patches and manifests deterministically, record only pass/fail, then destroy the clone.
6. Run the validation-only script with an explicit remote, one full `source:destination` branch refspec, and a non-blank owner. An absent remote MUST fail; do not invent or add one.

```bash
scripts/verify-incident-preconditions.sh \
  --repo /canonical/repository \
  --recovery /private/recovery-directory \
  --remote '<recorded-remote>' \
  --refspec 'refs/heads/<source>:refs/heads/<destination>' \
  --owner '<publication-owner>'
```

The script performs no credential, ref, object, remote, or Supabase mutation. `commit -a`, stash, reset, and checkout-overwrite are prohibited.

## Authorization ledger

Use an owner-only ledger containing only the exact status records required by the verifier. Record actor and UTC timestamp separately in the evidence envelope. Never include values, URLs with credentials, command transcripts, or environment dumps.

| Gate | Required before validation can pass | Irreversible boundary |
|---|---|---|
| A0 — replacement | `A0=AUTHORIZED` for both fingerprints | Consumer migration may disrupt service; it does not authorize revocation. |
| A1 — revocation | `A1=AUTHORIZED`, `CONSUMERS=VERIFIED`, `REPLACEMENTS=VERIFIED` | Revoked credentials cannot be restored. Independently prove both unusable. |
| B1 — rewrite | `B1=AUTHORIZED`, `A1=VERIFIED_REVOKED` | Rewrite only in the disposable sanitation clone; keep quarantine intact. |
| B2 — GC | `B2=AUTHORIZED`, `B1=VALIDATED`, valid bundle, and disposable restoration passing | GC can permanently remove backup-recoverable objects. A self-authored status file is not proof. |

Run the verifier with `--authorization <ledger>` and `--action replace|revoke|rewrite|gc` only after the matching authorization is recorded. Validation success is not permission to execute the operation.

## Abort rules

Abort without advancing the gate when any of these is true:

- a fingerprint or consumer is unknown, or replacement verification fails;
- an authorization is missing, ambiguous, stale, or covers only one credential;
- repository, HEAD, worktree, dirty-state preservation, checksum, or restoration proof differs;
- output or evidence would contain a credential value;
- revocation cannot be independently proven for both fingerprints;
- B1 validation fails before GC, or any ref/reflog/object scope is unaccounted for;
- the remote, refspec, or publication owner is absent or inferred from tracking state;
- a command would touch Supabase, rewrite/expire refs or reflogs, run GC, publish, restart, build, deploy, or mutate production without its separate authorization.

An abort preserves the quarantined bundle, patches, archive, manifest, and clean worktree. Recovery restores repository data only; it never restores credential validity.

## B1 and B2 ordering

After A1 is verified, copy the quarantined bundle into an owner-only disposable sanitation clone. B1 may rewrite refs and reflogs only there. Before requesting B2, prove restoration again and validate reachability plus every intended rewritten scope. On any mismatch, stop and retain quarantine.

B2 is a new decision. Only after explicit B2 authorization may unreachable objects be pruned. Post-GC scanning must cover refs, reflogs, and objects for both in-memory values while emitting counts only. A zero count is required before sanitation can be marked verified.

## Publication remains blocked

No remote exists in the current baseline. Publication is blocked until a maintainer records an explicit remote name, full source/destination refspec, and accountable owner. Upstream tracking, a first-push guess, or a local branch name is insufficient. The verifier never creates a remote or pushes.

## Evidence schema

| Field | Allowed value |
|---|---|
| `incident_id`, `gate`, `decision` | Non-secret identifiers and `authorized|denied|aborted` |
| `actor`, `timestamp_utc` | Accountable identity and UTC time |
| `credential_fingerprint` | One-way fingerprint only; never a prefix or masked value |
| `head_sha`, `scope`, `remote`, `refspec_owner` | Repository identity and explicit publication metadata |
| `artifact_path`, `sha256` | Private path and checksum; quarantine noted |
| `consumer_count`, `match_count`, `status`, `reason_code` | Counts and allowlisted outcomes only |

Minimize evidence to these fields. Keep recovery artifacts mode `0600` under a mode `0700` directory. Because the bundle, patches, or archive may necessarily contain historical or working secret plaintext, destroy them after authorized sanitation is verified and the maintainer ends recovery retention.
