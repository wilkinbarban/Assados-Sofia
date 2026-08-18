# Apply Progress: Staging Slice 2 Receipt Pipeline — PR3 runner/wrapper and final cleanup hardening completed locally

## Status

## PR3A Remediation: Credential and Password-Grant Correctness

PR3A aligns the wrapper, runner, tests, and design contract to the exact
systemd handles `staging-secret` and `staging-publishable`. The runner now
requests Supabase password sessions only with `POST /auth/v1/token?grant_type=password`
and an email/password JSON body. The local curl double rejects the legacy
`password-grant` query value; it intercepts all calls, so no network request
or staging execution occurred. PR3B status-class and cleanup work remains
explicitly pending.

### PR3A TDD Cycle Evidence

| Task | Test file | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|
| 1.1 | `tests/unit/slice2-{systemd-receipt-pipeline,hosted-receipt-harness}.test.ts` | 3 failures requiring exact handles and rejecting legacy names | Focused command exit 0; 2 files, 25 tests passed | Wrapper and runner are independently asserted; absent handles still fail closed | None needed; only fixed handle literals changed |
| 1.2 | `tests/unit/slice2-hosted-receipt-harness.test.ts` | Local curl double rejected `grant_type=password-grant` and the exact-request assertion failed | Focused command exit 0; 2 files, 25 tests passed | Static contract plus fake-curl runtime path distinguish the exact query from legacy values | None needed; retained named sign-in constant |
| 1.3–1.4 | Same focused tests | Tests above failed before production changes | Focused command exit 0; 2 files, 25 tests passed; both shell scripts parse | Wrapper invocation and runner request behavior exercise separate paths | None needed |

### PR3A Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | `npx vitest run tests/unit/slice2-systemd-receipt-pipeline.test.ts tests/unit/slice2-hosted-receipt-harness.test.ts` — exit 0; 2 files, 25 tests passed. |
| Runtime harness command/scenario and exact result | The focused Vitest local curl-double scenario invoked `bash scripts/validate-slice2-hosted-receipt.sh --authorized-flow` with disposable exact-handle files; it accepted only the password query, exited 1 after the deliberate later 500, and made no network call. |
| Rollback boundary | Revert PR3A exact-handle and password-query changes only in `ops/systemd/run-slice2-receipt`, `scripts/validate-slice2-hosted-receipt.sh`, the two focused tests, and this design contract paragraph; PR3B lifecycle/status work and all host state remain untouched. |
| Review budget | PR3A local diff is within the 400-line limit; the pre-existing 917-line candidate is not modified by this remediation. |

PR3 implements the local, executable staging receipt runner and credential-only
wrapper. The fixed staging ref remains `mhoqwjatrendnhfnwewv`; production was not
contacted or modified. The runner uses the `produto-imagens` bucket, normal
password grants, authenticated lifecycle RPCs, an explicit denied
`USUARIO_NAO_AUTORIZADO` response, bounded 20-second curl calls, and cleanup
absence proof before a successful redacted receipt.

The wrapper accepts no arguments, reads only the two fixed handles under
`CREDENTIALS_DIRECTORY`, refuses missing, symlinked, non-root-owned, or
wrong-mode files, and invokes the fixed runner without exporting credentials.
No service, timer, installer, daemon reload, enablement, external fixture, or
staging smoke was created or run. Those remain PR4 work.

## PR3 Bounded Correction: Profile Authorization and Interruption Cleanup

The Admin API fixture no longer relies on `app_metadata` for lifecycle access. After
the Admin API creates the admin fixture, the runner updates only that fixture's
`public.perfis` row to active `admin` through the service credential, reads the same
row back, and verifies its ID, role, and active state before password grant or RPC
probes. The denied fixture remains unprivileged.

The runner now installs EXIT/INT/TERM/HUP handling after its lock is acquired. When
fixture identifiers exist and normal cleanup has not finalized, it attempts all
Storage-object, pending-cleanup-record, product, and Auth-user deletions, releases
the lock, preserves the original exit status, and records only a redacted
`interrupted` receipt. No cleanup runs before a fixture identifier exists. No
external request, service activation, or systemd change was performed.

## PR3 Final Cleanup Hardening: Repeated-Signal Safety

When exit cleanup begins, the runner disables its EXIT handler and ignores repeated
INT, TERM, and HUP before deleting fixture resources. This prevents a second signal
from preempting cleanup proof or lock release. The runtime harness sends one SIGTERM
during profile readback and another while the Auth-user deletion is in flight; it
proves the user-absence readback still occurs, the target lock is removed, and the
redacted receipt remains `interrupted`. All requests use disposable local `curl`
doubles; no external operation ran.

No rollback action was needed because no PR3 external state was created. The
existing bootstrap service remains static and inactive after its successful
oneshot completion. No plaintext secret was read, written, logged, passed in an
environment variable, or left on disk by this attempt. The requested 30-day
receipt retention is therefore not enabled: no reviewed retention unit exists to
validate or install.

PR2 adds a local-only, fail-closed fixture-lifecycle contract to the receipt
runner. It binds authorized execution to the immutable staging ref and identity,
requires named secret and publishable-key handles under `CREDENTIALS_DIRECTORY`,
defines Admin fixture, normal password-grant, authenticated/denied probe, and
`finally` cleanup/proof interfaces, and deliberately fails with a redacted
receipt until PR3 supplies the reviewed external enablement and probes.

The root-only credential bootstrap is complete. Non-secret filesystem metadata
confirmed that `/etc/credstore.encrypted/asados.slice2.staging-secret.cred` is a
regular `root:root` file with mode `0600`; its contents were not read. The
bootstrap service reports `Result=success` and `ExecMainStatus=0`; its
`inactive/dead` state is expected for a successful `Type=oneshot` service.
No secret was requested, received, shown, or stored by this session. No
credential file was read, no Supabase DML/Auth DML/migration occurred, and no
fixture or receipt was executed remotely.

No receipt service or timer was created, installed, enabled, or started. The
local runner accepts `--authorized-flow` only as a contract gate and persists a
sanitized failure when credentials or PR3's external scenario wiring are absent.

The bounded PR2 correction records the lock owner PID through an atomic
same-directory rename. On contention, it reclaims only a regular, valid PID
record whose `/proc` entry is absent. Live, missing, malformed, unreadable, or
otherwise ambiguous lock metadata remains fail-closed and emits the existing
redacted `lock-held` receipt. No remote, systemd, or Supabase operation ran.

## Completed Tasks Retained from Earlier Slices

- [x] 1.1 External blockers recorded without provisioning.
- [x] 1.2 Target refusal contracts.
- [x] 1.3 Lock, drift, and trigger eligibility contracts.
- [x] 1.4 Redacted receipt and failure-closure contracts.
- [x] 1.5 Static prohibited-operation contracts.
- [x] 2.1 Fixed-baseline guards, target-scoped non-blocking lock, bounded commands.
- [x] 2.2 Sorted SHA-256 manifest and manual/automatic eligibility.
- [x] 2.3 Redacted receipt emission and success/cleanup closure.
- [x] 2.4 Focused local verification; legacy disposable launcher untouched.
- [x] 2.5 Automatic prior-fingerprint receipt correction.
- [x] 2.6 Guard-path durable receipt correction.
- [x] 2.7 Invalid-trigger durable receipt correction.
- [x] 2.8 PID-owned stale-lock recovery correction.
- [x] 3.1a Host-key preflight review correction.
- [x] 3.1b Password-agent sandbox and invalid-credential revocation correction.
- [x] 3.1 Root credential bootstrap completed and verified from non-secret metadata.
- [x] 3.2 Local Admin fixture/password-grant/authenticated-and-denied lifecycle contract.
- [x] 3.3 Local `finally` cleanup/proof and redacted unexpected-status failure contract.

## Current Work Unit

- [x] PR3 runner/wrapper: local credential and HTTP doubles prove fail-closed,
  redacted evidence without a network call.
- [x] PR3 final cleanup hardening: repeated signals cannot interrupt fixture cleanup
  proof or target-lock release.
- [ ] PR4 operational artifacts and separately approved live staging smoke.

## TDD Cycle Evidence

| Task | Test file | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|
| 1.1–2.7 | Prior merged evidence | Retained from prior batches | Retained from prior batches | Retained from prior batches | Retained from prior batches |
| 3.1 preparation | `tests/unit/slice2-systemd-credential-bootstrap.test.ts` | 3 failures: artifacts absent | 3/3 passed after service, provisioner, and installer additions | Service boundary, encrypted input pipeline, and validation/no-enable paths are distinct assertions | Added `-n` after a second RED check to prevent an appended key newline |
| 3.1a review correction | `tests/unit/slice2-systemd-credential-bootstrap.test.ts` | 3 failed / 2 passed after tests first required preflight and removed in-service setup | 5/5 passed after moving setup into installer preflight and narrowing the unit path | Missing-key initialization and existing-key non-regeneration take distinct paths | Removed the stale service writable path; no behavior duplication remains |
| 3.1b review correction | `tests/unit/slice2-systemd-credential-bootstrap.test.ts` | 3 failed / 5 passed after tests first required the password-agent write path, revocation/atomic publish, and rerun guidance | 8/8 passed after allowing only `/run/systemd/ask-password`, staging temporary output, revoking failed input, and documenting replacement | Separate unit isolation, failed-prompt cleanup/publish ordering, and operator-recovery cases | None needed; the smallest explicit path and same-filesystem move preserve the boundary |
| 3.1 completion evidence | Existing bootstrap contract test | Retained: production bootstrap artifacts were created only after RED evidence | Current `npm run test:unit` exit 0; 31 files, 174 tests passed | Root-only credential metadata and successful oneshot state are separate non-secret runtime checks | No code change required |
| 3.2–3.3 PR2 contract | `tests/unit/slice2-hosted-receipt-harness.test.ts` | 2 failures: exact identity/credential and lifecycle interfaces absent; then 1 failure: password-grant expectation absent | `npm run test:unit -- tests/unit/slice2-hosted-receipt-harness.test.ts` exit 0; 1 file, 12 tests passed | Exact ref vs mismatched ref and absent credential directory take distinct fail-closed paths | Kept lifecycle interfaces side-effect free so PR3 is the only external activation boundary |
| 2.8 PR2 stale-lock correction | `tests/unit/slice2-hosted-receipt-harness.test.ts` | 2 failures: live-owner fixture cleanup flaw, then dead owner remained `lock-held` | `npm run test:unit -- tests/unit/slice2-hosted-receipt-harness.test.ts` exit 0; 1 file, 15 tests passed | Live PID blocks; absent `/proc` PID recovers; missing and malformed metadata independently remain fail-closed | Extracted acquisition/recovery helpers; atomic metadata rename keeps the acquired directory fail-closed while metadata is unavailable |
| PR3 tasks 1.1–2.3 | `tests/unit/slice2-{hosted-receipt-harness,systemd-receipt-pipeline}.test.ts` | 4 failures: absent probe contract and wrapper | Focused command exit 0; 2 files, 19 tests passed | Local fake curl rejection produces a redacted `unexpected-status` receipt with proven no-fixture cleanup; wrapper missing-handle and injected-argument refusals are distinct | Extracted bounded curl/config helper and fixed wrapper handles; no systemd artifact added |
| PR3 correction 2.4 | `tests/unit/slice2-hosted-receipt-harness.test.ts` | 2 failures: absent fixture-profile promotion/verification and interruption cleanup trap | Focused command exit 0; 2 files, 23 tests passed | Static contract proves service-path PATCH/readback and a local fake-curl SIGTERM during readback proves Admin-user cleanup, `interrupted` redaction, and exit 143 | Added a finalized-cleanup guard so normal receipt closure cannot emit a second interrupted receipt |
| PR3 final hardening 2.5 | `tests/unit/slice2-hosted-receipt-harness.test.ts` | Repeated-SIGTERM cleanup-proof assertion failed after the first cleanup deletion, before Auth-user absence verification | Focused command exit 0; 1 file, 21 tests passed | Existing first-SIGTERM coverage plus a second SIGTERM during Auth-user deletion prove the ignored-signal contract and lock removal | Added one signal-ignore trap at cleanup entry; no further refactor needed |

## Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | `npm run test:unit -- tests/unit/slice2-systemd-credential-bootstrap.test.ts` — exit 0; 1 file, 8 tests passed. |
| Runtime harness command/scenario and exact result | No service start: it requires a local hidden secret prompt, and this correction forbids credential/host provisioning. Static service harness: `bash -n ops/systemd/provision-slice2-staging-secret && bash -n ops/systemd/install-slice2-credential-bootstrap.sh && systemd-analyze verify ops/systemd/asados-slice2-credential-bootstrap.service` — exit 0; both shell syntaxes and the unit passed. |
| Completion verification | `sudo -n test -r ...credential.cred && sudo -n stat -c 'credential mode=%a owner=%U group=%G type=%F size=%s' ...credential.cred` — exit 0; `0600`, `root:root`, regular file; no content read. `systemctl show asados-slice2-credential-bootstrap.service --property=ActiveState,SubState,Result,ExecMainStatus` — `Result=success`, `ExecMainStatus=0`, `inactive/dead` (expected oneshot completion). |
| Activation guard | `ops/systemd/` contains only credential-bootstrap artifacts; no reviewed receipt service/timer or approved receipt installer exists. `systemctl list-unit-files 'asados-slice2-receipt*' --no-legend` returned no units. No activation or smoke was attempted. |
| Full required unit command | `npm run test:unit` — exit 0; 31 files, 174 tests passed. |
| Rollback boundary | Revert only `/run/systemd/ask-password` allow-listing, atomic revocation/publish behavior, the installer notice, matching recovery documentation, and focused test; do not remove `/var/lib/systemd/credential.secret`, which may protect unrelated systemd credentials. |
| PR2 focused test command and exact result | `npm run test:unit -- tests/unit/slice2-hosted-receipt-harness.test.ts` — exit 0; 1 file, 12 tests passed. |
| PR2 runtime harness command/scenario and exact result | The focused Vitest harness spawned `bash scripts/validate-slice2-hosted-receipt.sh --authorized-flow` with no `CREDENTIALS_DIRECTORY`; exit 1, one redacted `unexpected-status` receipt, no network boundary. |
| PR2 rollback boundary | Revert only `scripts/validate-slice2-hosted-receipt.sh` and `tests/unit/slice2-hosted-receipt-harness.test.ts` changes for the immutable guard and local lifecycle contract; legacy launcher and external credential bootstrap remain untouched. |
| PR2 stale-lock focused test command and exact result | `npm run test:unit -- tests/unit/slice2-hosted-receipt-harness.test.ts` — exit 0; 1 file, 15 tests passed. |
| PR2 stale-lock runtime harness command/scenario and exact result | Vitest invoked `bash scripts/validate-slice2-hosted-receipt.sh --preflight` against live, dead, missing, and malformed lock-owner metadata. Exit behavior: live/missing/malformed each exit 1 with a redacted `lock-held` receipt; dead PID exits 0 after reacquisition. No network boundary. |
| PR2 stale-lock rollback boundary | Revert only `acquire_lock`/`recover_dead_lock_owner` in `scripts/validate-slice2-hosted-receipt.sh` and the three stale-lock cases in `tests/unit/slice2-hosted-receipt-harness.test.ts`; all target, credential, receipt, and external lifecycle guards remain intact. |
| PR2 stale-lock full required unit command | `npm run test:unit` — exit 0; 31 files, 177 tests passed. |
| PR3 prerequisite/full unit command | `npm run test:unit` — exit 0; 31 files, 177 tests passed. |
| PR3 runtime harness command/scenario and exact result | N/A — a staging smoke must not run: no reviewed receipt service/timer/retention units or wrapper exist, and `authorized_fixture_contract` always ends in a redacted `unexpected-status` failure rather than performing approved probes. |
| PR3 rollback boundary | No PR3 files or systemd state were created. If a future reviewed installation begins, disable only `asados-slice2-receipt.timer` and retention timer, stop the oneshot service, then remove only the PR3 receipt unit/wrapper/retention files; leave the credential-bootstrap unit and host key untouched. |
| PR3 focused test command and exact result | `npm run test:unit -- tests/unit/slice2-hosted-receipt-harness.test.ts tests/unit/slice2-systemd-receipt-pipeline.test.ts` — exit 0; 2 files, 20 tests passed. |
| PR3 runtime harness command/scenario and exact result | The focused Vitest test creates disposable credential files and a fake `curl` that returns 500. `bash scripts/validate-slice2-hosted-receipt.sh --authorized-flow` exits 1 and writes one redacted `unexpected-status` receipt with `cleanup: proven`; no network call occurs. |
| PR3 full required unit command | `npm run test:unit` — exit 0; 32 files, 182 tests passed. |
| PR3 rollback boundary | Revert only `scripts/validate-slice2-hosted-receipt.sh`, `ops/systemd/run-slice2-receipt`, and the two focused tests. No external state, service, timer, installer, or production behavior is affected. |
| PR3 correction focused test command and exact result | `npm run test:unit -- tests/unit/slice2-hosted-receipt-harness.test.ts tests/unit/slice2-systemd-receipt-pipeline.test.ts` plus `bash -n scripts/validate-slice2-hosted-receipt.sh && bash -n ops/systemd/run-slice2-receipt` — exit 0; 2 files, 23 tests passed; both scripts parsed. |
| PR3 correction runtime harness command/scenario and exact result | Focused Vitest uses disposable credentials and fake curl. SIGTERM during the profile-readback probe exits 143, deletes the created Auth fixture, and writes a redacted `interrupted` receipt; no network call occurs. |
| PR3 correction full unit command | `npm run test:unit` — exit 0; 32 files, 185 tests passed. |
| PR3 correction rollback boundary | Revert only profile promotion/readback, fixture cleanup/trap logic in `scripts/validate-slice2-hosted-receipt.sh` and its focused test additions. Wrapper, external state, systemd activation, and application code are untouched. |
| PR3 final hardening focused test command and exact result | `npm run test:unit -- tests/unit/slice2-hosted-receipt-harness.test.ts` — exit 0; 1 file, 21 tests passed. |
| PR3 final hardening runtime harness command/scenario and exact result | Focused Vitest runs `bash scripts/validate-slice2-hosted-receipt.sh --authorized-flow` with disposable credentials and fake `curl`. A first SIGTERM starts cleanup during profile readback; a second SIGTERM arrives during Auth-user deletion. Exit 143; Auth-user absence readback completed, the lock directory was removed, and one redacted `interrupted` receipt was written. No network call occurred. |
| PR3 final hardening rollback boundary | Revert `trap '' INT TERM HUP` in `cleanup_on_exit` and the repeated-signal contract test in `tests/unit/slice2-hosted-receipt-harness.test.ts`; the existing initial-signal cleanup, wrapper, external state, and systemd activation remain untouched. |

## External State

- The encrypted credential is now present and root-only; no content was read.
- No receipt-runner system files were installed and no receipt service/timer was
  started because the reviewed units and approved installer are absent locally
  and on the host.
- `sudo -n` succeeded for the non-secret metadata and systemd-status checks.
- The bootstrap unit has no `[Install]` section and is never enabled for boot.
- PR3 receipt service, timer, retention service/timer, wrapper, receipt directory,
  and retention policy are absent and unmodified. No daemon reload, enablement,
  remote request, fixture, or smoke receipt ran.
- `systemd-analyze security --offline=yes` previously reported exposure 8.7
  because the unit runs as root. `ProtectSystem=strict`, `ProtectHome=yes`,
  `PrivateTmp=yes`, `NoNewPrivileges=yes`, encrypted-store access, and only the
  password-agent request path remain in force. It was not rerun because that is
  not a focused correctness harness for this bounded correction.

## PR Chain Context

```text
main <- PR1 <- PR2 <- 📍 PR3 runner/wrapper <- PR4 units/retention/installer
```

- Mode: stacked PR slice.
- Boundary: runner, credential-only wrapper, and local-only tests; PR4 alone owns
  units, retention, installer, enablement, and a live staging smoke.
- Review budget: PR3 remains below 400 authored changed lines.

## Bounded Bootstrap Resilience Correction

The credential provisioner now encrypts replacement ciphertext before touching an
active credential. Once the replacement is root-owned and mode `0600`, it creates
a same-filesystem root-only hard-link backup, atomically renames the replacement
over the active path, and removes the backup. Failed hidden prompts or encryption
remove only the temporary ciphertext and preserve the active credential.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| B.1–B.2 | `tests/unit/slice2-systemd-credential-bootstrap.test.ts` | Unit/runtime shell double | 8/8 passed before edits | 4 failures/6 passes: no sourceable rotation boundary, successful replacement failed, and stale operator guidance | `npx vitest run tests/unit/slice2-systemd-credential-bootstrap.test.ts` exit 0; 1 file, 10 tests passed | Prompt failure and encryption failure each preserve the old ciphertext; success replaces it and removes `.revoked` | None needed; the named rotation boundary isolates only the testable atomic sequence |

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | `npx vitest run tests/unit/slice2-systemd-credential-bootstrap.test.ts` — exit 0; 1 file, 10 tests passed. |
| Runtime harness command/scenario and exact result | The focused Vitest harness sources the provisioner with disposable credential directories and local `systemd-ask-password`/`systemd-creds` doubles. Prompt failure and encryption failure each exit 1 with `active-ciphertext` retained and no `.revoked`; success exits 0 with `replacement-ciphertext` active and no backup. No service, remote operation, or secret was used. |
| Rollback boundary | Revert only `ops/systemd/provision-slice2-staging-secret`, its installer notice/runbook guidance, and `tests/unit/slice2-systemd-credential-bootstrap.test.ts`; no installed unit, host key, credential file, service state, or receipt pipeline behavior is changed. |
| Syntax/unit validation | `bash -n ops/systemd/provision-slice2-staging-secret && bash -n ops/systemd/install-slice2-credential-bootstrap.sh && systemd-analyze verify ops/systemd/asados-slice2-credential-bootstrap.service` — exit 0. |

### Current Work Unit

- [x] B.1–B.2 Bounded credential rotation resilience correction.

## PR3B Remediation: Scenario Statuses and Cleanup Closure

PR3B keeps the PR3A credential handles and password-grant contract unchanged. The
local runner now records only fixed, allowlisted scenario objects: each authenticated
Storage/RPC probe must return `2xx`, and the denied lifecycle probe must return `4xx`
with `USUARIO_NAO_AUTORIZADO`. A successful receipt requires all eight status records
and proven cleanup. A deletion read-back that cannot prove user absence writes one
durable failure receipt with `category: cleanup-incomplete`, `cleanup: incomplete`,
and never emits a success receipt.

### PR3B TDD Cycle Evidence

| Task | Test file | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 2.1 | `tests/unit/slice2-hosted-receipt-harness.test.ts` | Runtime shell-double unit | 22/22 passed before edits | Successful doubled lifecycle expected `outcome: success` and nonempty status classes; received failure/empty status list | `npx vitest run tests/unit/slice2-hosted-receipt-harness.test.ts` exit 0; 24/24 passed | Authenticated Storage/RPC `2xx` records and denied RPC `4xx`/`USUARIO_NAO_AUTORIZADO` use separate token and HTTP paths | Extracted allowlisted status recorder and required-status gate |
| 2.2 | `tests/unit/slice2-hosted-receipt-harness.test.ts` | Runtime shell-double unit | 22/22 passed before edits | Deletion read-back double required eight retained statuses but received empty evidence | Same focused command exit 0; 24/24 passed | Successful cleanup produces success/proven; read-back `200` produces one failure/incomplete receipt | None needed; existing cleanup loop already attempts all resources |
| 2.3–2.4 | Same focused test | Runtime shell-double unit | 22/22 passed before edits | Both new behavior cases failed before production changes | Focused command exit 0; 1 file, 24 tests passed; `bash -n scripts/validate-slice2-hosted-receipt.sh` exit 0 | Authorized success returns after its atomic receipt; failure closure cannot fall through to a skipped receipt | Added the explicit authorized-flow return to avoid a second receipt |

### PR3B Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | `npx vitest run tests/unit/slice2-hosted-receipt-harness.test.ts` — exit 0; 1 file, 24 tests passed. |
| Runtime harness command/scenario and exact result | Vitest ran `bash scripts/validate-slice2-hosted-receipt.sh --authorized-flow` with disposable credentials and a local curl double only. The success path emitted eight nonempty allowlisted status records (`2xx` authenticated, denied `4xx` plus `USUARIO_NAO_AUTORIZADO`); the deletion-readback-`200` path exited 1 and emitted exactly one `cleanup-incomplete`/`incomplete` receipt. No network, service install, staging run, or production access occurred. |
| Rollback boundary | Revert only the scenario-status/authorized-return logic in `scripts/validate-slice2-hosted-receipt.sh`, the two PR3B curl-double cases in `tests/unit/slice2-hosted-receipt-harness.test.ts`, and this PR3B artifact evidence. PR3A credential handles/password grant and all PR4 operational work remain intact. |
| Review budget | PR3B is a focused stacked work unit in the planned 260–360 line band and remains below the 400-line limit when isolated from the repository’s pre-existing untracked candidate files. |

## PR3B Chain Context

`main ← PR1 ← PR2 ← PR3A ← 📍 PR3B status/cleanup ← PR4 external`

Mode: stacked-to-main. PR3B bases on PR3A; PR4 units, installer, timer enablement,
credential provisioning, remote staging smoke, and production access remain deferred.

## PR3B-2 Non-Commit Dirty-Workspace Boundary Evidence

`scripts/audit-slice2-pr3b-boundary.sh` produces a deterministic local report that
separates declared PR3A/PR3B paths from unrelated dirty paths. It explicitly records
that no pre-change Git snapshot was supplied, so its SHA-256 values identify current
bytes and its line counts are estimates rather than a defensible delta. Whole untracked
directories containing declared paths remain explicitly unclassified; no ownership is
claimed for their other contents. No staging, commit, external operation, or secret
access occurred.

### PR3B-2 TDD Cycle Evidence

| Task | Test file | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 1.1–1.2 / PR3B-2 | `tests/unit/slice2-pr3b-boundary-audit.test.ts` | Unit/runtime shell | N/A (new files) | 2 failures: audit script/report absent | `npx vitest run tests/unit/slice2-pr3b-boundary-audit.test.ts` exit 0; 1 file, 2 tests passed | Report shape/current hash and injected-secret redaction/non-delta limitation exercise separate paths | Added unclassified-directory handling after the first green exposed directory-level Git ambiguity; focused test remained green |

### PR3B-2 Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | `npx vitest run tests/unit/slice2-pr3b-boundary-audit.test.ts` — exit 0; 1 file, 2 tests passed. |
| Runtime harness command/scenario and exact result | `bash -n scripts/audit-slice2-pr3b-boundary.sh && bash scripts/audit-slice2-pr3b-boundary.sh` — exit 0. Local-only audit wrote `pr3b-boundary-evidence.md`; no runtime resource boundary exists because the script only reads Git status and file metadata. |
| Rollback boundary | Remove only `scripts/audit-slice2-pr3b-boundary.sh`, `tests/unit/slice2-pr3b-boundary-audit.test.ts`, and `openspec/changes/staging-slice2-receipt-pipeline/pr3b-boundary-evidence.md`; preserve all pre-existing dirty paths and PR3A/PR3B receipt behavior. |
| Review budget / limitation | PR3B-2 adds 216 authored lines across script, test, and evidence report, below 400. No pre-change Git snapshot exists, therefore current hashes and line counts cannot establish a delta or ownership. |

## PR3B-1 Remaining Runtime Contract Coverage

PR3B-1 adds local-only runtime coverage for password-grant failure cleanup,
identity mismatch preflight, and the exact successful receipt status allowlist.
The password-grant failure path already performed the required cleanup, so no
cleanup production change was needed. The identity RED test found that an
untrusted identity was echoed into the receipt; `write_receipt` now emits only
the approved identity or `unavailable`.

### PR3B-1 Final Test Correction

The identity-mismatch runtime case now invokes `--authorized-flow` with
`RECEIPT_EXECUTION=authorized` and disposable valid `staging-secret` and
`staging-publishable` handle files. Local `stat` and `curl` doubles record
credential-handle validation and HTTP invocation respectively. The mismatch
exits at the `drift` guard before either double is called, and the resulting
receipt retains the approved-or-`unavailable` redaction boundary. No runner
change, network request, staging execution, or external operation was needed.

### PR3B-1 TDD Cycle Evidence

| Task | Test file | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 2.1–2.2 | `tests/unit/slice2-hosted-receipt-harness.test.ts` | Runtime shell-double unit | 24/24 passed before edits | Password-grant failure cleanup contract was written first; it passed because cleanup already existed | Same focused command passed; no production cleanup change needed | Failure proves two user deletions/read-backs and no Storage/RPC probes | None needed |
| 2.3, 2.5 | Same | Runtime shell-double unit | 24/24 passed before edits | Mismatched identity test failed because the receipt echoed the untrusted value | `bash -n scripts/validate-slice2-hosted-receipt.sh && npx vitest run tests/unit/slice2-hosted-receipt-harness.test.ts` exit 0; 26/26 passed | Valid identity remains available in normal receipts; mismatch is `drift` before curl or credentials | Added a local sanitized identity value at receipt serialization |
| 2.4 | Same | Runtime shell-double unit | 24/24 passed before edits | Exact eight-entry allowlist test was written first; existing recorder passed | Same focused command passed | Full ordered equality plus unique scenario count rejects missing, extra, and duplicate evidence | None needed |
| 2.3 final test correction | Same | Runtime shell-double unit | 26/26 passed before the test correction | The corrected mismatch case was written first to invoke `--authorized-flow` with valid disposable handles; the existing target guard already passed it without touching either handle or curl double | `npx vitest run tests/unit/slice2-hosted-receipt-harness.test.ts && bash -n scripts/validate-slice2-hosted-receipt.sh` exit 0; 1 file, 26/26 passed | Existing absent-credential authorized-flow case and corrected mismatch-with-valid-handles case prove distinct guard ordering | None needed; production guard order already matched the contract |

### PR3B-1 Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | `bash -n scripts/validate-slice2-hosted-receipt.sh && npx vitest run tests/unit/slice2-hosted-receipt-harness.test.ts` — exit 0; 1 file, 26 tests passed. |
| Runtime harness command/scenario and exact result | The focused Vitest harness invoked `bash scripts/validate-slice2-hosted-receipt.sh --authorized-flow` with disposable credentials and curl/stat doubles. Password grant `401` exited 1, made two Auth-user deletions and two absence read-backs, made no Storage/RPC probes, and wrote one redacted `unexpected-status`/`proven` receipt. Identity mismatch invoked the same authorized flow with valid disposable fixed-handle files, exited 1 with `drift`, left both credential-access and curl request logs empty, and emitted no untrusted identity. Success emitted exactly seven authenticated `2xx` entries plus one denied `4xx`/`USUARIO_NAO_AUTORIZADO` entry with no duplicates. No network, staging run, service/timer operation, or external activation occurred. |
| Rollback boundary | Revert the approved-or-unavailable identity serialization in `scripts/validate-slice2-hosted-receipt.sh` and the three PR3B-1 runtime cases in `tests/unit/slice2-hosted-receipt-harness.test.ts`; preserve PR3A credential/password behavior, prior PR3B status/cleanup behavior, PR3B-2 audit evidence, and all PR4 work. |
| Review budget | This bounded runner/harness slice is below 400 authored lines; no scheduler, timer, retention, installer, rollback, or external activation artifact changed. |

## PR3B-1 Chain Context

`main ← PR1 ← PR2 ← PR3A ← 📍 PR3B-1 runtime coverage ← PR3B-2 boundary evidence ← PR4 external`

Mode: stacked-to-main. This work unit ends at local runner/harness receipt
contracts. PR4 scheduler/timer rollback and external activation remain deferred.

## PR3 Acceptance Reconciliation — Artifact-only (2026-07-14)

This reconciliation refreshed only local evidence and task state. It did not
contact staging or production, install/enable/start a service or timer, access
credentials, create fixtures, apply migrations, or modify external resources.

### Task Audit

| Task | Result | Exact evidence |
|---|---|---|
| 3.1 Deterministic static boundary evidence | **Accepted — amended criterion** | The refreshed `pr3b-boundary-evidence.md` declares the owned-path manifest, SHA-256 hashes of current manifest inputs, static current-line estimate (166 lines), and rollback boundary. It explicitly discloses that this is non-Git evidence and does not prove historic ownership, changed lines, or a Git delta. Prior local-only focused harness evidence remains `npx vitest run tests/unit/slice2-hosted-receipt-harness.test.ts tests/unit/slice2-systemd-receipt-pipeline.test.ts tests/unit/slice2-pr3b-boundary-audit.test.ts` — exit 0; 3 files, 32 tests passed. No code or external operation was performed for this amendment. |
| 3.2 PR3 rollback boundary and PR4 deferral | **Accepted** | PR3 rollback is limited to `scripts/validate-slice2-hosted-receipt.sh`, `ops/systemd/run-slice2-receipt`, and their focused tests. `ops/systemd/` contains no PR3 receipt, manifest, or retention unit; scheduler install/disable, retention, timers, and external rollback/runtime scenarios remain PR4-only. |

### Deterministic Static Boundary Evidence

The refreshed receipt is a declared static manifest: named owned paths, current-byte
SHA-256 values, and current line counts. Its 166-line estimate covers only the two
hashed PR3B-2 implementation inputs; the generated evidence document is excluded to
avoid a self-referential hash. This is not a changed-line count. No Git command or
Git-derived classification is used for the amended acceptance criterion.

### TDD Cycle Evidence

| Task | RED | GREEN | REFACTOR |
|---|---|---|---|
| Deterministic boundary timestamp | Added a `SOURCE_DATE_EPOCH=1784064646` expectation; focused audit test failed because the report had no timestamp. | Added validated epoch formatting in the audit script; focused audit test passed. | Kept the timestamp dependency explicit and external; no production receipt behavior changed. |

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | `npx vitest run tests/unit/slice2-hosted-receipt-harness.test.ts tests/unit/slice2-systemd-receipt-pipeline.test.ts tests/unit/slice2-pr3b-boundary-audit.test.ts` — exit 0; 3 files, 32 tests passed. |
| Runtime harness command/scenario and exact result | N/A — this user-approved amendment is artifact-only and changes neither executable behavior nor an integration boundary. The current manifest was refreshed with local SHA-256 and line-count reads only; no Git, service, network, credential, staging, or production operation occurred. |
| Rollback boundary | Revert only the PR3B static-boundary acceptance text in `openspec/changes/staging-slice2-receipt-pipeline/{specs/staging-slice2-receipt-pipeline/spec.md,design.md,tasks.md,apply-progress.md,pr3b-boundary-evidence.md}`; receipt runner/wrapper behavior and all external state remain untouched. |

### Current Acceptance State

- [x] 3.1 is satisfied under the user-approved amended criterion: deterministic static manifest, current-byte hashes, declared owned paths, non-delta line estimate, rollback boundary, and explicit non-Git limitation.
- [x] 3.2 is satisfied with a PR3 runner/wrapper/tests-only rollback boundary and explicit PR4 deferral.

## PR4 External Enablement Attempt (2026-07-14)

### TDD Cycle Evidence

| Task | Test file | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 4.1 | `tests/unit/slice2-systemd-external-enablement.test.ts` | Unit/static systemd contract | `slice2-systemd-receipt-pipeline`: 3/3 passed | Two tests failed: units and installer were absent | Focused 2 files, 5 tests passed; full `npm run test:unit` passed 34 files, 198 tests | Separate receipt/manifest/retention hardening and approval/retention assertions | Kept units and installer minimal; no secrets or `Environment=` lines |
| 4.2 | N/A | External staging smoke | N/A | N/A | **Blocked** before activation: missing encrypted publishable credential | N/A | N/A |

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | `npx vitest run tests/unit/slice2-systemd-external-enablement.test.ts tests/unit/slice2-systemd-receipt-pipeline.test.ts` — exit 0; 2 files, 5 tests passed. |
| Full required command | `npm run test:unit` — exit 0; 34 files, 198 tests passed. |
| Runtime harness command/scenario and exact result | `sudo ./ops/systemd/install-slice2-receipt-pipeline.sh --approve-staging-ref=mhoqwjatrendnhfnwewv` — exit 1 before daemon reload/enablement: `missing encrypted staging credentials`. No smoke, Auth DML, fixture, receipt, or network request occurred. |
| Rollback boundary | Disable/stop the two timers and three oneshots; remove only `/etc/systemd/system/asados-slice2-{receipt,manifest,retention}.{service,timer}`, `/usr/local/lib/asados/{repo,prune-slice2-receipts}`, and the PR4 runbook; reload systemd. Preserve credentials and any receipts. |

### External State and Rollback

The installer copied preliminary unit files but failed before `systemctl daemon-reload` or timer enablement because the required encrypted staging-publishable credential file is absent. Rollback was executed: both timers report `not-found`, PR4 units/scripts/docs were removed, and daemon reload completed. The credential bootstrap and production remain untouched. The failure also exposed source-unit verification ordering; RED coverage now requires payload installation before source verification. Installed-unit verification remains pending the missing credential bootstrap. `RuntimeMaxSec` was removed because systemd ignores it for `Type=oneshot`; `TimeoutStartSec=10m` remains the effective bound.

## PR4 Authorized Credential Provisioning Retry (2026-07-14)

The executor received authorization to provision the missing staging publishable
credential and rerun PR4. Strict-TDD safety-net tests ran first and passed:
`npx vitest run tests/unit/slice2-systemd-external-enablement.test.ts tests/unit/slice2-systemd-receipt-pipeline.test.ts`
returned exit 0 (2 files, 5 tests). `sudo -n` is available. Non-secret metadata
then confirmed the publishable credential path is absent and all PR4 timers and
oneshots are `not-found`/not enabled.

Provisioning is blocked before any host write because this executor has no secure
stdin channel to pass the supplied secret-like value directly into
`systemd-creds encrypt`; placing it in a command, environment, temporary file,
shell history, repository artifact, or persistent memory would violate the
authorized handling boundary. No installer was rerun, no unit was installed or
enabled, no staging smoke was executed, and production was not accessed.

### PR4 Retry TDD Cycle Evidence

| Task | Test file | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 4.2 operational retry | `tests/unit/slice2-systemd-{external-enablement,receipt-pipeline}.test.ts` | Unit/static systemd contract | Existing focused suite: 2 files, 5 tests passed | N/A — no production-code change is permitted or needed for a credential-only host operation | Preconditions validated; no implementation changed | Existing tests separately cover unit hardening and installer approval boundary | None — blocked before secure credential ingress |

### PR4 Retry Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | `npx vitest run tests/unit/slice2-systemd-external-enablement.test.ts tests/unit/slice2-systemd-receipt-pipeline.test.ts` — exit 0; 2 files, 5 tests passed. |
| Runtime harness command/scenario and exact result | Host metadata preflight confirmed the encrypted publishable credential is absent; all PR4 timers/oneshots are not found and no Slice 2 unit is enabled. The local source verification command did not reach a clean result because the uninstalled retention helper is intentionally non-executable in the repository; installer validation applies executable permissions to its installed payload before verifying installed units. No staging runtime boundary was entered. |
| Rollback boundary | No new external state exists. If a future attempt enables PR4 timers before a smoke failure, disable/stop `asados-slice2-manifest.timer` and `asados-slice2-retention.timer`, stop the three PR4 oneshots, remove only their installed PR4 units/scripts/runbook, and daemon-reload; preserve credentials and receipts. |

### PR4 Retry Status

- [ ] 4.2 remains blocked pending a secure stdin-capable credential-provisioning channel.
- [x] Production hard-block retained: no production target, credential, unit, service, timer, or network operation was used.

## PR4 Publishable Credential Bootstrap Extension (2026-07-14)

Added a separate root-only `staging-publishable` bootstrap path without changing
the reviewed `staging-secret` service, provisioner, installer, or runbook. The
new one-shot service prompts only through masked `systemd-ask-password`, streams
directly into host-key encryption, and may write only the encrypted credential
store and password-agent request path. Rotation encrypts a root-only temporary
replacement before making a same-filesystem hard-link backup, atomically
publishing it, and removing the backup. Failure removes only temporary output and
retains the old credential.

No credential value was provisioned or handled. No installer was run, unit
installed, service/timer started, staging accessed, or production touched.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 5.1 | `tests/unit/slice2-systemd-credential-bootstrap.test.ts` | Unit/runtime shell double | `npx vitest run tests/unit/slice2-systemd-credential-bootstrap.test.ts` — 10/10 passed | Added the publishable-bootstrap contract first; it failed with `ENOENT` because the service/provisioner/installer/runbook did not exist | Same focused command — exit 0; 13/13 passed after the separate artifacts were added | Prompt failure retains `active-ciphertext`; success atomically replaces it with `replacement-ciphertext`, both through the publishable provisioner and disposable command doubles | None needed; the existing secret bootstrap remains separate and unchanged |

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | `npx vitest run tests/unit/slice2-systemd-credential-bootstrap.test.ts` — exit 0; 1 file, 13 tests passed. |
| Runtime harness command/scenario and exact result | Focused Vitest sourced the publishable provisioner with disposable credential directories and local `systemd-ask-password`/`systemd-creds` doubles. A failed prompt exited 1 with the active ciphertext retained; success exited 0 with replacement ciphertext active and no `.revoked` backup. No service, credential value, network, staging, or production boundary was used. |
| Systemd syntax validation | `bash -n ops/systemd/provision-slice2-staging-publishable && bash -n ops/systemd/install-slice2-staging-publishable-bootstrap.sh && systemd-analyze verify ops/systemd/asados-slice2-staging-publishable-bootstrap.service` — exit 0. |
| Rollback boundary | Remove only `ops/systemd/{asados-slice2-staging-publishable-bootstrap.service,provision-slice2-staging-publishable,install-slice2-staging-publishable-bootstrap.sh,slice2-staging-publishable-bootstrap.md}` and the focused test additions. Preserve all `staging-secret` artifacts, credentials, host key, receipt units, and application behavior. |
| Review budget | This bounded PR4 credential-bootstrap slice is under 400 authored changed lines when isolated from unrelated dirty workspace changes. |

## PR4 External Enablement Retry — Critical Installer Validation Failure (2026-07-14)

Both required encrypted staging credential files were verified by metadata only as
regular `root:root` mode-`0600` files; their contents were never read. The staging
approval argument was exact and the production ref was never contacted. The strict
TDD suite passed before host operations, but the reviewed installer failed before
timer enablement because its installed-unit verification expands
`/etc/systemd/system/asados-slice2-{receipt,manifest,retention}.{service,timer}`.
That includes the nonexistent `asados-slice2-receipt.timer`, for which
`systemd-analyze verify` returns `Unit asados-slice2-receipt.timer not found.`

Per the critical-failure boundary, the attempt stopped immediately. Rollback
disabled/stopped the two timers and three oneshots, removed only installed PR4
units, payloads, and runbook, and daemon-reloaded. It deliberately preserved both
encrypted credentials and any pre-existing state. No manual staging smoke, fixture,
receipt, lock acquisition, retention run, Auth DML, or production access occurred.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 4.2 operational enablement | Existing PR4 contracts | Unit + systemd integration | `npm run test:unit` — exit 0; 34 files, 201 tests | Not applicable: no source change was authorized after the host validation failure | **Failed:** installer stopped at missing `asados-slice2-receipt.timer` before enablement | Existing static test covers approval/hardening but did not exercise the installed unit set | None; no source was changed |

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | `npm run test:unit` — exit 0; 34 files, 201 tests passed. |
| Runtime harness command/scenario and exact result | `sudo -n ./ops/systemd/install-slice2-receipt-pipeline.sh --approve-staging-ref=mhoqwjatrendnhfnwewv` — exit 1: `Unit asados-slice2-receipt.timer not found.` No timer was enabled and no staging request was made. |
| Credential metadata | Both `/etc/credstore.encrypted/asados.slice2.{staging-secret,staging-publishable}.cred` are regular `root:root` mode-`0600` files. Contents were not read. |
| Rollback verification | Both timers: `not-found`; receipt, manifest, and retention services: `LoadState=not-found`, `ActiveState=inactive`, `SubState=dead`; daemon reload completed. |
| Retention configuration | Not installed/enabled after rollback; no retention execution occurred. |
| Smoke/cleanup/lock evidence | N/A — no smoke began, so no fixture, receipt, cleanup, or lock was created. |
| Rollback boundary | Only `/etc/systemd/system/asados-slice2-{receipt,manifest,retention}.service`, `/etc/systemd/system/asados-slice2-{manifest,retention}.timer`, `/usr/local/lib/asados/{repo,prune-slice2-receipts}`, and the PR4 runbook were removed. Encrypted credentials were preserved. |

### Status

- [ ] 4.2 historical attempt failed at the installer validation defect; correction 4.2a below changes no external state and does not authorize a retry.
- [x] Production hard-block retained: no production target, credential, service, timer, network request, or DML was used.

## PR4 Bounded Installer Validation Correction (2026-07-14)

The installer now uses one explicit `SYSTEMD_UNITS` list for both source-unit and
installed-unit validation: the receipt, manifest, and retention services plus the
manifest and retention timers. It cannot generate `asados-slice2-receipt.timer`.
The fail-closed validation sequence and external rollback boundary are unchanged.
No installer execution, service/timer enablement, retention run, staging smoke, or
external request occurred during this correction.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 4.2a | `tests/unit/slice2-systemd-external-enablement.test.ts` | Unit/static installer contract | `npx vitest run tests/unit/slice2-systemd-external-enablement.test.ts` — exit 0; 1 file, 2 tests passed | Added exact-list contract first; it failed because `SYSTEMD_UNITS` was absent (1 failed, 2 passed) | `bash -n ops/systemd/install-slice2-receipt-pipeline.sh && npx vitest run tests/unit/slice2-systemd-external-enablement.test.ts` — exit 0; 1 file, 3 tests passed | Added independent source/installed shared-list contract; same command exit 0; 1 file, 4 tests passed | None needed; the named list removes duplication and preserves the existing fail-closed sequence. |

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | `bash -n ops/systemd/install-slice2-receipt-pipeline.sh && npx vitest run tests/unit/slice2-systemd-external-enablement.test.ts` — exit 0; 1 file, 4 tests passed. |
| Runtime harness command/scenario and exact result | N/A — this is a static installer-list correction and the requested boundary forbids external installation and staging smoke. The focused test reads the actual installer and shipped unit artifacts. |
| Rollback boundary | Revert only `ops/systemd/install-slice2-receipt-pipeline.sh`, `tests/unit/slice2-systemd-external-enablement.test.ts`, and this PR4 correction evidence/task entry. The existing fail-closed rollback behavior, encrypted credentials, host state, and pending 4.2 installation remain untouched. |

### Status

- [x] 4.2a installer validation correction completed locally.
- [ ] 4.2 remains pending a separately authorized installation, timer enablement, and one staging smoke.

## PR4 Authorized External Enablement Retry — Credential Handle Failure (2026-07-14)

Strict unit validation completed before host work: `npm run test:unit` exited 0
with 34 files and 203 tests passed. Metadata-only preflight confirmed both
encrypted staging credential files as regular `root:root` mode-`0600` files;
their contents were not read. The corrected installer completed, systemd was
reloaded, and the manifest and retention timers were each enabled and active.

Exactly one manual start of `asados-slice2-receipt.service` was attempted. It
failed before runner execution with systemd status `243/CREDENTIALS`: the
encrypted secret credential's embedded name did not match the required
`staging-secret` handle. No receipt or fixture was created, no lock was
acquired, no cleanup lifecycle or retention execution ran, no Auth DML occurred,
and no production target was accessed.

The failure boundary was applied immediately: both timers were disabled and
stopped; all three PR4 oneshots were stopped; only the five installed PR4 units,
payloads, runbook, and empty PR4 state directories were removed; systemd was
reloaded and the failed service state reset. The encrypted credential files were
preserved and revalidated by metadata only.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 4.2a installer correction | `tests/unit/slice2-systemd-external-enablement.test.ts` | Unit/static installer contract | Historical focused baseline 2/2 passed | Exact five-unit list test failed before the correction | Historical focused correction command passed 4/4 | Source and installed-list contracts independently reject a generated receipt timer | None needed |
| 4.2 authorized operational retry | Existing PR4 contracts | Systemd integration | `npm run test:unit` — exit 0; 34 files, 203 tests passed | N/A — deployment-only retry; no production code changed | **Failed closed:** one manual smoke exited `243/CREDENTIALS` before runner execution | Installer, installed-unit, timer-state, and single-smoke boundaries were separately observed | None; rollback was performed without modifying source |

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | `npm run test:unit` — exit 0; 34 files, 203 tests passed. |
| Credential metadata preflight | Both encrypted staging files were regular, non-symlink, `root:root`, mode `0600`; contents were not read. |
| Install / installed-unit / timer result | Corrected installer exited 0. Explicit daemon reload plus `systemd-analyze verify` of the exact five installed units exited 0. Manifest and retention timers were `enabled`, `loaded`, and `active` before the smoke. |
| Runtime harness command/scenario and exact result | Exactly one `systemctl start asados-slice2-receipt.service` attempt failed before runner execution: `Result=exit-code`, `ExecMainStatus=243`; sanitized journal category: encrypted credential embedded-name/handle mismatch. |
| Receipt, cleanup, lock, and retention | No receipt was written, lock entries were `0`, and no fixture/cleanup lifecycle or retention execution occurred because systemd rejected credentials before `ExecStart`. Retention configuration had been enabled at `04:02`, `Persistent=true`, with a regular-file-only 30-day helper; it was disabled and removed on failure. |
| Rollback proof | Both timers were disabled/stopped; all PR4 units report `LoadState=not-found`, inactive/dead after daemon reload and failed-state reset; PR4 payload and empty state root are absent. Both encrypted credential files remain regular `root:root` mode-`0600` files. |
| Rollback boundary | Only `/etc/systemd/system/asados-slice2-{receipt,manifest,retention}.service`, `/etc/systemd/system/asados-slice2-{manifest,retention}.timer`, `/usr/local/lib/asados/{repo,prune-slice2-receipts}`, the PR4 runbook, and empty PR4 state directories were removed. Encrypted credentials and all non-PR4 host/application state were preserved. |

### Status

- [ ] 4.2 remains blocked pending an authorized, handle-correct encrypted credential replacement or bootstrap repair.
- [x] Production hard-block retained: `xvzdxoktwnzmxsfizkxo` was not contacted or modified.

## PR4 Bounded Credential Embedded-Name Correction (2026-07-14)

Both bootstrap provisioners now pass `systemd-creds encrypt --with-key=host` the
same embedded credential handles that receipt units load and the wrapper reads:
`staging-secret` and `staging-publishable`. The encrypted filenames deliberately
remain `asados.slice2.staging-secret.cred` and
`asados.slice2.staging-publishable.cred`; filename and embedded credential name
are separate systemd concepts.

No credential was read, provisioned, or logged. No installer, service, timer,
receipt runner, staging request, fixture, Auth DML, retention operation, or
production operation was run.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 5.2 | `tests/unit/slice2-systemd-credential-bootstrap.test.ts` | Unit/static + local shell-double | `npx vitest run tests/unit/slice2-systemd-credential-bootstrap.test.ts tests/unit/slice2-systemd-receipt-pipeline.test.ts tests/unit/slice2-systemd-external-enablement.test.ts` — exit 0; 3 files, 20 tests passed | Added the cross-artifact exact-handle test first; it failed because the secret provisioner embedded `asados.slice2.staging-secret` rather than `staging-secret` (1 failed, 13 passed) | After both provisioner name corrections, `npx vitest run tests/unit/slice2-systemd-credential-bootstrap.test.ts` — exit 0; 1 file, 14 tests passed | The test proves separate secret and publishable encryption names, both receipt-unit `LoadCredentialEncrypted` mappings, and both wrapper paths | None needed; only the two embedded-name literals changed and duplicate legacy assertions were aligned |

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | `npx vitest run tests/unit/slice2-systemd-credential-bootstrap.test.ts tests/unit/slice2-systemd-receipt-pipeline.test.ts tests/unit/slice2-systemd-external-enablement.test.ts` — exit 0; 3 files, 21 tests passed. |
| Runtime harness command/scenario and exact result | `npx vitest run tests/unit/slice2-systemd-credential-bootstrap.test.ts` — exit 0; 1 file, 14 tests passed. Its disposable local shell-double rotation scenarios source both provisioners, prove prompt failure preserves ciphertext and success atomically replaces it; no secret, host service, or network boundary is used. |
| Syntax and unit validation | `bash -n ops/systemd/provision-slice2-staging-secret && bash -n ops/systemd/provision-slice2-staging-publishable && systemd-analyze verify ops/systemd/asados-slice2-credential-bootstrap.service ops/systemd/asados-slice2-staging-publishable-bootstrap.service` — exit 0. |
| Rollback boundary | Revert only the two `--name` literals, their focused test assertions, and the three Slice 2 bootstrap/receipt runbook clarifications. Existing credential files, host key, installed units, external state, and the blocked 4.2 smoke remain untouched. |

### Status

- [x] 5.2 embedded-name correction completed locally.
- [ ] 4.2 remains blocked until the approved staging host has bootstrapped both corrected credentials again; no retry was authorized or performed in this work unit.

## PR4 Authorized External Enablement Retry — Runner Authorization Environment Failure (2026-07-14)

Both corrected encrypted credential artifacts passed metadata-only validation as nonempty,
regular, non-symlink `root:root` mode-`0600` files. `npm run test:unit` passed before
host work (34 files, 204 tests). The corrected installer completed, systemd was explicitly
reloaded, the exact five installed units validated, and the manifest and retention timers
were enabled and active.

Exactly one manual `asados-slice2-receipt.service` start was attempted. It passed the
immutable staging target guard and both fixed credential-handle checks, then the runner
emitted one schema-allowlisted, redacted `failure` receipt: `unexpected-status`,
`not_started` cleanup, and zero scenario statuses. This is a fail-closed runner
authorization configuration defect: the receipt unit does not set
`RECEIPT_EXECUTION=authorized`, which the reviewed runner requires before fixture work.
No fixture was created, no direct Auth DML occurred, no production target was contacted,
no cleanup lifecycle or retention run occurred, and the lock directory was empty after the
attempt.

Per the approved failure boundary, the rollback disabled/stopped both timers, stopped the
three PR4 oneshots, removed only the five newly installed PR4 unit files, PR4 payloads,
runbook, and empty state directories, daemon-reloaded, and reset failed state. It preserved
both encrypted credentials and the redacted failure receipt. No second smoke was run.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 4.2 authorized deployment retry | Existing PR4 contracts | Systemd integration | `npm run test:unit` — exit 0; 34 files, 204 tests passed | N/A — deployment-only work, no source change | **Failed closed:** one permitted manual smoke produced `unexpected-status` before fixture work | Installer, five-unit verification, timer activation, credential-handle reachability, and receipt schema were independently observed | None — source remains unchanged; no unapproved retry occurred |

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | `npm run test:unit` — exit 0; 34 files, 204 tests passed. |
| Credential metadata | Both encrypted credentials were nonempty regular, non-symlink `root:root` mode-`0600` files; contents were not read. |
| Install / daemon reload / timer result | `sudo -n ./ops/systemd/install-slice2-receipt-pipeline.sh --approve-staging-ref=mhoqwjatrendnhfnwewv` completed; explicit daemon reload and exact five-unit verification completed; manifest and retention timers were enabled and active. |
| Runtime harness command/scenario and exact result | One `systemctl start asados-slice2-receipt.service` attempt failed. It reached target and credential checks, then wrote one redacted `failure` receipt with `unexpected-status`, `cleanup: not_started`, and zero scenario statuses because `RECEIPT_EXECUTION=authorized` is absent from the unit. |
| Required status / cleanup / lock evidence | No required scenario status was reached, so success is not claimed. No fixture or cleanup lifecycle began; receipt JSON used the exact allowlisted schema and passed URL, host, and fixture-identifier redaction checks; lock entries after completion: `0`. |
| Retention evidence | Timer configuration was enabled/active before the smoke (`04:02`, `Persistent=true`); no retention execution occurred before failure. It was disabled and removed by rollback. |
| Rollback boundary | Only `/etc/systemd/system/asados-slice2-{receipt,manifest,retention}.service`, `/etc/systemd/system/asados-slice2-{manifest,retention}.timer`, `/usr/local/lib/asados/{repo,prune-slice2-receipts}`, the PR4 runbook, and empty PR4 state directories were removed. Both encrypted credentials and the redacted receipt were preserved. |

### Status

- [ ] 4.2 remains blocked: add a tested `RECEIPT_EXECUTION=authorized` receipt-unit contract, reinstall, and obtain explicit authorization for another smoke.
- [x] Production hard-block retained: no production target, credential, service, timer, network request, or DML was used.

## PR4 Bounded Receipt Authorization Environment Correction (2026-07-14)

The shipped manual receipt unit now declares exactly
`Environment=RECEIPT_EXECUTION=authorized`. This is a non-secret execution gate
for the approved manual staging path, not credential material. The manifest and
retention services and timers do not declare that value, so scheduled/retention
paths cannot accidentally authorize fixture execution. The installer already
copies and verifies the exact receipt unit in its shared five-unit list; its
behavior was not changed.

No installer execution, unit reload, service/timer enablement, retention run,
credential access, staging request, fixture/Auth DML, production access, or
manual smoke was run in this correction.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 4.2b | `tests/unit/slice2-systemd-external-enablement.test.ts` | Unit/static installed-unit contract | `npx vitest run tests/unit/slice2-systemd-external-enablement.test.ts` — exit 0; 1 file, 4 tests passed | Added the exact manual-unit authorization test first; it failed because `asados-slice2-receipt.service` did not contain `Environment=RECEIPT_EXECUTION=authorized` (1 failed, 4 passed) | `npx vitest run tests/unit/slice2-systemd-external-enablement.test.ts && systemd-analyze verify ops/systemd/asados-slice2-receipt.service` — exit 0; 1 file, 5 tests passed; unit verification passed | The test separately rejects the authorization value in manifest service, retention service, manifest timer, and retention timer | Replaced the prior blanket no-`Environment=` assertion with a secret-bearing environment prohibition; the exact non-secret gate remains independently asserted |

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | `npx vitest run tests/unit/slice2-systemd-external-enablement.test.ts && systemd-analyze verify ops/systemd/asados-slice2-receipt.service` — exit 0; 1 file, 5 tests passed; source receipt unit verification passed. |
| Runtime harness command/scenario and exact result | N/A — the bounded correction changes a shipped systemd environment declaration and the requested boundary prohibits install, reload, enablement, retention, and smoke operations. The local static contract reads the shipped receipt/manifest/retention services and both timers. |
| Rollback boundary | Revert only `ops/systemd/asados-slice2-receipt.service`, `tests/unit/slice2-systemd-external-enablement.test.ts`, `ops/systemd/slice2-receipt-pipeline.md`, and this task/progress entry. The installer, credentials, existing redacted failure receipt, host state, and all non-PR4 behavior remain untouched. |

### Status

- [x] 4.2b authorization-environment correction completed locally.
- [ ] 4.2 remains pending reinstallation and one manual staging smoke, each requiring explicit approval after this correction.
- [x] Production hard-block retained: no production target, credential, service, timer, network request, or DML was used.

## PR4 Corrected Reinstallation Preflight — Persistent-Timer Safety Block (2026-07-15)

The user authorized corrected PR4 reinstallation, timer enablement, and exactly one
manual staging smoke. Before changing host state, this executor verified both encrypted
credential artifacts by metadata only: each is a non-symlink regular `root:root` file
with mode `0600`; the successful secret and publishable bootstrap oneshots retain
`Result=success` and `ExecMainStatus=0`. Credential contents were not read.

The focused local safety-net suite passed (3 files, 45 tests), and all relevant shell
scripts parsed. No PR4 unit is currently installed or enabled. The reinstallation did
not proceed because the reviewed installer uses `systemctl enable --now` for the
manifest timer. Its `OnCalendar=03:17`, `Persistent=true` configuration has already
missed today's calendar event. systemd therefore triggers the manifest service
immediately when the timer is activated. That creates an unapproved automatic receipt
attempt in addition to the one manual smoke, violating the exact-one-manual-smoke
authorization and the automatic-eligibility boundary. No host state was changed, so
no rollback was required.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 4.2 corrected operational retry | Existing PR4 contracts | Unit/static + deployment preflight | `npx vitest run tests/unit/slice2-hosted-receipt-harness.test.ts tests/unit/slice2-systemd-external-enablement.test.ts tests/unit/slice2-systemd-credential-bootstrap.test.ts` — 45/45 passed | N/A — no source change was authorized or made | Preflight blocked before installer invocation; no deployment GREEN can be claimed | Independent credential metadata, unit absence, local tests, and documented systemd persistent-timer behavior all agree | None — changing the installer would require a new RED/GREEN work unit and explicit authorization |

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | `npx vitest run tests/unit/slice2-hosted-receipt-harness.test.ts tests/unit/slice2-systemd-external-enablement.test.ts tests/unit/slice2-systemd-credential-bootstrap.test.ts` — exit 0; 3 files, 45 tests passed. `bash -n ops/systemd/install-slice2-receipt-pipeline.sh && bash -n ops/systemd/run-slice2-receipt && bash -n scripts/validate-slice2-hosted-receipt.sh && bash -n ops/systemd/prune-slice2-receipts` — exit 0. |
| Credential metadata | Secret: regular `root:root` mode `0600`, 199 bytes, SHA-256 `858b420bb3e60577ce92b176bb0c4fd80484cdc69a6f4b84bfc2701f1ad40c2e`; publishable: regular `root:root` mode `0600`, 203 bytes, SHA-256 `f02e57245f653d513648ae28b11e2d32b57347ba8534f0ac3fd44501f6df6274`. Both bootstrap oneshots: `Result=success`, `ExecMainStatus=0`. No plaintext was read. |
| Runtime harness command/scenario and exact result | N/A — deliberately not run. `asados-slice2-manifest.timer` is `OnCalendar=*-*-* 03:17:00`, `RandomizedDelaySec=15m`, `Persistent=true`; systemd documents that a persistent `OnCalendar` timer immediately triggers a missed service when activated. At this time, installer `enable --now` would cause an automatic manifest receipt in addition to the one authorized manual smoke. |
| Unit/timer state | All five PR4 unit files are absent; both PR4 timers are `not-found`. Existing receipt directory is root-owned mode `0700`; locks and state directories are absent. |
| Retention configuration | Source config remains `asados-slice2-retention.timer` at `04:02`, `Persistent=true`; its helper deletes only non-symlink regular files under receipt/lock roots older than 30 days. It is not installed or enabled. |
| Rollback boundary | No newly installed PR4 state exists; nothing was rolled back. Credentials, prior receipt directory, application state, and production were preserved. If a corrected deployment is later authorized, rollback remains limited to the five PR4 unit files, `/usr/local/lib/asados/{repo,prune-slice2-receipts}`, the PR4 runbook, and newly empty PR4 state directories; preserve credentials and receipts. |

### Status

- [ ] 4.2 blocked before reinstallation: the installer must be made safe against a missed persistent manifest timer before an exact-one-manual-smoke deployment can be executed.
- [x] Production hard-block retained: no production target, credential, network request, service, timer, Auth DML, fixture, receipt execution, lock acquisition, cleanup lifecycle, or retention execution occurred.

## PR4 Staged Timer Enablement Correction (2026-07-15)

The installer now installs, daemon-reloads, and validates the exact five PR4 units without enabling or starting the manifest or retention timer. The runbook requires an explicitly separate `systemctl enable --now` action only after the authorized manual smoke succeeds and its complete redacted receipt is inspected. Existing rollback remains unchanged: disable/stop both timers and oneshots, remove only PR4 installed artifacts, daemon-reload, and preserve credentials and receipts.

No external installation, daemon reload, timer enablement, service start, retention run, staging smoke, credential access, fixture/Auth DML, network request, or production operation was performed.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 4.2c | `tests/unit/slice2-systemd-external-enablement.test.ts` | Unit/static installer and runbook contract | `npx vitest run tests/unit/slice2-systemd-external-enablement.test.ts` — exit 0; 1 file, 5 tests passed | Added staged-enable contract first; it failed because the installer contained `systemctl enable --now asados-slice2-manifest.timer asados-slice2-retention.timer` | `bash -n ops/systemd/install-slice2-receipt-pipeline.sh && npx vitest run tests/unit/slice2-systemd-external-enablement.test.ts` — exit 0; 1 file, 6 tests passed | Separate assertions reject installer `enable --now` and `start`, while the runbook must prohibit timer activation during install and require the exact separate command after smoke success | None needed; removing the activation line leaves the validation sequence minimal and the runbook states the operational handoff explicitly |

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | `bash -n ops/systemd/install-slice2-receipt-pipeline.sh && npx vitest run tests/unit/slice2-systemd-external-enablement.test.ts` — exit 0; 1 file, 6 tests passed. |
| Runtime harness command/scenario and exact result | N/A — external install/smoke are explicitly forbidden for this bounded static correction. The focused test reads the real installer and runbook; source `systemd-analyze verify` is not an applicable substitute because the retention unit intentionally references its installed-only executable path. |
| Rollback boundary | Revert only `ops/systemd/install-slice2-receipt-pipeline.sh`, `ops/systemd/slice2-receipt-pipeline.md`, `openspec/changes/staging-slice2-receipt-pipeline/design.md`, `tests/unit/slice2-systemd-external-enablement.test.ts`, and this task/progress evidence. Existing external rollback behavior, encrypted credentials, receipts, and non-PR4 state remain untouched. |

### Status

- [x] 4.2c staged timer-enablement correction completed locally.
- [ ] 4.2 remains pending a separately authorized installation, one manual staging smoke, and only-after-success explicit timer enablement.
- [x] Production hard-block retained: no production target, credential, network request, service, timer, Auth DML, fixture, receipt execution, lock acquisition, cleanup lifecycle, or retention execution occurred.

## PR4 User-Authorized Staged Installation and Single Manual Smoke (2026-07-15)

The user authorized one staged installation and exactly one manual staging smoke, with
production immutable and both timers required to remain disabled. The focused strict-TDD
safety net passed before host changes: `npx vitest run
tests/unit/slice2-hosted-receipt-harness.test.ts
tests/unit/slice2-systemd-external-enablement.test.ts
tests/unit/slice2-systemd-credential-bootstrap.test.ts` exited 0 with 3 files and 46
tests passed; all four PR4 shell scripts parsed with `bash -n`.

Metadata-only preflight confirmed the two encrypted credential artifacts are regular
`root:root` mode-`0600` files (secret: 199 bytes; publishable: 203 bytes). Both bootstrap
oneshots retain `Result=success` and `ExecMainStatus=0`; their expected `inactive/dead`
state was not treated as a failure. Contents were never read.

The approved installer completed, systemd was explicitly daemon-reloaded, and
`systemd-analyze verify` accepted the exact five installed PR4 units. Before the manual
start, both `asados-slice2-manifest.timer` and `asados-slice2-retention.timer` were
`UnitFileState=disabled`, `ActiveState=inactive`, and `SubState=dead`. No timer was
enabled or started. The installed receipt unit supplied only the non-secret
`RECEIPT_EXECUTION=authorized` execution gate, the immutable staging ref/identity, and
the two fixed encrypted credential handles. The manifest unit maps the same two handles
but does not receive the manual authorization gate.

Exactly one `systemctl start asados-slice2-receipt.service` was issued. It failed with
`Result=exit-code`, `ExecMainCode=1`, and `ExecMainStatus=1`. The latest receipt was
parsed only as allowlisted redacted JSON: `outcome=failure`,
`category=cleanup-incomplete`, `trigger=manual`,
`target_identity=staging:mhoqwjatrendnhfnwewv`, `cleanup=incomplete`, and
`scenario_statuses=[]`. The lock directory had zero entries immediately after the
attempt. This is not success evidence: no required scenario status or cleanup proof was
present in the receipt.

The authorized failure rollback disabled/stopped timers (which had never been enabled),
retention helper, and runbook, then daemon-reloaded and reset failed state. The source
credentials remain regular `root:root` mode-`0600` files and were not read. The receipt
directory was preserved (2 redacted receipt files); the lock directory is absent. All
three PR4 services now report `LoadState=not-found`, `ActiveState=inactive`, and
`SubState=dead`; both timers report `not-found`. Production was not contacted or changed,

### TDD Cycle Evidence

| Task | Test file | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 4.2 staged operational attempt | Existing PR4 contracts | Systemd integration | `npx vitest run` focused 3 files — 46/46 passed | N/A — user-authorized deployment only; no source changed | **Failed closed:** exactly one manual smoke returned a redacted `cleanup-incomplete` receipt | Credential metadata, exact unit verification, disabled/inactive timers, installed unit inputs, receipt schema, and lock absence were independently checked | None — rollback removed only installed PR4 artifacts; no source change was made |

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | `npx vitest run tests/unit/slice2-hosted-receipt-harness.test.ts tests/unit/slice2-systemd-external-enablement.test.ts tests/unit/slice2-systemd-credential-bootstrap.test.ts` — exit 0; 3 files, 46 tests passed. `bash -n` on installer, wrapper, runner, and retention helper — exit 0. |
| Runtime harness command/scenario and exact result | `sudo -n systemctl start asados-slice2-receipt.service` was issued exactly once after staged installation. It returned failure; service result `exit-code`, `ExecMainCode=1`, `ExecMainStatus=1`. Latest allowlisted redacted receipt: failure / `cleanup-incomplete` / `incomplete` / zero scenario statuses. |
| Timer safety evidence | Before the single manual start, both installed timers were explicitly `disabled`, `inactive`, and `dead`. Neither was enabled or started; after failure rollback they are absent. |
| Runner input evidence | Installed receipt unit declares `Environment=RECEIPT_EXECUTION=authorized`, immutable staging ref/identity, and the two exact `LoadCredentialEncrypted` handles. No credential content was read or emitted. |
| Cleanup and lock evidence | Receipt cleanup is `incomplete`, so success is not claimed. `/var/lib/asados/slice2/locks` had zero entries after the attempt and is absent after rollback. |
| Rollback boundary | Removed only `/etc/systemd/system/asados-slice2-{receipt,manifest,retention}.service`, `/etc/systemd/system/asados-slice2-{manifest,retention}.timer`, `/usr/local/lib/asados/{repo,prune-slice2-receipts}`, and `/usr/local/share/doc/asados/slice2-receipt-pipeline.md`; removed empty locks/state directories; preserved encrypted credentials and redacted receipts. |

### Status

- [ ] 4.2 remains incomplete: the single authorized smoke failed closed with redacted `cleanup-incomplete` evidence, so timers remain disabled and no separate enablement action was taken.
- [x] Production hard-block retained: no production target, credential, timer, service, network request, or direct Auth DML was used.

## Failed-Receipt Residual Fixture Remediation — Fail-Closed Attribution Block (2026-07-15)

The user authorized staging-only targeted residual-fixture verification/remediation
for failed receipt `20260715T101439-2528497`, while prohibiting normal receipt
smoke, timer activation, production access, and unrelated-data deletion. The
preflight preserved that boundary: the receipt is a redacted manual failure for
`staging:mhoqwjatrendnhfnwewv` with `cleanup-incomplete`, `cleanup=incomplete`,
and no scenario statuses; the receipt/manifest/retention units and both timers are
currently `not-found` and inactive.

Remediation stopped before creating a temporary root systemd unit, decrypting or
reading credentials, contacting Supabase, listing users, querying tables, deleting
objects/records/users/sessions, or creating a new receipt. The receipt intentionally
contains no fixture UUIDs, object paths, pending-cleanup IDs, or user IDs. The runner
creates random UUID-based user emails (`slice2-{role}-{uuid}@invalid.example`) and
product/object identifiers; neither is deterministically derivable from the receipt
timestamp. A query for all Auth users or all similarly marked historical fixtures
would exceed the user's attribution boundary. Therefore the known marker and timestamp
cannot uniquely establish that any candidate belongs to this exact failed attempt.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Targeted residual remediation | Existing receipt/PR4 contracts | Unit/static + host-state preflight | `npx vitest run tests/unit/slice2-hosted-receipt-harness.test.ts tests/unit/slice2-systemd-external-enablement.test.ts` — exit 0; 2 files, 32 tests passed | N/A — no safe implementation exists without an attributable identifier; no production code was written | Blocked before remote execution; no GREEN claimed | Receipt schema, runner fixture generation, unit/timer state, and journal agree that attribution is insufficient | None — no code or host artifact changed |

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | `npx vitest run tests/unit/slice2-hosted-receipt-harness.test.ts tests/unit/slice2-systemd-external-enablement.test.ts` — exit 0; 2 files, 32 tests passed. |
| Runtime harness command/scenario and exact result | N/A — deliberately not run. A temporary root-only cleanup unit would require a query path that cannot identify only this failed receipt's random UUID fixtures. No credentials, remote API, staging data, or production boundary was accessed. |
| Attribution evidence | Receipt `20260715T101439-2528497` is manual/staging-only and reports `cleanup-incomplete`; it excludes all resource IDs. Runner source confirms random UUID fixture identifiers and marker-only names. |
| Deletion/absence evidence | Not available by design: no candidate can be attributed uniquely, so no deletion or absence claim is made. |
| Unit/timer and temporary-artifact cleanup | No temporary cleanup unit/wrapper was created. `asados-slice2-{receipt,manifest,retention}` units and both timers are `not-found`/inactive. |
| Production guard | Production ref `xvzdxoktwnzmxsfizkxo` was not accessed; no production credential, network request, DML, service, or timer operation occurred. |
| Rollback boundary | No external or source artifact was created; no rollback is required. |

### Status

- [ ] Targeted residual fixture remediation blocked fail-closed pending an exact, non-secret attribution map for receipt `20260715T101439-2528497` (fixture user IDs, product ID, object paths, and pending-cleanup IDs) or an explicitly authorized, independently scoped forensic query.
- [x] Normal receipt smoke was not run; PR4 timers remain disabled/uninstalled and production remains immutable.
