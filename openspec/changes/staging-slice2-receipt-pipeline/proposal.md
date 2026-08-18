# Proposal: Staging Slice 2 Receipt Pipeline

## Intent

Replace the disposable, direct-Auth-DML receipt harness with an auditable, fail-closed receipt pipeline for one dedicated persistent staging project. It must prove Slice 2 authenticated Storage/RPC behavior and denied-role handling without risking production, exposing secrets, or accepting partial evidence.

## Goals and Scope

### In Scope
- A staging runner contract: target guard, manifest fingerprint, single-run lock, bounded execution, cleanup proof, and redacted receipt output.
- Manual execution plus manifest-triggered eligibility; manual runs always execute, automatic runs execute only after a changed declared validation scope.
- Admin-API fixture lifecycle, normal password grant, authenticated and denied-role receipt scenarios.
- Unit contracts for staging-only, redaction, trigger, cleanup, and fail-closed behavior.

### First-Slice Boundary
- Implement only the runner skeleton, fingerprint/receipt contract, and unit tests (under the 400-line review budget). No remote execution or VPS configuration.

### Out of Scope / Explicit Exclusions
- Creating projects, altering staging/production data, applying migrations, direct `auth.*` SQL, `psql`, CLI key lookup, or systemd configuration.
- Secrets in the repository, OpenSpec, chat, process arguments, logs, `.env`, or `Environment=`.
- Production credentials, production targets, application-product behavior changes, CI, and a path-unit trigger.

## Capabilities

### New Capabilities
- `staging-slice2-receipt-pipeline`: Staging-only, redacted, fail-closed operational receipt validation for Slice 2.

### Modified Capabilities
- None. Existing `estoque` and `autenticacao` behavior is exercised, not changed.

## Approach and Boundaries

Use a dedicated persistent staging ref guarded against production/unset/mismatched targets. A declared manifest hashes Slice 2 migrations, `src/app/actions/estoque.ts`, runner, and receipt contracts. The runner creates isolated fixtures through the Admin API, uses only a normal password grant for sessions, executes scenarios, and cleans up in `finally`; any ambiguity, unexpected status, lock, or incomplete cleanup fails the receipt.

Future operations use one `Type=oneshot` VPS service and a manifest-aware timer. Root-managed encrypted systemd credential files are read only by the service; public requests use only the staging publishable key. Receipts outside the repo record only non-secret identity, revision, fingerprint, status classes, sanitized categories, and cleanup outcome.

## Expected Artifact Locations

| Area | Impact | Description |
|---|---|---|
| `scripts/validate-slice2-hosted-receipt.sh` | Modified | Staging runner skeleton |
| `tests/unit/slice2-hosted-receipt-harness.test.ts` | Modified | Safety contracts |
| `openspec/changes/staging-slice2-receipt-pipeline/` | Modified | SDD artifacts |
| VPS service credential/receipt paths | Future, outside repo | Operational-only setup |

## Risks and Rollback

| Risk | Mitigation |
|---|---|
| Staging drift or Auth failure | Stop, retain redacted failure category; never repair/retry implicitly |
| Credential or evidence leakage | Restrictive service-owned files; redact by construction |

Revert the runner and tests; disable future timer/service externally. Existing disposable/manual flow remains unchanged until a separately authorized cutover.

## Dependencies
- Separately authorized persistent staging, release/bootstrap procedure, encrypted credentials, service/timer deployment, and retention policy.

## Success Criteria
- [ ] First slice has unit-proven target, manifest, redaction, lock, cleanup, and fail-closed contracts.
- [ ] No secret, production target, project lifecycle, migration, or systemd change is introduced.
- [ ] Later authorized receipt produces complete redacted evidence or a failed receipt—never partial success.
