# Slice 2 staging publishable credential bootstrap

This root-only, one-shot bootstrap prompts locally for the staging publishable
key using masked `systemd-ask-password`, then streams it directly to
`systemd-creds encrypt --with-key=host`. It stores only host-key ciphertext at
`/etc/credstore.encrypted/asados.slice2.staging-publishable.cred`. Its embedded
`systemd-creds --name` handle is exactly `staging-publishable`; the credential
filename intentionally remains separate.

The service has no boot enablement. Its strict sandbox may write only the
credential store and the systemd password-agent request socket. Do not place the
value in a shell command, environment variable, repository file, log, or service
unit.

## Provision or rotate locally

Run only on the approved staging host:

```bash
sudo ./ops/systemd/install-slice2-staging-publishable-bootstrap.sh
```

The installer validates the provisioner and source/installed unit, then starts
the one-shot service. The prompt is local and masked. On prompt or encryption
failure, the temporary ciphertext is removed and the old encrypted credential
remains active. On success, the replacement is atomically published and its
temporary hard-link backup is removed.

## Rollback

If no credential was provisioned, remove only the installed publishable bootstrap
unit, provisioner, and documentation, then run `systemctl daemon-reload`. Do not
remove the staging-secret bootstrap, its credential, the host credential key, or
receipt-pipeline units. Preserve an existing encrypted publishable credential
unless an authorized rotation procedure replaces it.
