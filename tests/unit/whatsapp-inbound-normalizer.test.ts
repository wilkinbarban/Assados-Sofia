import { describe, it, expect } from 'vitest'
import {
  normalizarMensagemEvolution,
  extrairAcaoInterativa,
  type MensagemNormalizada,
} from '@/lib/whatsapp/inbound-normalizer'

describe('WhatsApp Inbound Normalizer (TDD)', () => {
  it('normaliza mensagem de texto simples', () => {
    const payload = {
      event: 'messages.upsert',
      data: {
        key: {
          id: 'MSG-001',
          remoteJid: '5541999998888@s.whatsapp.net',
          fromMe: false,
        },
        pushName: 'Carlos Silva',
        message: {
          conversation: 'Olá, gostaria de saber os combos',
        },
      },
    }

    const resultado = normalizarMensagemEvolution(payload)

    expect(resultado).not.toBeNull()
    expect(resultado?.messageId).toBe('MSG-001')
    expect(resultado?.phone).toBe('5541999998888')
    expect(resultado?.type).toBe('TEXT')
    expect(resultado?.text).toBe('Olá, gostaria de saber os combos')
    expect(resultado?.interactiveId).toBeUndefined()
  })

  it('normaliza clique em botão de resposta (buttonsResponseMessage)', () => {
    const payload = {
      event: 'messages.upsert',
      data: {
        key: {
          id: 'MSG-BTN-001',
          remoteJid: '5541999998888@s.whatsapp.net',
          fromMe: false,
        },
        pushName: 'Carlos Silva',
        message: {
          buttonsResponseMessage: {
            selectedButtonId: 'cart:add:combo-1-classico-da-sofia',
            selectedDisplayText: '🛒 Adicionar ao pedido',
            type: 'DISPLAY_TEXT',
          },
        },
      },
    }

    const resultado = normalizarMensagemEvolution(payload)

    expect(resultado).not.toBeNull()
    expect(resultado?.messageId).toBe('MSG-BTN-001')
    expect(resultado?.type).toBe('INTERACTIVE_BUTTON')
    expect(resultado?.interactiveId).toBe('cart:add:combo-1-classico-da-sofia')
    expect(resultado?.text).toBe('🛒 Adicionar ao pedido')
  })

  it('normaliza seleção em lista interativa (listResponseMessage)', () => {
    const payload = {
      event: 'messages.upsert',
      data: {
        key: {
          id: 'MSG-LIST-001',
          remoteJid: '5541999998888@s.whatsapp.net',
          fromMe: false,
        },
        pushName: 'Carlos Silva',
        message: {
          listResponseMessage: {
            title: 'Combo 2 - Costela Suprema',
            singleSelectReply: {
              selectedRowId: 'product:details:combo-2-costela-suprema',
            },
          },
        },
      },
    }

    const resultado = normalizarMensagemEvolution(payload)

    expect(resultado).not.toBeNull()
    expect(resultado?.type).toBe('INTERACTIVE_LIST')
    expect(resultado?.interactiveId).toBe('product:details:combo-2-costela-suprema')
    expect(resultado?.text).toBe('Combo 2 - Costela Suprema')
  })

  it('normaliza resposta de carrossel nativo / nativeFlowResponseMessage', () => {
    const payload = {
      event: 'messages.upsert',
      data: {
        key: {
          id: 'MSG-FLOW-001',
          remoteJid: '5541999998888@s.whatsapp.net',
          fromMe: false,
        },
        pushName: 'Carlos Silva',
        message: {
          interactiveResponseMessage: {
            body: { text: 'Adicionar' },
            nativeFlowResponseMessage: {
              name: 'quick_reply',
              paramsJson: JSON.stringify({ id: 'cart:add:combo-3-dueto-sofia' }),
            },
          },
        },
      },
    }

    const resultado = normalizarMensagemEvolution(payload)

    expect(resultado).not.toBeNull()
    expect(resultado?.type).toBe('INTERACTIVE_CAROUSEL')
    expect(resultado?.interactiveId).toBe('cart:add:combo-3-dueto-sofia')
  })

  it('extrairAcaoInterativa faz o parse correto de IDs determinísticos', () => {
    expect(extrairAcaoInterativa('cart:add:prod-123')).toEqual({
      scope: 'cart',
      action: 'add',
      entityId: 'prod-123',
    })

    expect(extrairAcaoInterativa('product:details:costela-1kg')).toEqual({
      scope: 'product',
      action: 'details',
      entityId: 'costela-1kg',
    })

    expect(extrairAcaoInterativa('cart:view')).toEqual({
      scope: 'cart',
      action: 'view',
      entityId: undefined,
    })

    expect(extrairAcaoInterativa('order:confirm')).toEqual({
      scope: 'order',
      action: 'confirm',
      entityId: undefined,
    })

    expect(extrairAcaoInterativa('human:request')).toEqual({
      scope: 'human',
      action: 'request',
      entityId: undefined,
    })

    expect(extrairAcaoInterativa('texto_qualquer_sem_dois_pontos')).toBeNull()
  })
})
