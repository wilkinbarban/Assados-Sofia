import { describe, expect, it } from 'vitest'
import { normalizePaymentProofDelivery, validatePaymentProofPdf } from '@/lib/payment-proofs/intake'

const pdf = new Uint8Array([0x25,0x50,0x44,0x46,0x2d,0x31])

describe('payment proof intake adapters', () => {
  it('normalizes Web, Telegram and WhatsApp into stable delivery identities', () => {
    expect(normalizePaymentProofDelivery({channel:'web',deliveryId:' msg-1 ',customerId:'customer-1'})).toEqual({channel:'web',deliveryKey:'msg-1',customerId:'customer-1',senderReference:null})
    expect(normalizePaymentProofDelivery({channel:'telegram',deliveryId:'tg-1',sender:' 5541999999999 '})).toEqual({channel:'telegram',deliveryKey:'tg-1',customerId:null,senderReference:'5541999999999'})
    expect(normalizePaymentProofDelivery({channel:'whatsapp',deliveryId:'wa-1',sender:'+55 (41) 99999-9999'}).senderReference).toBe('5541999999999')
  })

  it('rejects spoofed MIME, bad magic and oversized bytes', () => {
    expect(validatePaymentProofPdf(pdf,'application/pdf')).toEqual({ok:true,sizeBytes:6})
    expect(validatePaymentProofPdf(pdf,'image/png')).toEqual({ok:false,error:'PDF_MIME_INVALID'})
    expect(validatePaymentProofPdf(new Uint8Array([1,2,3,4,5]),'application/pdf')).toEqual({ok:false,error:'PDF_SIGNATURE_INVALID'})
    expect(validatePaymentProofPdf(new Uint8Array(5*1024*1024+1),'application/pdf')).toEqual({ok:false,error:'PDF_SIZE_INVALID'})
  })
})
