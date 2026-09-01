import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PaymentProofChatCard, paymentProofPreview } from '@/components/chat/PaymentProofChatCard'
afterEach(cleanup)

describe('PNG-only payment proof chats',()=>{
 it.each(['identity_pending','received','review','quarantined','duplicate','purged'])('hides forbidden state %s',(status)=>{
  expect(paymentProofPreview({proofId:'p',status,hasPreview:true})).toBeNull()
 })
 it('shows only a preview button until the admitted private PNG lightbox is opened',()=>{
  render(<PaymentProofChatCard proofId="11111111-1111-4111-8111-111111111111"/>)
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.queryByText(/pdf|baixar|proofs\/private/i)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Vista Previa'}))
  expect(screen.getByRole('dialog',{name:/comprovante pix/i})).toBeInTheDocument()
  expect(screen.getByRole('img',{name:/comprovante pix ampliado/i})).toHaveAttribute(
   'src',
   '/api/payment-proofs/11111111-1111-4111-8111-111111111111/preview',
  )
 })
})
