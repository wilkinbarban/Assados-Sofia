import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatBatchContext, runSofiaBatchMaintenance, type BatchWorkerDeps } from '@/lib/sofia/inbound-batch-worker'
import { inboundBatchProcessingEnabled, inboundBatchRuntimeEnabled } from '@/lib/sofia/inbound-batch-gates'

const claim = { batch_id:'b', conversa_id:'c', cliente_id:'u', channel:'telegram' as const, lease_token:'l', eligibility:{ db_eligible:true }, members:[
  { content:'primeiro', has_attachment:false, has_payment_proof:false },
  { content:null, has_attachment:true, has_payment_proof:false },
  { content:'segue', has_attachment:true, has_payment_proof:true },
] }
function deps(overrides: Partial<BatchWorkerDeps> = {}): BatchWorkerDeps {
  return { claimBatch:vi.fn().mockResolvedValueOnce(claim).mockResolvedValue(null), cancel:vi.fn().mockResolvedValue(true), fail:vi.fn().mockResolvedValue(true), businessHours:vi.fn().mockResolvedValue(true), globalEnabled:vi.fn().mockResolvedValue(true), whatsappEligible:vi.fn().mockResolvedValue(true), generate:vi.fn().mockResolvedValue('resposta'), complete:vi.fn().mockResolvedValue(true), completePaced:vi.fn().mockResolvedValue({ remaining_ms:0 }), claimDelivery:vi.fn().mockResolvedValue(null), adoptActivity:vi.fn().mockResolvedValue({attempt_id:'d',expires_at:''}), beginDelivery:vi.fn().mockResolvedValue(true), recordDeliveryFailure:vi.fn(), now:vi.fn().mockReturnValue(0), sleep:vi.fn().mockResolvedValue(undefined), sendTelegramTyping:vi.fn().mockResolvedValue(undefined), sendTelegram:vi.fn(), sendWhatsApp:vi.fn(), ...overrides }
}
afterEach(() => vi.unstubAllEnvs())
describe('Sofia inbound batch worker', () => {
  it('parses processing strictly and defaults closed', () => {
    expect([undefined,'false','TRUE','1'].map(inboundBatchProcessingEnabled)).toEqual([false,false,false,false])
    expect(inboundBatchProcessingEnabled('true')).toBe(true)
  })
  it('parses the independent runtime gate strictly and defaults closed', () => {
    expect([undefined,'false','TRUE','1'].map(inboundBatchRuntimeEnabled)).toEqual([false,false,false,false])
    expect(inboundBatchRuntimeEnabled('true')).toBe(true)
  })
  it('preserves legacy generation and delivery while the runtime gate is off', async () => {
    vi.stubEnv('SOFIA_INBOUND_BATCH_RUNTIME_ENABLED','false')
    const delivery={batch_id:'d',conversa_id:'c',canal:'telegram' as const,response_text:'r',lease_token:'dl'}
    const d=deps({claimDelivery:vi.fn().mockResolvedValueOnce(delivery).mockResolvedValue(null),beginActivity:vi.fn(),renewActivity:vi.fn(),clearActivity:vi.fn()})
    await runSofiaBatchMaintenance(d,2)
    expect(d.complete).toHaveBeenCalledWith('b','l','resposta')
    expect(d.beginActivity).not.toHaveBeenCalled()
    expect(d.beginDelivery).toHaveBeenCalledWith('d','dl')
    expect(d.sendTelegram).toHaveBeenCalledWith('c','r')
  })
  it('completes paced work, transfers G to D, and sleeps only the durable remainder', async () => {
    vi.stubEnv('SOFIA_INBOUND_BATCH_RUNTIME_ENABLED','true')
    const delivery={batch_id:'b',conversa_id:'c',canal:'telegram' as const,response_text:'r',lease_token:'dl'}
    const d=deps({
      beginActivity:vi.fn().mockResolvedValue({attempt_id:'g',expires_at:''}),
      completePaced:vi.fn().mockResolvedValue({remaining_ms:37}),
      claimDelivery:vi.fn().mockResolvedValueOnce(delivery).mockResolvedValue(null),
      adoptActivity:vi.fn().mockResolvedValue({attempt_id:'d',expires_at:''}),
      clearActivity:vi.fn().mockResolvedValue(true),
      now:vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(250),
      setInterval:vi.fn(()=> 'timer'),clearInterval:vi.fn(),
    })
    await runSofiaBatchMaintenance(d,2)
    expect(d.beginActivity).toHaveBeenCalledBefore(d.generate as ReturnType<typeof vi.fn>)
    expect(d.complete).not.toHaveBeenCalled()
    expect(d.completePaced).toHaveBeenCalledOnce()
    expect(d.completePaced).toHaveBeenCalledWith('b','l','resposta',150)
    expect(d.clearActivity).not.toHaveBeenCalledWith('b','g')
    expect(d.adoptActivity).toHaveBeenCalledWith('b','dl')
    expect(d.sleep).toHaveBeenCalledWith(37)
    expect(d.sleep).toHaveBeenCalledBefore(d.beginDelivery as ReturnType<typeof vi.fn>)
    expect(d.adoptActivity).toHaveBeenCalledBefore(d.beginDelivery as ReturnType<typeof vi.fn>)
    expect(d.beginDelivery).toHaveBeenCalledWith('b','dl')
    expect(d.clearActivity).toHaveBeenCalledWith('b','d')
    expect(d.clearInterval).toHaveBeenCalledWith('timer')
  })
  it('clears D when the final delivery fence is lost after paced waiting', async () => {
    vi.stubEnv('SOFIA_INBOUND_BATCH_RUNTIME_ENABLED','true')
    const delivery={batch_id:'b',conversa_id:'c',canal:'telegram' as const,response_text:'r',lease_token:'dl'}
    const d=deps({
      beginActivity:vi.fn().mockResolvedValue({attempt_id:'g',expires_at:''}),
      completePaced:vi.fn().mockResolvedValue({remaining_ms:9}),
      claimDelivery:vi.fn().mockResolvedValueOnce(delivery).mockResolvedValue(null),
      adoptActivity:vi.fn().mockResolvedValue({attempt_id:'d',expires_at:''}),
      beginDelivery:vi.fn().mockResolvedValue(false),
      clearActivity:vi.fn().mockResolvedValue(true),
    })
    await runSofiaBatchMaintenance(d,2)
    expect(d.sleep).toHaveBeenCalledWith(9)
    expect(d.sendTelegram).not.toHaveBeenCalled()
    expect(d.clearActivity).toHaveBeenCalledWith('b','d')
  })
  it('clears G when paced completion loses its fence', async () => {
    vi.stubEnv('SOFIA_INBOUND_BATCH_RUNTIME_ENABLED','true')
    const d=deps({beginActivity:vi.fn().mockResolvedValue({attempt_id:'g',expires_at:''}),completePaced:vi.fn().mockResolvedValue(null),clearActivity:vi.fn().mockResolvedValue(true)})
    await runSofiaBatchMaintenance(d,1)
    expect(d.clearActivity).toHaveBeenCalledWith('b','g')
  })
  it('keeps Telegram typing refreshed under G and D without granting final delivery', async () => {
    vi.stubEnv('SOFIA_INBOUND_BATCH_RUNTIME_ENABLED','true')
    const delivery={batch_id:'b',conversa_id:'c',canal:'telegram' as const,response_text:'r',lease_token:'dl'}
    const timers: Array<() => void> = []
    const d=deps({
      beginActivity:vi.fn().mockResolvedValue({attempt_id:'g',expires_at:''}),
      completePaced:vi.fn().mockResolvedValue({remaining_ms:0}),
      claimDelivery:vi.fn().mockResolvedValueOnce(delivery).mockResolvedValue(null),
      adoptActivity:vi.fn().mockResolvedValue({attempt_id:'d',expires_at:''}),
      setInterval:vi.fn(callback=>{timers.push(callback);return timers.length}),
      clearInterval:vi.fn(),
    })
    await runSofiaBatchMaintenance(d,2)
    expect(d.sendTelegramTyping).toHaveBeenCalledWith('c')
    expect(d.sendTelegramTyping).toHaveBeenCalledBefore(d.generate as ReturnType<typeof vi.fn>)
    expect(d.setInterval).toHaveBeenCalledWith(expect.any(Function),4_000)
    timers.forEach(timer=>timer())
    await Promise.resolve()
    expect(d.sendTelegramTyping).toHaveBeenCalledTimes(4)
    expect(d.sendTelegramTyping).toHaveBeenCalledBefore(d.beginDelivery as ReturnType<typeof vi.fn>)
    expect(d.clearInterval).toHaveBeenCalledTimes(3)
  })
  it('treats Telegram typing failures as best effort', async () => {
    vi.stubEnv('SOFIA_INBOUND_BATCH_RUNTIME_ENABLED','true')
    const d=deps({
      beginActivity:vi.fn().mockResolvedValue({attempt_id:'g',expires_at:''}),
      clearActivity:vi.fn().mockResolvedValue(true),
      sendTelegramTyping:vi.fn().mockImplementation(()=>{throw Error('provider')}),
    })
    const result=await runSofiaBatchMaintenance(d,1)
    expect(result).toMatchObject({completed:1,failed:0})
    expect(d.completePaced).toHaveBeenCalledOnce()
  })
  it('serializes ten-second G heartbeats and discards output after a fence loss', async () => {
    vi.stubEnv('SOFIA_INBOUND_BATCH_RUNTIME_ENABLED','true')
    let heartbeat:(()=>void)|undefined,releaseGeneration!:(text:string)=>void,releaseRenewal!:(value:boolean)=>void
    const generation=new Promise<string>(resolve=>{releaseGeneration=resolve})
    const renewal=new Promise<boolean>(resolve=>{releaseRenewal=resolve})
    const d=deps({beginActivity:vi.fn().mockResolvedValue({attempt_id:'g',expires_at:''}),generate:vi.fn().mockReturnValue(generation),renewActivity:vi.fn().mockReturnValue(renewal),clearActivity:vi.fn().mockResolvedValue(true),setInterval:vi.fn((callback,ms)=>{if(ms===10_000)heartbeat=callback;return `timer-${ms}`}),clearInterval:vi.fn()})
    const run=runSofiaBatchMaintenance(d,1)
    await vi.waitFor(()=>expect(heartbeat).toBeTypeOf('function'))
    heartbeat!();heartbeat!()
    expect(d.renewActivity).toHaveBeenCalledTimes(1)
    releaseRenewal(false);releaseGeneration('resposta')
    await run
    expect(d.setInterval).toHaveBeenCalledWith(expect.any(Function),10_000)
    expect(d.complete).not.toHaveBeenCalled()
    expect(d.clearActivity).toHaveBeenCalledWith('b','g')
  })
  it('formats ordered context with safe attachment descriptors only', () => {
    expect(formatBatchContext(claim.members)).toBe('MENSAGENS RECEBIDAS NESTE LOTE (ordem cronológica):\n[1] Cliente: "primeiro"\n[2] Cliente: [anexo recebido; mensagem sem texto]\n[3] Cliente: "segue" [anexo: comprovante de pagamento recebido]')
    expect(formatBatchContext([{ content:'x', has_attachment:true, has_payment_proof:false, url_anexo:'secret/path.jpg' } as never])).not.toContain('secret')
  })
  it.each([
    ['ia_inactive',{ eligibility:{ db_eligible:false,ia_ativa:false } }],
    ['opt_out',{ eligibility:{ db_eligible:false,ia_ativa:true,automation_allowed:false } }],
    ['handoff_or_pause',{ eligibility:{ db_eligible:false,ia_ativa:true,automation_allowed:true } }],
    ['outside_business_hours',{}, { businessHours:vi.fn().mockResolvedValue(false) }],
    ['global_disabled',{}, { globalEnabled:vi.fn().mockResolvedValue(false) }],
    ['sleep_or_cooldown',{ channel:'whatsapp' }, { whatsappEligible:vi.fn().mockResolvedValue(false) }],
  ])('cancels ineligible work as %s without generation', async (reason, patch, extra: Partial<BatchWorkerDeps> = {}) => {
    const d=deps({ claimBatch:vi.fn().mockResolvedValueOnce({...claim,...patch}).mockResolvedValue(null), ...extra })
    const result=await runSofiaBatchMaintenance(d,1)
    expect(result.cancelled).toBe(1); expect(d.cancel).toHaveBeenCalledWith('b','l',reason); expect(d.generate).not.toHaveBeenCalled()
  })
  it('generates once and completes one intent', async () => {
    const d=deps(); const result=await runSofiaBatchMaintenance(d,1)
    expect(result.completed).toBe(1); expect(d.generate).toHaveBeenCalledTimes(1); expect(d.complete).toHaveBeenCalledWith('b','l','resposta')
  })
  it('fails closed on generation and lease completion failure', async () => {
    const broken=deps({generate:vi.fn().mockRejectedValue(Error('private'))}); expect((await runSofiaBatchMaintenance(broken,1)).failed).toBe(1)
    const stale=deps({complete:vi.fn().mockResolvedValue(false)}); expect((await runSofiaBatchMaintenance(stale,1)).failed).toBe(1)
  })
  it.each(['telegram','whatsapp'] as const)('marks attempted before one %s provider send', async channel => {
    const d=deps({claimBatch:vi.fn().mockResolvedValue(null),claimDelivery:vi.fn().mockResolvedValueOnce({batch_id:'b',conversa_id:'c',canal:channel,response_text:'r',lease_token:'l'}).mockResolvedValue(null)})
    await runSofiaBatchMaintenance(d,1)
    const send=channel==='telegram'?d.sendTelegram:d.sendWhatsApp
    expect(d.beginDelivery).toHaveBeenCalledBefore(send as ReturnType<typeof vi.fn>); expect(send).toHaveBeenCalledTimes(1)
  })
  it('never sends when the delivery fence is lost', async () => {
    const d=deps({claimBatch:vi.fn().mockResolvedValue(null),claimDelivery:vi.fn().mockResolvedValueOnce({batch_id:'b',conversa_id:'c',canal:'telegram',response_text:'r',lease_token:'l'}),beginDelivery:vi.fn().mockResolvedValue(false)})
    await runSofiaBatchMaintenance(d,1); expect(d.sendTelegram).not.toHaveBeenCalled()
  })
  it.each([
    ['telegram',{success:false}],
    ['whatsapp',{sucesso:false,error:'sensitive provider detail'}],
  ] as const)('records resolved %s provider failure using only a bounded token',async(canal,result)=>{
    const delivery={batch_id:'b',conversa_id:'c',canal,response_text:'r',lease_token:'l'}
    const d=deps({claimBatch:vi.fn().mockResolvedValue(null),claimDelivery:vi.fn().mockResolvedValueOnce(delivery).mockResolvedValue(null),sendTelegram:vi.fn().mockResolvedValue(result),sendWhatsApp:vi.fn().mockResolvedValue(result)})
    await runSofiaBatchMaintenance(d,2);expect(d.recordDeliveryFailure).toHaveBeenCalledWith('b','provider_rejected')
    expect(d.recordDeliveryFailure).not.toHaveBeenCalledWith('b',expect.stringContaining('sensitive'))
  })
  it('records provider exceptions without retrying the attempted intent',async()=>{
    const delivery={batch_id:'b',conversa_id:'c',canal:'whatsapp' as const,response_text:'r',lease_token:'l'}
    const d=deps({claimBatch:vi.fn().mockResolvedValue(null),claimDelivery:vi.fn().mockResolvedValueOnce(delivery).mockResolvedValue(null),sendWhatsApp:vi.fn().mockRejectedValue(Error('network'))})
    await runSofiaBatchMaintenance(d,2);expect(d.sendWhatsApp).toHaveBeenCalledTimes(1);expect(d.recordDeliveryFailure).toHaveBeenCalledWith('b','provider_unavailable')
  })
  it('advances saturated processing and delivery queues within one overall limit',async()=>{
    const batches=Array.from({length:20},(_,i)=>({...claim,batch_id:`b${i}`}))
    const deliveries=Array.from({length:20},(_,i)=>({batch_id:`d${i}`,conversa_id:'c',canal:'telegram' as const,response_text:'r',lease_token:'l'}))
    const d=deps({claimBatch:vi.fn(async()=>batches.shift()??null),claimDelivery:vi.fn(async()=>deliveries.shift()??null)})
    await runSofiaBatchMaintenance(d,20)
    expect(d.claimBatch).toHaveBeenCalledTimes(10);expect(d.claimDelivery).toHaveBeenCalledTimes(10)
    expect(vi.mocked(d.claimBatch).mock.calls.length+vi.mocked(d.claimDelivery).mock.calls.length).toBeLessThanOrEqual(20)
  })
})
