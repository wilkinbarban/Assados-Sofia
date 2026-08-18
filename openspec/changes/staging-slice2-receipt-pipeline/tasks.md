# Tasks: Staging Slice 2 Receipt Pipeline — PR3 Verification Remediation

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | PR3B contracts 220–320; boundary evidence 60–100 |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR3B contract remediation → PR3B boundary evidence; PR4 remains deferred |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 3B-1 | Close receipt-contract blockers | PR3B, ≤320 lines | `npx vitest run tests/unit/slice2-hosted-receipt-harness.test.ts` | local curl/filesystem doubles; no network | runner and harness only |
| 3B-2 | Produce deterministic static boundary evidence | PR3B, ≤100 lines, no commit | static manifest refresh | N/A — artifact-only; no runtime resource | audit script, manifest, evidence only |

## Phase 1: Non-Commit Boundary Evidence

- [x] 1.1 Create `scripts/audit-slice2-pr3b-boundary.sh` and a scoped manifest that documents the absent pre-change snapshot and separates declared PR3A/PR3B paths from unrelated dirty paths.
- [x] 1.2 Run the audit against the dirty workspace; write sanitized current-byte hashes, non-delta line-count estimates, limitation, and PR3B-only rollback scope to `openspec/changes/staging-slice2-receipt-pipeline/pr3b-boundary-evidence.md`. Do not create commits.

## Phase 2: PR3B Runtime Receipt Contracts

- [x] 2.1 RED: in `tests/unit/slice2-hosted-receipt-harness.test.ts`, make password-grant failure prove exit 1, no later probes, attempted user deletion/read-back, and a redacted failure receipt.
- [x] 2.2 GREEN: verified the existing password-grant failure path cleans up and closes fail-safe without a production change.
- [x] 2.3 RED: exercise a mismatched `STAGING_TARGET_IDENTITY`; require `drift`, no curl/fixture request, and a redacted preflight receipt.
- [x] 2.4 RED: require the successful local lifecycle double receipt to equal the complete eight-entry allowlist: seven authenticated `2xx` entries and denied `4xx`/`USUARIO_NAO_AUTORIZADO`, with no duplicates.
- [x] 2.5 GREEN: redact mismatched target identity from the failure receipt while retaining exact allowlisted success evidence.

## Phase 3: PR3 Acceptance and PR4 Deferral

- [x] 3.1 Record refreshed deterministic static boundary evidence in `apply-progress.md`: declared owned paths, SHA-256 hashes of current manifest inputs, current non-delta line estimate, rollback boundary, and an explicit non-Git limitation. **Amended acceptance (user-approved):** a pre-change Git delta, Git-derived ownership assertion, and historical changed-line count are not required and MUST NOT be claimed. **Evidence (2026-07-14):** `pr3b-boundary-evidence.md` records the refreshed manifest and its static 166-line input estimate; focused local harness evidence remains 3 files, 32 tests passed from the prior local-only receipt verification.
- [x] 3.2 Accept PR3 only for runner/wrapper/tests rollback; keep scheduler install/disable, retention, timer, and external rollback runtime scenarios exclusively in PR4. **Evidence (2026-07-14):** focused local suite passed (3 files, 32 tests); `ops/systemd/` contains no Slice 2 receipt/timer/retention unit, only the credential-bootstrap unit and fixed `run-slice2-receipt` wrapper; no external action occurred.

## Phase 4: External Enablement

- [x] 4.1 RED/GREEN: add staging-only hardened receipt, manifest, and 30-day retention units/timers, fixed encrypted credential handles, target guard, installer, runbook, and local validation contracts.
- [ ] 4.2 Install, daemon-reload, and validate units; run one authorized manual staging smoke; only after that smoke succeeds, perform a separate explicit timer-enable action. **Authorized retry (2026-07-14) failed closed:** corrected installation and both timer enablements succeeded, then exactly one manual receipt start failed before runner execution with sanitized `CREDENTIALS` setup failure: the encrypted secret credential's embedded name does not match its expected handle. All newly installed PR4 units, payloads, timers, state directories, and failed-unit state were removed; both encrypted credentials were preserved by metadata only. No receipt, fixture, Auth DML, production access, cleanup lifecycle, lock acquisition, or retention execution occurred. **Second authorized retry (2026-07-14):** after both ciphertexts were reencrypted with exact embedded handles, full unit tests passed, metadata-only preflight passed, corrected installation/reload/five-unit verification completed, and both timers were enabled/active. Exactly one manual receipt start reached the runner and emitted one allowlisted redacted `failure` receipt with `category: unexpected-status`, `cleanup: not_started`, and zero scenario statuses. This exposed the missing `RECEIPT_EXECUTION=authorized` unit environment required by the runner. The target guard and both credential handles were reached before the failure; no fixture/Auth DML, production access, cleanup lifecycle, lock residue, or retention execution occurred. The failure rollback removed only the newly installed five PR4 units, timers, payloads, runbook, and empty directories; both encrypted credentials remain regular root-owned `0600` files. No second smoke was run. **Staged retry (2026-07-15):** the corrected installer installed/reloaded/validated all five units while both timers remained `disabled` and `inactive`; only one manual receipt start was issued. The runner received the authorized execution gate, immutable staging target, and both encrypted credential handles, but its redacted receipt failed with `cleanup-incomplete`, `cleanup: incomplete`, and `scenario_statuses: []`. Lock removal was proven. Per the authorized failure boundary, all installed PR4 units/payloads were removed and credentials plus redacted receipts were preserved; no timer was enabled or started, and no production operation occurred.
  - [x] 4.2a RED/GREEN correction: replace installer brace-expansion validation with the exact five shipped PR4 unit names (three services plus manifest/retention timers). Focused static tests prove source and installed verification share that list and exclude `asados-slice2-receipt.timer`; no installation, enablement, or smoke was run.
  - [x] 4.2b RED/GREEN correction: set only `asados-slice2-receipt.service` to `Environment=RECEIPT_EXECUTION=authorized` for the approved manual staging path. Focused static contracts prove the receipt unit carries the exact value while manifest/retention services and timers cannot authorize execution; no installation, enablement, retention run, or smoke was run.
  - [x] 4.2c RED/GREEN correction: installer installs, daemon-reloads, and validates the five PR4 units but does not enable/start manifest or retention timers. The runbook requires the separate explicit `systemctl enable --now` action only after manual smoke success; focused static contracts exclude installer timer activation and preserve rollback. No external installation or smoke was run.

## Phase 5: Publishable Credential Bootstrap Extension

- [x] 5.1 RED/GREEN: add a separate root-only, masked, host-key-encrypted `staging-publishable` bootstrap service, provisioner, installer, runbook, and local rotation/sandbox contracts. Preserve the existing `staging-secret` flow; do not provision a value, install units, start services, access staging, or touch production.
- [x] 5.2 RED/GREEN: correct both bootstrap provisioners so `systemd-creds --name` embeds the exact receipt-consumer handles `staging-secret` and `staging-publishable`, while retaining separate credential filenames. Add cross-artifact provisioner/unit/wrapper assertions and runbook guidance. No provisioning, installation, service start, or staging access.
