import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  containsHumanHandoffPhrase,
  classificarIntencaoMensagem,
} from '@/lib/whatsapp/contact-status'

describe('WhatsApp Safety: Human Handoff & Detecção de Solicitação de Atendente', () => {
  describe('containsHumanHandoffPhrase', () => {
    it('detects direct requests to speak with a human or attendant', () => {
      expect(containsHumanHandoffPhrase('Quero falar com um atendente')).toBe(true)
      expect(containsHumanHandoffPhrase('falar com atendente')).toBe(true)
      expect(containsHumanHandoffPhrase('preciso falar com um humano')).toBe(true)
      expect(containsHumanHandoffPhrase('tem alguém aí?')).toBe(true)
      expect(containsHumanHandoffPhrase('quero falar com uma pessoa')).toBe(true)
      expect(containsHumanHandoffPhrase('atendente por favor')).toBe(true)
      expect(containsHumanHandoffPhrase('falar com vendedor')).toBe(true)
      expect(containsHumanHandoffPhrase('operador')).toBe(true)
      expect(containsHumanHandoffPhrase('suporte humano')).toBe(true)
      expect(containsHumanHandoffPhrase('hablar con alguien')).toBe(true)
      expect(containsHumanHandoffPhrase('hablar con una persona')).toBe(true)
    })

    it('does not trigger on normal food or meat inquiries', () => {
      expect(containsHumanHandoffPhrase('Vocês atendem no domingo?')).toBe(false) // "atendem" do restaurante, não "atendente"
      expect(containsHumanHandoffPhrase('Qual o horário de atendimento?')).toBe(false)
      expect(containsHumanHandoffPhrase('Quero 1kg de carne de porco')).toBe(false)
      expect(containsHumanHandoffPhrase('Quanto custa a entrega?')).toBe(false)
    })
  })

  describe('classificarIntencaoMensagem com Human Handoff', () => {
    it('classifies human handoff intent correctly', () => {
      const res = classificarIntencaoMensagem('Olá, gostaria de falar com um atendente humano')
      expect(res.tipo).toBe('human_handoff')
      expect(res.motivo).toContain('atendente')
    })
  })
})
