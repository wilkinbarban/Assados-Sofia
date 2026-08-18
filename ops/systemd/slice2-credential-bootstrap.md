# Slice 2 staging credential bootstrap

This manual-only provisioning unit accepts one staging secret key through the
local systemd password-agent flow, with masked input and no appended newline. It streams the value to
`systemd-creds encrypt --with-key=host`; plaintext is never written to a file,
unit, environment variable, argument, log, or receipt.

The encrypted credential is installed at
`/etc/credstore.encrypted/asados.slice2.staging-secret.cred`, owned by root and
mode `0600`. Its embedded `systemd-creds --name` handle is exactly
`staging-secret`; the credential filename intentionally remains separate. Before starting the sandboxed unit, the installer checks for
`/var/lib/systemd/credential.secret` and runs `systemd-creds setup` only when it
is absent. It then verifies that the result is a regular file. This first-run
host-key initialization happens outside `ProtectSystem=strict`; the service is
therefore limited to writing only `/etc/credstore.encrypted` and does not get a
general or additional `/var/lib/systemd` write exception. Host-key encryption
intentionally binds the credential to this VPS.

Run `sudo ./ops/systemd/install-slice2-credential-bootstrap.sh` from the
repository checkout. It validates the provisioner and unit syntax, installs
root-owned artifacts, checks modes, reloads systemd, validates the installed
unit, and then starts the bootstrap service. The service is deliberately not
enabled: provisioning must not prompt during boot.

After a failed bootstrap, preserve the active encrypted credential and investigate
the prompt or encryption failure. Rerun
`sudo ./ops/systemd/install-slice2-credential-bootstrap.sh`; the provisioner
first writes and validates replacement ciphertext in a root-only temporary file.
Only then does it create a root-only `.revoked` hard-link backup, atomically
replace the configured credential, and remove that backup. A failed prompt or
encryption removes only the temporary output, leaving the active credential at
the configured path unchanged.

No receipt runner, timer, Supabase request, migration, fixture, or Auth DML is
started by this work unit. A later service may use
`LoadCredentialEncrypted=staging-secret:/etc/credstore.encrypted/asados.slice2.staging-secret.cred` only after its separate
authorization and validation.

To roll back, stop and remove the installed unit and provisioner, reload
systemd, and securely rotate the staging secret key. Removing the encrypted
credential alone prevents any future consumer from obtaining the key. Leave the
host key in place: it may protect unrelated systemd credentials; removing it
would invalidate them.
