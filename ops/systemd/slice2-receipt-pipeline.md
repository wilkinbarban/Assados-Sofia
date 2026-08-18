# Slice 2 Staging Receipt Pipeline

This is staging-only. The installer accepts only `mhoqwjatrendnhfnwewv`; production `xvzdxoktwnzmxsfizkxo` is never an approved target.

## Staged install, smoke, and enablement

After encrypted bootstrap, run `sudo ./ops/systemd/install-slice2-receipt-pipeline.sh --approve-staging-ref=mhoqwjatrendnhfnwewv`. It installs, reloads, and validates the units only; do not enable or start either timer during this stage. The manual and automatic manifest services set the non-secret exact gate `RECEIPT_EXECUTION=authorized`; retention remains unable to authorize fixture execution.

Run the separately authorized manual staging smoke and inspect its complete redacted receipt. Its success seeds `/var/lib/asados/slice2/state/prior-success-fingerprint`; unchanged automatic fingerprints remain skipped, while a changed valid fingerprint can run the authorized flow. Only after manual smoke success, perform the separate explicit enablement action: `sudo systemctl enable --now asados-slice2-manifest.timer asados-slice2-retention.timer`. Do not start another manual smoke without explicit approval for that single staging attempt.

The encrypted credential filenames remain
`asados.slice2.staging-secret.cred` and
`asados.slice2.staging-publishable.cred`, while their embedded systemd credential
handles must be exactly `staging-secret` and `staging-publishable`. If bootstrap
artifacts are corrected or rotated, rebootstrap both credentials before another
receipt-pipeline installation attempt.

Inspect the service journal and newest JSON in `/var/lib/asados/slice2/receipts`. A successful receipt has seven authenticated `2xx` statuses, one denied `4xx` `USUARIO_NAO_AUTORIZADO`, `cleanup: proven`, and no lock directory. Retention deletes only regular receipt/lock files older than 30 days.

## Rollback

On critical failure run `sudo systemctl disable --now asados-slice2-manifest.timer asados-slice2-retention.timer`, stop the oneshots, remove only installed Slice 2 receipt files, then `sudo systemctl daemon-reload`. Preserve receipts. Do not alter credentials, run Auth SQL, use `psql`, or access production.
