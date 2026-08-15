import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const nginxConfig = fs.readFileSync(path.resolve(process.cwd(), 'nginx.conf'), 'utf8')

function locationBlock(location: string): string {
  const marker = `location ${location} {`
  const start = nginxConfig.indexOf(marker)
  if (start < 0) return ''

  let depth = 0
  for (let index = start; index < nginxConfig.length; index += 1) {
    if (nginxConfig[index] === '{') depth += 1
    if (nginxConfig[index] === '}') {
      depth -= 1
      if (depth === 0) return nginxConfig.slice(start, index + 1)
    }
  }

  return ''
}

describe('integration webhook ingress', () => {
  it('allows Evolution webhook payloads up to 10 MiB only on its endpoint', () => {
    const block = locationBlock('= /api/webhooks/evolution')

    expect(block).toContain('client_max_body_size 10M;')
    expect(block).toContain('proxy_pass http://127.0.0.1:3020;')
  })

  it('does not widen the generic application upload limit', () => {
    const genericBlock = locationBlock('/')

    expect(genericBlock).not.toContain('client_max_body_size')
  })
})
