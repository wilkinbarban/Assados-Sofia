import { createServer } from 'node:http'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const scheduler = join(process.cwd(), 'ops/mercadopago-recovery-scheduler.sh')
const children: ReturnType<typeof spawn>[] = []

afterEach(() => children.splice(0).forEach((child) => child.kill()))

function runScheduler(url: string, secret: string) {
  const child = spawn('sh', [scheduler], {
    env: {
      ...process.env,
      MERCADO_PAGO_RECOVERY_URL: url,
      MERCADO_PAGO_RECOVERY_SECRET: secret,
      MERCADO_PAGO_RECOVERY_RUN_ONCE: '1',
      MERCADO_PAGO_RECOVERY_INTERVAL_SECONDS: '1',
    },
  })
  children.push(child)
  return child
}

describe('Mercado Pago recovery scheduler', () => {
  it('authenticates a controlled recovery invocation and fails visibly on non-2xx', async () => {
    const requests: string[] = []
    const server = createServer((request, response) => {
      requests.push(request.headers.authorization ?? '')
      response.statusCode = 200
      response.end('{"recovered":0,"failed":0}')
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('test server did not bind')

    const success = runScheduler(`http://127.0.0.1:${address.port}/api/internal/mercadopago/recover`, 'test-secret')
    const [successCode] = await once(success, 'exit') as [number]
    await new Promise<void>((resolve) => server.close(() => resolve()))
    expect(successCode).toBe(0)
    expect(requests).toEqual(['Bearer test-secret'])

    const failing = createServer((_request, response) => { response.statusCode = 503; response.end('unavailable') })
    failing.listen(0, '127.0.0.1')
    await once(failing, 'listening')
    const failingAddress = failing.address()
    if (!failingAddress || typeof failingAddress === 'string') throw new Error('test server did not bind')
    const failure = runScheduler(`http://127.0.0.1:${failingAddress.port}/api/internal/mercadopago/recover`, 'test-secret')
    const [failureCode] = await once(failure, 'exit') as [number]
    await new Promise<void>((resolve) => failing.close(() => resolve()))
    expect(failureCode).toBe(1)
  })

  it('keeps scheduler configuration internal, restartable, and secret-bound', () => {
    const compose = readFileSync(join(process.cwd(), 'docker-compose.yml'), 'utf8')
    expect(compose).toContain('restart: always')
    expect(compose).toContain('MERCADO_PAGO_RECOVERY_SECRET=${MERCADO_PAGO_RECOVERY_SECRET:?set MERCADO_PAGO_RECOVERY_SECRET}')
    expect(compose).toContain('condition: service_healthy')
    expect(compose).toContain('MERCADO_PAGO_RECOVERY_URL=http://web:3000/api/internal/mercadopago/recover')
  })
})
