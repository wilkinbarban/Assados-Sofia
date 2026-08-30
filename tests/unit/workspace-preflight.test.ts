import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const wrapper = join(root, 'scripts/workspace-preflight.sh')

function run(args: string[], env: NodeJS.ProcessEnv = {}) {
  return execFileSync(wrapper, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
}

describe('workspace preflight', () => {
  it('provisions a private home-backed workspace and exports it to commands', () => {
    const home = mkdtempSync(join(tmpdir(), 'asados-home-'))
    const output = run(['run', '--', 'bash', '-c', 'printf "%s|%s|%s|%s" "$TMPDIR" "$TMP" "$TEMP" "$npm_config_cache"'], {
      HOME: home,
      ASADOS_PREFLIGHT_MIN_FREE_BYTES: '0',
      ASADOS_PREFLIGHT_MIN_FREE_INODES: '0',
    })

    const [tmpdirPath, tmpPath, tempPath, npmCache] = output.split('|')
    expect(tmpdirPath).toBe(join(home, '.cache/asados/workspace/tmp'))
    expect(tmpPath).toBe(tmpdirPath)
    expect(tempPath).toBe(tmpdirPath)
    expect(npmCache).toBe(join(home, '.cache/asados/workspace/npm-cache'))
  })

  it.each([
    ['tmp', 'ASADOS_PREFLIGHT_TEST_FORCE_MKDIR_FAILURE_TARGET', 'could not create workspace directory'],
    ['npm-cache', 'ASADOS_PREFLIGHT_TEST_FORCE_MKDIR_FAILURE_TARGET', 'could not create workspace directory'],
    ['tmp', 'ASADOS_PREFLIGHT_TEST_FORCE_CHMOD_FAILURE_TARGET', 'could not set private workspace permissions'],
    ['npm-cache', 'ASADOS_PREFLIGHT_TEST_FORCE_CHMOD_FAILURE_TARGET', 'could not set private workspace permissions'],
  ])('reports EDQUOT/quota guidance when run-mode %s provisioning fails', (subdirectory, failureHook, reason) => {
    const home = mkdtempSync(join(tmpdir(), 'asados-home-'))
    const workspace = join(home, 'approved-workspace')

    expect(() => run(['run', '--', 'true'], {
      HOME: home,
      ASADOS_PREFLIGHT_WORKSPACE: workspace,
      ASADOS_PREFLIGHT_MIN_FREE_BYTES: '0',
      ASADOS_PREFLIGHT_MIN_FREE_INODES: '0',
      [failureHook]: subdirectory,
    })).toThrow(new RegExp(`target .*approved-workspace/${subdirectory}.*${reason}.*EDQUOT/quota.*Mitigation:`, 's'))
  })

  it('uses an explicitly configured workspace for checks', () => {
    const home = mkdtempSync(join(tmpdir(), 'asados-home-'))
    const workspace = join(home, 'approved-workspace')
    expect(run(['check'], {
      HOME: home,
      ASADOS_PREFLIGHT_WORKSPACE: workspace,
      ASADOS_PREFLIGHT_MIN_FREE_BYTES: '0',
      ASADOS_PREFLIGHT_MIN_FREE_INODES: '0',
    })).toBe('')
  })

  it('probes the nearest existing parent before creating a nested target', () => {
    const home = mkdtempSync(join(tmpdir(), 'asados-home-'))
    const target = join(home, 'missing', 'nested', 'workspace')

    expect(() => run(['check', target], {
      HOME: home,
      ASADOS_PREFLIGHT_MIN_FREE_BYTES: '0',
      ASADOS_PREFLIGHT_MIN_FREE_INODES: '0',
      ASADOS_PREFLIGHT_TEST_FORCE_PARENT_PROBE_FAILURE: '1',
    })).toThrow(new RegExp(`nearest existing parent ${home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
  })

  it('reports EDQUOT/quota recovery guidance when nested target creation fails', () => {
    const home = mkdtempSync(join(tmpdir(), 'asados-home-'))
    const target = join(home, 'missing', 'nested', 'workspace')

    expect(() => run(['check', target], {
      HOME: home,
      ASADOS_PREFLIGHT_MIN_FREE_BYTES: '0',
      ASADOS_PREFLIGHT_MIN_FREE_INODES: '0',
      ASADOS_PREFLIGHT_TEST_FORCE_MKDIR_FAILURE: '1',
    })).toThrow(/Workspace preflight failed for target .*missing\/nested\/workspace.*EDQUOT\/quota.*Mitigation:/s)
  })

  it('rejects failed write probes with EDQUOT recovery guidance', () => {
    const home = mkdtempSync(join(tmpdir(), 'asados-home-'))
    expect(() => run(['check'], {
      HOME: home,
      ASADOS_PREFLIGHT_MIN_FREE_BYTES: '0',
      ASADOS_PREFLIGHT_MIN_FREE_INODES: '0',
      ASADOS_PREFLIGHT_TEST_FORCE_PROBE_FAILURE: '1',
    })).toThrow(/EDQUOT|quota/)
  })

  it('routes test and Web build commands through the wrapper', () => {
    const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    expect(packageJson.scripts.test).toBe('scripts/workspace-preflight.sh run -- vitest run')
    expect(packageJson.scripts.build).toBe('scripts/workspace-preflight.sh run -- npm run build --workspace @asados/web')
  })

  it('relies on preflight to provision deployment state before locking', () => {
    const deploy = readFileSync(join(root, 'scripts/deploy-web.sh'), 'utf8')
    expect(deploy).toMatch(/workspace-preflight\.sh/)
    expect(deploy.indexOf('"$preflight" check "$state_root"')).toBeLessThan(deploy.indexOf('exec 9>"$state_root/deploy.lock"'))
    expect(deploy).not.toMatch(/^\s*mkdir -p(?:\s+--)?\s+"\$state_root"\s*$/m)
    expect(deploy).not.toMatch(/^\s*chmod 0700\s+"\$state_root"\s*$/m)
  })
})
