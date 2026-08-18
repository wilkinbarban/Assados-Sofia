import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const systemd = (...parts: string[]) => join(root, 'ops', 'systemd', ...parts)
const read = (...parts: string[]) => readFileSync(systemd(...parts), 'utf8')

describe('Slice 2 external enablement', () => {
  it('defines separate hardened receipt, manifest, and retention units with fixed encrypted handles', () => {
    for (const name of ['asados-slice2-receipt.service', 'asados-slice2-manifest.service', 'asados-slice2-retention.service']) {
      expect(existsSync(systemd(name))).toBe(true)
      const unit = read(name)
      expect(unit).toContain('NoNewPrivileges=true')
      expect(unit).toContain('ProtectSystem=strict')
      expect(unit).toContain('ReadWritePaths=/var/lib/asados/slice2/receipts /var/lib/asados/slice2/locks /var/lib/asados/slice2/state')
    }
    for (const name of ['asados-slice2-receipt.service', 'asados-slice2-manifest.service']) {
      const unit = read(name)
      expect(unit).toContain('Environment=SLICE2_LOCK_ROOT=/run/asados/slice2')
      expect(unit).toContain('RuntimeDirectory=asados/slice2')
      expect(unit).toContain('RuntimeDirectoryMode=0700')
      expect(unit).toContain('RuntimeDirectoryPreserve=yes')
      expect(unit).toContain('LoadCredentialEncrypted=staging-secret:/etc/credstore.encrypted/asados.slice2.staging-secret.cred')
      expect(unit).toContain('LoadCredentialEncrypted=staging-publishable:/etc/credstore.encrypted/asados.slice2.staging-publishable.cred')
      expect(unit).not.toMatch(/Environment=.*(?:SECRET|KEY|CREDENTIAL)/)
    }
    expect(read('asados-slice2-manifest.timer')).toContain('OnCalendar=*-*-* 03:17:00')
    expect(read('asados-slice2-retention.timer')).toContain('OnCalendar=*-*-* 04:02:00')
    expect(read('../../scripts/validate-slice2-hosted-receipt.sh')).toContain('write_success_fingerprint')
  })

  it('installs only after an exact staging approval and retention refuses links while preserving fresh receipts', () => {
    const installer = read('install-slice2-receipt-pipeline.sh')
    const retention = read('prune-slice2-receipts')
    expect(installer).toContain('--approve-staging-ref=mhoqwjatrendnhfnwewv')
    expect(installer).not.toContain('systemctl enable --now asados-slice2-manifest.timer asados-slice2-retention.timer')
    expect(installer).toContain('systemd-analyze verify')
    expect(installer).toContain('systemd-analyze security --offline=yes')
    expect(installer.indexOf('for path in')).toBeLessThan(installer.indexOf('systemd-analyze verify "$source_directory/$file"'))
    expect(retention).toContain('find "$directory" -xdev -type f ! -type l -mtime +30 -print0')
    expect(retention).toContain('! -type l')
    expect(read('slice2-receipt-pipeline.md')).toContain('xvzdxoktwnzmxsfizkxo')
  })

  it('validates exactly the shipped PR4 services and timers, never a generated unit name', () => {
    const installer = read('install-slice2-receipt-pipeline.sh')
    const match = installer.match(/readonly SYSTEMD_UNITS=\(\n([\s\S]*?)\n\)/)

    expect(match?.[1].match(/asados-slice2-[\w-]+\.(?:service|timer)/g)).toEqual([
      'asados-slice2-receipt.service',
      'asados-slice2-manifest.service',
      'asados-slice2-retention.service',
      'asados-slice2-manifest.timer',
      'asados-slice2-retention.timer',
    ])
    expect(match?.[1]).not.toContain('asados-slice2-receipt.timer')
    for (const unit of match?.[1].match(/asados-slice2-[\w-]+\.(?:service|timer)/g) ?? []) {
      expect(existsSync(systemd(unit))).toBe(true)
    }
  })

  it('uses the explicit validation list for both source and installed unit verification', () => {
    const installer = read('install-slice2-receipt-pipeline.sh')

    expect(installer).toContain('for file in "${SYSTEMD_UNITS[@]}"; do systemd-analyze verify "$source_directory/$file"')
    expect(installer).toContain('systemd-analyze verify "${SYSTEMD_UNITS[@]/#//etc/systemd/system/}"')
    expect(installer).not.toContain('asados-slice2-{receipt,manifest,retention}.{service,timer}')
  })

  it('authorizes both receipt flows and shares successful fingerprint state', () => {
    const receipt = read('asados-slice2-receipt.service')
    const manifest = read('asados-slice2-manifest.service')
    const retention = read('asados-slice2-retention.service')

    expect(receipt).toMatch(/^Environment=RECEIPT_EXECUTION=authorized$/m)
    expect(manifest).toMatch(/^Environment=RECEIPT_EXECUTION=authorized$/m)
    expect(receipt).toContain('PRIOR_SUCCESS_FINGERPRINT_FILE=/var/lib/asados/slice2/state/prior-success-fingerprint')
    expect(manifest).toContain('PRIOR_SUCCESS_FINGERPRINT_FILE=/var/lib/asados/slice2/state/prior-success-fingerprint')
    expect(retention).not.toContain('RECEIPT_EXECUTION=authorized')
    expect(read('asados-slice2-manifest.timer')).not.toContain('RECEIPT_EXECUTION=authorized')
    expect(read('asados-slice2-retention.timer')).not.toContain('RECEIPT_EXECUTION=authorized')
  })

  it('installs and validates timers without activating them before a separately authorized staged enablement', () => {
    const installer = read('install-slice2-receipt-pipeline.sh')
    const runbook = read('slice2-receipt-pipeline.md')

    expect(installer).not.toMatch(/systemctl\s+enable\s+--now\s+asados-slice2-(?:manifest|retention)\.timer/)
    expect(installer).not.toMatch(/systemctl\s+start\s+asados-slice2-(?:manifest|retention)\.timer/)
    expect(runbook).toContain('do not enable or start either timer')
    expect(runbook).toContain('sudo systemctl enable --now asados-slice2-manifest.timer asados-slice2-retention.timer')
    expect(runbook).toContain('Only after manual smoke success')
    expect(runbook).toContain('/var/lib/asados/slice2/state/prior-success-fingerprint')
    expect(runbook).toContain('a changed valid fingerprint can run the authorized flow')
  })
})
