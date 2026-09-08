import { describe, expect, it, vi } from 'vitest'
import { classifyPaymentProof } from '@/lib/payment-proofs/advisory-extraction'

const image = 'data:image/png;base64,iVBORw0KGgo='
const answer = { likely_payment_proof:true, confidence:0.99, suggested_amount_cents:1234, reason_code:'payment_markers_present' }

describe('payment-proof visual advisory extraction', () => {
  it('sends a bounded canonical image to OpenRouter and remains manual-review only', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ choices:[{ message:{ content:JSON.stringify(answer) } }] }), { status:200 }))
    const persist = vi.fn(async () => undefined)
    const result = await classifyPaymentProof({ proofId:'proof-1', extractedText:'', imageDataUrl:image, apiKey:'key', model:'model', fetcher, persist })
    expect(result).toMatchObject({ disposition:'manual_review', approved:false, suggestedAmountCents:1234 })
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body))
    expect(body.messages[1].content[1]).toEqual({ type:'image_url', image_url:{ url:image } })
  })

  it('fails closed to manual review when the provider is unavailable', async () => {
    const persist = vi.fn(async () => undefined)
    const result = await classifyPaymentProof({ proofId:'proof-1', extractedText:'', imageDataUrl:image, apiKey:'key', model:'model', fetcher:vi.fn(async () => { throw new Error('unavailable') }), maxAttempts:1, persist })
    expect(result).toMatchObject({ disposition:'manual_review', approved:false, reasonCode:'provider_unavailable' })
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ approved:false, disposition:'manual_review' }))
  })
})
