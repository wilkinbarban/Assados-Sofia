import { describe, expect, it } from 'vitest'
import { shouldPersistOutbound, type EnviarMensagemPayload } from '@/lib/whatsapp/provider'
import { evolutionMaxRetries } from '@/lib/whatsapp/evolution'
describe('WhatsApp batch provider payload',()=>{
  it('defaults persistence on and permits an explicit no-persistence dispatch',()=>{
    const normal:EnviarMensagemPayload={texto:'normal'}
    const batch:EnviarMensagemPayload={texto:'intent',salvarNoBanco:false}
    expect(shouldPersistOutbound(normal)).toBe(true);expect(evolutionMaxRetries(normal)).toBe(2)
    expect(shouldPersistOutbound(batch)).toBe(false);expect(evolutionMaxRetries(batch)).toBe(0)
  })
})
