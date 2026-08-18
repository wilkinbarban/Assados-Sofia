import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const protectedProjectRef = 'xvzdxoktwnzmxsfizkxo'
const projectRoot = new URL('../', import.meta.url)
const requiredEnvironment = ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD']
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name])

function abort(reason) {
  process.stderr.write(`migration-runner:${reason}\n`)
  process.exit(2)
}

function redact(output) {
  const sensitiveValues = requiredEnvironment.map((name) => process.env[name]).filter(Boolean).sort((a, b) => b.length - a.length)
  return sensitiveValues.reduce((safeOutput, value) => safeOutput.replaceAll(value, '[REDACTED]'), output)
}

if (missingEnvironment.length > 0) {
  abort(`missing-required-environment:${missingEnvironment.join(',')}`)
}

if (process.env.SUPABASE_PROJECT_REF !== protectedProjectRef) {
  abort('project-ref-mismatch')
}

const linkedProjectRef = readFileSync(new URL('supabase/.temp/project-ref', projectRoot), 'utf8').trim()
if (linkedProjectRef !== protectedProjectRef) {
  abort('linked-project-ref-mismatch')
}

const apply = process.argv.includes('--apply')
if (apply && process.env.SUPABASE_MIGRATION_APPLY !== 'AUTHORIZED') {
  abort('apply-authorization-missing')
}

const executable = process.env.SUPABASE_CLI_BIN || 'supabase'
const args = ['db', 'push', '--linked', ...(apply ? [] : ['--dry-run'])]
const childEnvironment = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== 'SUPABASE_WORKDIR'))
const result = spawnSync(executable, args, {
  cwd: projectRoot,
  encoding: 'utf8',
  env: childEnvironment,
})

if (result.error) {
  abort('cli-execution-failed')
}

process.stdout.write(redact(result.stdout || ''))
process.stderr.write(redact(result.stderr || ''))
process.exit(result.status ?? 1)
