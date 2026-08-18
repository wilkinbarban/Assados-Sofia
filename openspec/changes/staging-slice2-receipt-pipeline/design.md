# Design: Staging Slice 2 Receipt Pipeline

## Technical Approach

PR3 supplies reviewed, **uninstalled** staging-only operational artifacts. It extends the PR1/PR2 local contracts; no resource, credential, timer, or remote probe is activated by this change. `mhoqwjatrendnhfnwewv` and `staging:mhoqwjatrendnhfnwewv` are the sole accepted target; production `xvzdxoktwnzmxsfizkxo` is hard-denied before credential access, locking, or network work.

## Architecture Decisions

| Decision | Options / trade-off | Choice and rationale |
|---|---|---|
| Invocation | Direct shell or systemd | Root `Type=oneshot` units invoke one fixed wrapper; service isolation and auditable journal replace operator shell state. |
| Triggering | Path unit or polling timer | `asados-slice2-manifest.timer` starts an automatic wrapper unit; it hashes the declared manifest and skips unchanged state. No path unit, retry, repair, migration, or production fallback. |
| Secrets | Environment/files/arguments | `LoadCredentialEncrypted` exposes separate host-bound staging secret and publishable handles only to the service. No `Environment=` secret, plaintext, logged value, or repo copy. |
| Evidence | Logs as proof | Atomic, allowlisted receipt JSON plus lock metadata; journal records only attempt ID, category, and exit status. |
| PR3B review boundary | Historical Git delta or static manifest | A pre-change snapshot is unavailable, so PR3B uses a deterministic declared manifest, current-byte SHA-256 hashes, and current line-count estimate. This is explicitly non-Git evidence: it bounds the declared work unit but does not prove historic ownership, changed lines, or a Git diff. |

## Data Flow

```text
manual service | manifest timer -> wrapper -> target/identity -> lock -> manifest
                                     | failure/skipped -> atomic redacted receipt
credentials -> Admin fixture -> password grant -> Storage/RPC/denial -> finally cleanup -> receipt
```

`asados-slice2-receipt.service` runs manual attempts. `asados-slice2-manifest.service` runs the same wrapper with the non-secret `RECEIPT_TRIGGER=automatic`; its timer is `OnCalendar=*-*-* 03:17:00`, `RandomizedDelaySec=15m`, `Persistent=true`. Both use effective `TimeoutStartSec=10m`, `NoNewPrivileges=true`, `PrivateTmp=true`, `ProtectSystem=strict`, `ProtectHome=true`, `ProtectKernelTunables=true`, `ProtectControlGroups=true`, `ProtectKernelModules=true`, `RestrictSUIDSGID=true`, `LockPersonality=true`, `MemoryDenyWriteExecute=true`, `RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6`, and write only `/var/lib/asados/slice2/{receipts,locks,state}`. Network failure, timeout, ambiguous lock, or unexpected HTTP status fails closed.

## File Changes

| File | Action | Description |
|---|---|---|
| `scripts/validate-slice2-hosted-receipt.sh` | Modify | Real staging probe lifecycle, fixed timeouts, receipt/lock recovery. |
| `ops/systemd/asados-slice2-{receipt,manifest,retention}.service` | Create | Manual receipt, automatic receipt, and retention oneshots. |
| `ops/systemd/asados-slice2-{manifest,retention}.timer` | Create | Daily manifest eligibility and daily 30-day cleanup timers. |
| `ops/systemd/run-slice2-receipt` | Create | Credential-only wrapper and fixed invocation boundary. |
| `ops/systemd/install-slice2-receipt-pipeline.sh` | Create | Validate/install/enable only after explicit staging approval. |
| `ops/systemd/slice2-receipt-pipeline.md` | Create | Installation, observation, rollback, rotation, and no-production runbook. |
| `tests/unit/slice2-{hosted-receipt-harness,systemd-receipt-pipeline}.test.ts` | Modify/Create | Runner and static unit/installer contracts. |

## Interfaces / Contracts

Units load exactly `LoadCredentialEncrypted=staging-secret:/etc/credstore.encrypted/asados.slice2.staging-secret.cred` and `staging-publishable:/etc/credstore.encrypted/asados.slice2.staging-publishable.cred`. The wrapper and runner read only `$CREDENTIALS_DIRECTORY/{staging-secret,staging-publishable}`, validate regular root-owned files, export neither value, and pass neither as arguments. Password sign-in is `POST /auth/v1/token?grant_type=password` with an email/password JSON body. It requires immutable target/ref identity and bounded 20-second HTTP operations.

The runner atomically owns a target lock with PID/start-time metadata; it recovers only a valid PID proven dead, otherwise writes `lock-held`. It creates unique Admin API fixture users, obtains normal password-grant sessions, proves authenticated Storage and RPC success, denied-role rejection, then deletes objects/users in `finally` and proves absence. Authenticated receipt scenarios accept only the `2xx` HTTP class; the denied lifecycle scenario accepts only `4xx` with `USUARIO_NAO_AUTORIZADO`. Each completed probe appends an allowlisted, nonempty status-class record. Any stage failure stops later probes but attempts cleanup. Receipt success requires every required status record and proven cleanup; failed deletion/read-back emits a durable `cleanup-incomplete` failure receipt. Receipt fields are `attempt_id`, target identity/ref, revision, fingerprint, trigger, timestamps, outcome, sanitized category, status classes, cleanup outcome; no URLs, bodies, fixture IDs, command lines, or credentials.

Retention uses `asados-slice2-retention.timer` daily at 04:02 with `Persistent=true`; its service deletes only regular receipt/lock files older than 30 days under the fixed state root, never follows symlinks, and journals count/category only.

## Testing Strategy

| Layer | What to test | Approach |
|---|---|---|
| Unit | Units, hardening, encrypted handles, installer modes/order, retention symlink refusal, locks/stale recovery, target/ref refusal, redaction/timeouts | RED static/runtime Vitest contracts before implementation. |
| Integration | Fixture → grant → Storage/RPC → denial → proven cleanup and redacted receipt | Explicitly approved staging ref only; one bounded manual attempt. |
| Operations | Install/enable, journal/receipt, disable/uninstall rollback | Disposable filesystem/systemctl doubles; never a production host. |

## PR3B Acceptance Evidence

Task 3.1 is satisfied by a refreshed static boundary receipt rather than an impossible retrospective Git-delta assertion. The receipt declares the PR3B-owned paths, deterministic SHA-256/current-line manifest inputs, a non-delta line estimate, and the rollback boundary. It must disclose that no pre-change snapshot was provided; no `git diff`, Git-status classification, or historical ownership assertion is used as acceptance evidence.

## Threat Matrix

| Boundary | Applicability | Safe/failure behavior and RED test |
|---|---|---|
| Documentation-like paths | N/A: no executable classification. | N/A |
| Git repository selection | N/A: no `git -C`/selector. | N/A |
| Commit state | N/A: no commits. | N/A |
| Push state | N/A: no pushes. | N/A |
| PR commands | N/A: no PR commands. | N/A |
| Shell/process integration | Applicable: fixed wrapper/systemd/retention commands. | Reject injected paths, secret environment/arguments, unsafe target, live/ambiguous lock, and symlink retention input; RED test each. |

## Migration / Rollout

The installer first validates source and installed units (`systemd-analyze verify`), scripts, ownership/modes, credential existence, target identity, and state directories; it installs atomically, daemon-reloads, and validates units but does **not** enable or start either timer. After an authorized manual smoke succeeds and its redacted receipt is inspected, a separate explicit operator action may enable both timers with `systemctl enable --now asados-slice2-manifest.timer asados-slice2-retention.timer`. The installer never starts a receipt itself. Rollback disables/stops both timers/services, removes only installed PR3 unit/script copies, daemon-reloads, preserves receipts for investigation, and leaves bootstrap, application, disposable flow, and production untouched.

## Open Questions

- [ ] Name the approved staging Storage bucket/RPC function and expected denial status classes before implementation.
