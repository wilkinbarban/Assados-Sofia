import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const servicePath = join(root, 'ops/systemd/asados-slice2-credential-bootstrap.service')
const installerPath = join(root, 'ops/systemd/install-slice2-credential-bootstrap.sh')
const provisionerPath = join(root, 'ops/systemd/provision-slice2-staging-secret')
const publishableServicePath = join(root, 'ops/systemd/asados-slice2-staging-publishable-bootstrap.service')
const publishableInstallerPath = join(root, 'ops/systemd/install-slice2-staging-publishable-bootstrap.sh')
const publishableProvisionerPath = join(root, 'ops/systemd/provision-slice2-staging-publishable')

function serviceUnit() {
  return readFileSync(servicePath, 'utf8')
}

function installer() {
  return readFileSync(installerPath, 'utf8')
}

function provisioner() {
  return readFileSync(provisionerPath, 'utf8')
}

function createRotationHarness(mode: 'prompt-failure' | 'encrypt-failure' | 'success') {
  const directory = mkdtempSync(join(tmpdir(), 'asados-credential-rotation-'))
  const commands = join(directory, 'commands')
  const credentialDirectory = join(directory, 'credentials')
  mkdirSync(commands)
  mkdirSync(credentialDirectory)

  writeFileSync(
    join(commands, 'systemd-ask-password'),
    mode === 'prompt-failure' ? '#!/usr/bin/env bash\nexit 1\n' : '#!/usr/bin/env bash\nprintf replacement\n',
  )
  writeFileSync(
    join(commands, 'systemd-creds'),
    mode === 'encrypt-failure'
      ? '#!/usr/bin/env bash\ncat >/dev/null\nexit 1\n'
      : '#!/usr/bin/env bash\ncat >/dev/null\n[[ -f "$ASADOS_TEST_ACTIVE_PATH" ]]\n[[ "$(cat "$ASADOS_TEST_ACTIVE_PATH")" == active-ciphertext ]]\nprintf replacement-ciphertext > "${@: -1}"\n',
  )
  writeFileSync(join(commands, 'install'), '#!/usr/bin/env bash\nmkdir -p "${@: -1}"\n')
  writeFileSync(join(commands, 'chown'), '#!/usr/bin/env bash\nexit 0\n')
  chmodSync(join(commands, 'systemd-ask-password'), 0o700)
  chmodSync(join(commands, 'systemd-creds'), 0o700)
  chmodSync(join(commands, 'install'), 0o700)
  chmodSync(join(commands, 'chown'), 0o700)

  return { credentialDirectory, commands, directory }
}

function rotateCredential(
  credentialDirectory: string,
  commands: string,
  provisioner = provisionerPath,
  credentialName = 'asados.slice2.staging-secret.cred',
) {
  return spawnSync(
    'bash',
    ['-c', 'source "$1"; rotate_credential "$2"', 'bash', provisioner, credentialDirectory],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        ASADOS_TEST_ACTIVE_PATH: join(
          credentialDirectory,
          credentialName,
        ),
        PATH: `${commands}:${process.env.PATH}`,
      },
    },
  )
}

describe('Slice 2 systemd credential bootstrap', () => {
  it('runs the provisioner as root with a private umask and no boot enablement', () => {
    const unit = serviceUnit()

    expect(unit).toContain('Type=oneshot')
    expect(unit).toContain('User=root')
    expect(unit).toContain('Group=root')
    expect(unit).toContain('UMask=0077')
    expect(unit).toContain('ExecStart=/usr/bin/bash /usr/local/lib/asados/provision-slice2-staging-secret')
    expect(unit).not.toContain('[Install]')
    expect(unit).not.toContain('Environment=')
  })

  it('uses a hidden systemd prompt and streams the secret into host-key encryption', () => {
    const script = provisioner()

    expect(script).toContain('systemd-ask-password --no-tty --echo=masked -n')
    expect(script).not.toContain('systemd-creds setup')
    expect(script).toContain('systemd-creds encrypt --with-key=host --name=staging-secret -')
    expect(script).toContain('rotate_credential /etc/credstore.encrypted')
    expect(script).toContain('credential_path="$credential_directory/asados.slice2.staging-secret.cred"')
    expect(serviceUnit()).not.toContain('Environment=')
    expect(script).not.toMatch(/echo\s+\$|printf\s+.*\$/)
  })

  it('validates source and installed units plus root-only modes before starting the prompt service', () => {
    const script = installer()

    expect(script).toContain('systemd-analyze verify "$source_unit"')
    expect(script).toContain('install -o root -g root -m 0700')
    expect(script).toContain('install -o root -g root -m 0644')
    expect(script).toContain('systemctl daemon-reload')
    expect(script).toContain('systemd-analyze verify "$installed_unit"')
    expect(script).toContain('systemctl start asados-slice2-credential-bootstrap.service')
    expect(script).not.toContain('systemctl enable')
  })

  it('initializes a missing host credential key before entering the sandbox', () => {
    const script = installer()

    expect(script).toContain('host_key=/var/lib/systemd/credential.secret')
    expect(script).toContain('if [[ ! -e "$host_key" ]]; then')
    expect(script).toContain('systemd-creds setup')
    expect(script).toContain('[[ -f "$host_key" ]]')
    expect(script.indexOf('systemd-creds setup')).toBeLessThan(
      script.indexOf('systemctl start asados-slice2-credential-bootstrap.service'),
    )
  })

  it('verifies an existing host credential key before entering the sandbox without regenerating it', () => {
    const script = installer()

    expect(script).toContain('if [[ ! -e "$host_key" ]]; then\n  systemd-creds setup\nfi')
    expect(script).toContain('[[ -f "$host_key" ]]')
    expect(serviceUnit()).toContain('ReadWritePaths=/etc/credstore.encrypted')
    expect(serviceUnit()).not.toContain('/var/lib/systemd/credentials')
    expect(serviceUnit()).not.toContain('/var/lib/systemd/credential.secret')
  })

  it('allows the password-agent request directory without weakening strict filesystem isolation', () => {
    const unit = serviceUnit()

    expect(unit).toContain(
      'ReadWritePaths=/etc/credstore.encrypted /run/systemd/ask-password',
    )
    expect(unit).not.toContain('ReadWritePaths=/run')
    expect(unit).not.toContain('/var/lib/systemd')
  })

  it.each(['prompt-failure', 'encrypt-failure'] as const)(
    'preserves the active credential when rotation has a %s',
    (mode) => {
      expect(provisioner()).toContain('function rotate_credential()')
      const harness = createRotationHarness(mode)
      const credentialPath = join(
        harness.credentialDirectory,
        'asados.slice2.staging-secret.cred',
      )
      writeFileSync(credentialPath, 'active-ciphertext')

      try {
        const result = rotateCredential(harness.credentialDirectory, harness.commands)

        expect(result.status).toBe(1)
        expect(readFileSync(credentialPath, 'utf8')).toBe('active-ciphertext')
        expect(existsSync(`${credentialPath}.revoked`)).toBe(false)
      } finally {
        rmSync(harness.directory, { force: true, recursive: true })
      }
    },
  )

  it('atomically replaces an active credential and removes its backup after a successful rotation', () => {
    const harness = createRotationHarness('success')
    const credentialPath = join(
      harness.credentialDirectory,
      'asados.slice2.staging-secret.cred',
    )
    writeFileSync(credentialPath, 'active-ciphertext')

    try {
      const result = rotateCredential(harness.credentialDirectory, harness.commands)

      expect(result.status).toBe(0)
      expect(readFileSync(credentialPath, 'utf8')).toBe('replacement-ciphertext')
      expect(existsSync(`${credentialPath}.revoked`)).toBe(false)
    } finally {
      rmSync(harness.directory, { force: true, recursive: true })
    }
  })

  it('instructs operators to rerun bootstrap and revoke or replace the invalid credential', () => {
    expect(installer()).toContain('Existing credential remains active until a successful hidden prompt encrypts and publishes its replacement.')
    expect(readFileSync(join(root, 'ops/systemd/slice2-credential-bootstrap.md'), 'utf8')).toContain(
      'Rerun\n`sudo ./ops/systemd/install-slice2-credential-bootstrap.sh`',
    )
    expect(readFileSync(join(root, 'ops/systemd/slice2-credential-bootstrap.md'), 'utf8')).toMatch(
      /preserve the active encrypted credential/,
    )
  })

  it('provides an isolated, masked publishable-key bootstrap without changing the staging-secret flow', () => {
    const publishableService = readFileSync(publishableServicePath, 'utf8')
    const publishableProvisioner = readFileSync(publishableProvisionerPath, 'utf8')
    const publishableInstaller = readFileSync(publishableInstallerPath, 'utf8')

    expect(publishableService).toContain('ExecStart=/usr/bin/bash /usr/local/lib/asados/provision-slice2-staging-publishable')
    expect(publishableService).toContain('ReadWritePaths=/etc/credstore.encrypted /run/systemd/ask-password')
    expect(publishableService).toContain('ProtectSystem=strict')
    expect(publishableService).not.toContain('Environment=')
    expect(publishableProvisioner).toContain('systemd-ask-password --no-tty --echo=masked -n')
    expect(publishableProvisioner).toContain('systemd-creds encrypt --with-key=host --name=staging-publishable -')
    expect(publishableProvisioner).toContain('credential_path="$credential_directory/asados.slice2.staging-publishable.cred"')
    expect(publishableProvisioner).not.toMatch(/echo\s+\$|printf\s+.*\$/)
    expect(publishableInstaller).toContain('systemd-analyze verify "$source_unit"')
    expect(publishableInstaller).toContain('systemctl start asados-slice2-staging-publishable-bootstrap.service')
    expect(publishableInstaller).not.toContain('systemctl enable')
    expect(readFileSync(join(root, 'ops/systemd/slice2-staging-publishable-bootstrap.md'), 'utf8')).toContain(
      'staging-publishable',
    )
    expect(provisioner()).toContain('--name=staging-secret')
  })

  it('uses exact systemd credential handles across bootstrap provisioners and receipt consumers', () => {
    const publishableProvisioner = readFileSync(publishableProvisionerPath, 'utf8')

    expect(provisioner()).toContain('systemd-creds encrypt --with-key=host --name=staging-secret -')
    expect(provisioner()).not.toContain('--name=asados.slice2.staging-secret')
    expect(publishableProvisioner).toContain('systemd-creds encrypt --with-key=host --name=staging-publishable -')
    expect(publishableProvisioner).not.toContain('--name=asados.slice2.staging-publishable')

    for (const unitName of ['asados-slice2-receipt.service', 'asados-slice2-manifest.service']) {
      const unit = readFileSync(join(root, 'ops/systemd', unitName), 'utf8')
      expect(unit).toContain('LoadCredentialEncrypted=staging-secret:/etc/credstore.encrypted/asados.slice2.staging-secret.cred')
      expect(unit).toContain('LoadCredentialEncrypted=staging-publishable:/etc/credstore.encrypted/asados.slice2.staging-publishable.cred')
    }

    const wrapper = readFileSync(join(root, 'ops/systemd/run-slice2-receipt'), 'utf8')
    expect(wrapper).toContain('$CREDENTIALS_DIRECTORY/staging-secret')
    expect(wrapper).toContain('$CREDENTIALS_DIRECTORY/staging-publishable')
  })

  it.each(['prompt-failure', 'success'] as const)(
    'preserves or atomically replaces the publishable credential on %s',
    (mode) => {
      const harness = createRotationHarness(mode)
      const credentialPath = join(
        harness.credentialDirectory,
        'asados.slice2.staging-publishable.cred',
      )
      writeFileSync(credentialPath, 'active-ciphertext')

      try {
        const result = rotateCredential(
          harness.credentialDirectory,
          harness.commands,
          publishableProvisionerPath,
          'asados.slice2.staging-publishable.cred',
        )

        expect(result.status).toBe(mode === 'success' ? 0 : 1)
        expect(readFileSync(credentialPath, 'utf8')).toBe(
          mode === 'success' ? 'replacement-ciphertext' : 'active-ciphertext',
        )
        expect(existsSync(`${credentialPath}.revoked`)).toBe(false)
      } finally {
        rmSync(harness.directory, { force: true, recursive: true })
      }
    },
  )
})
