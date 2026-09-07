# Coordinate a credential rotation window

This runbook prepares a rotation; it does not authorize one. Never run key generators, edit a live `.env`, restart a consumer, revoke a credential, deploy, or attach command output until the matching ledger decision is explicit.

## Roles and window ledger

Store the ledger in an owner-only location outside the repository. Record only non-secret identifiers, one-way fingerprints, counts, UTC timestamps, and allowlisted outcomes.

| Field | Required value |
|---|---|
| `window_id`, `start_utc`, `end_utc` | Approved maintenance window |
| `operator` | Person entering values through a non-captured owner-only terminal |
| `abort_authority` | Person empowered to stop at any checkpoint |
| `observer` | Independent verifier of consumer health and revocation |
| `credential_fingerprints` | One-way fingerprints only; never prefixes or masked values |
| `consumers` | Named inventory with owner and restart/reload mechanism |
| `replacement_decision` | `authorized`, `denied`, or `aborted` |
| `revocation_decision` | Separate decision; replacement never implies revocation |
| `rollback_owner` | Person authorized to restore the previous consumer configuration |

At minimum inventory Web runtime, Supabase gateway/Auth/Storage/REST consumers, operator tooling, backup/restore tooling, schedulers, CI/CD secret stores, and external integrations. Unknown consumers are an abort condition.

## Before the window

1. Confirm a clean release commit and immutable previous Web image. Do not build or deploy during this step.
2. Verify recent Supabase and Evolution backups by checksum without restoring production.
3. Capture baseline health, consumer count, credential fingerprints, and the eight payment-proof gate states without printing values. Gates remain `false`.
4. Confirm an owner-only terminal with shell tracing and transcript capture disabled. Screen recording, `tee`, CI, chat paste, shared shell history, and captured automation are prohibited.
5. Confirm every consumer supports staged replacement or a bounded restart, and name the rollback command owner. Do not infer a consumer from environment-variable names alone.
6. Review `ops/supabase/utils/rotate-new-api-keys.sh`. Its current behavior prints generated keys, so it MUST NOT run in a captured session or unattended automation. Prefer a reviewed wrapper that writes mode-`0600` output directly to an owner-only file and emits only fingerprints/status.
7. Obtain explicit `replacement_decision=authorized`. If revocation is also intended, obtain a distinct revocation authorization; otherwise revocation remains blocked.

## Replacement sequence

The operator performs secret-bearing steps; evidence records status only.

1. Announce the window and freeze unrelated deployment/configuration work.
2. Generate replacements in the non-captured terminal. Immediately place them in an owner-only mode-`0600` staging file or approved secret manager; never print or copy them into evidence.
3. Compute one-way fingerprints locally and record only those fingerprints.
4. Update consumers in this order so control-plane validation precedes application traffic:
   1. Supabase services that validate or issue the affected key type;
   2. gateway/API routing that accepts the key;
   3. Web runtime and background/scheduled workers;
   4. operator, backup/restore, and CI/CD secret stores;
   5. external integrations, if the inventory proves they consume the key.
5. After each consumer, reload/restart only that bounded consumer and verify health plus one permitted read-only/authentication check. Record `verified` or an allowlisted failure reason, never responses containing tokens or rows.
6. Verify all inventory entries use the replacement fingerprint and the previous credential is no longer configured. This is configuration verification, not revocation proof.

## Abort and rollback

The abort authority stops immediately when a consumer is unknown, a replacement cannot be installed, health/read-only checks fail, fingerprints disagree, evidence capture would expose a value, backup posture changes, or the window expires.

Rollback before revocation:

1. Restore the prior credential from the approved secret manager to every already-migrated consumer in reverse order.
2. Reload/restart only affected consumers.
3. Re-run baseline health and read-only checks.
4. Mark the window `aborted`; retain no plaintext staging artifact after rollback is verified.

Rollback after revocation cannot restore the revoked credential. Keep the replacement, repair failing consumers under incident control, and do not claim rollback or reopen gates.

## Revocation checkpoint

Revocation is irreversible and requires all of the following:

- separate `revocation_decision=authorized` within the active window;
- `CONSUMERS=VERIFIED` and `REPLACEMENTS=VERIFIED` for every inventory entry;
- backups and previous immutable image still available;
- observer and abort authority present;
- no degraded health, unresolved warning, or unknown consumer.

Revoke one previous credential at a time. Independently prove it is unusable with a bounded negative check, then prove the replacement still works. Record only fingerprints, status, reason code, actor, and UTC timestamp.

## Close the window

1. Run the approved read-only health and integration checks. Production smoke and deployment require their own authorizations.
2. Confirm all eight payment-proof gates are still `false`.
3. Destroy plaintext staging files and temporary copies after consumer and revocation verification; record destruction status only.
4. Record final consumer counts, fingerprints, decisions, UTC times, and unresolved actions.
5. If any proof is missing, close as `aborted` or `incomplete`, not successful.

## Evidence allowlist

Allowed: window ID, actors, UTC timestamps, release/image IDs, consumer names/counts, one-way fingerprints, gate booleans, checksums, HTTP status classes, and `verified|aborted|failed` reason codes.

Forbidden: credential values or prefixes, environment dumps, command transcripts from generation/update, auth headers, cookies, database URLs, row data, chat/delivery IDs, Storage keys, payloads, and UUIDs unrelated to release identity.
