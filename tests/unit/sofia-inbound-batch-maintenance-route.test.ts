import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({config:vi.fn(),client:vi.fn(),run:vi.fn(),gate:vi.fn()}))
vi.mock('@/lib/config/sistema',()=>({obterConfiguracaoSistema:mocks.config}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:mocks.client}))
vi.mock('@/lib/sofia/inbound-batch-gates',()=>({inboundBatchProcessingEnabled:mocks.gate}))
vi.mock('@/lib/sofia/inbound-batch-worker',()=>({createSofiaBatchWorkerDeps:vi.fn((db)=>({db})),runSofiaBatchMaintenance:mocks.run}))
import { POST } from '@/app/api/internal/sofia/inbound-batches/maintenance/route'
const request=(secret='secret')=>new Request('http://local',{method:'POST',headers:{authorization:`Bearer ${secret}`}})
describe('Sofia batch maintenance route',()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.config.mockResolvedValue('secret');mocks.gate.mockReturnValue(true);mocks.run.mockResolvedValue({claimed:1,completed:1,cancelled:0,failed:0,delivery_attempted:1})})
  it('rejects unauthorized callers without creating a client',async()=>{expect((await POST(request('wrong'))).status).toBe(401);expect(mocks.client).not.toHaveBeenCalled()})
  it('returns zero and never claims while processing is closed',async()=>{mocks.gate.mockReturnValue(false);expect(await(await POST(request())).json()).toEqual({claimed:0,completed:0,cancelled:0,failed:0,delivery_attempted:0});expect(mocks.client).not.toHaveBeenCalled()})
  it('supplies one overall 20-work cap and returns no-store counts',async()=>{mocks.client.mockReturnValue({rpc:vi.fn()});const response=await POST(request());expect(await response.json()).toEqual({claimed:1,completed:1,cancelled:0,failed:0,delivery_attempted:1});expect(response.headers.get('cache-control')).toBe('no-store');expect(mocks.run).toHaveBeenCalledTimes(1);expect(mocks.run).toHaveBeenCalledWith(expect.anything(),20)})
})
