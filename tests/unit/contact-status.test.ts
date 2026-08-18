import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  containsOptOutPhrase,
  containsOptInPhrase,
  containsCandidatePhrase,
  normalizeContactPhrase,
  classificarIntencaoMensagem,
} from '@/lib/whatsapp/contact-status'

describe('WhatsApp Anti-Bloqueio: Governança de Contatos, Opt-In / Opt-Out & Candidatos', () => {
  describe('normalizeContactPhrase', () => {
    it('normalizes accents, special characters and spaces', () => {
      expect(normalizeContactPhrase('  NÃO ME MANDE MENSAGENS!!! ')).toBe('nao me mande mensagens')
      expect(normalizeContactPhrase('¿¡PARAR!?')).toBe('parar')
      expect(normalizeContactPhrase('Currículo / CV')).toBe('curriculo cv')
    })
  })

  describe('containsOptOutPhrase', () => {
    it('detects single-word universal opt-out keywords', () => {
      expect(containsOptOutPhrase('STOP')).toBe(true)
      expect(containsOptOutPhrase('stop')).toBe(true)
      expect(containsOptOutPhrase('PARAR')).toBe(true)
      expect(containsOptOutPhrase('parar')).toBe(true)
      expect(containsOptOutPhrase('SAIR')).toBe(true)
      expect(containsOptOutPhrase('sair')).toBe(true)
      expect(containsOptOutPhrase('CANCELAR')).toBe(true)
      expect(containsOptOutPhrase('cancelar')).toBe(true)
      expect(containsOptOutPhrase('BAJA')).toBe(true)
      expect(containsOptOutPhrase('DESCADASTRO')).toBe(true)
    })

    it('detects complex opt-out phrases in Portuguese and Spanish', () => {
      expect(containsOptOutPhrase('Não quero mais receber mensagens')).toBe(true)
      expect(containsOptOutPhrase('nao me mandem mensagens')).toBe(true)
      expect(containsOptOutPhrase('favor nao enviar cardapio')).toBe(true)
      expect(containsOptOutPhrase('não quero o cardápio')).toBe(true)
      expect(containsOptOutPhrase('no quiero recibir mas mensajes')).toBe(true)
      expect(containsOptOutPhrase('no me escriban')).toBe(true)
      expect(containsOptOutPhrase('cancelar minha inscrição')).toBe(true)
      expect(containsOptOutPhrase('remover meu número')).toBe(true)
    })

    it('does not trigger on normal conversational questions', () => {
      expect(containsOptOutPhrase('Qual o valor da picanha?')).toBe(false)
      expect(containsOptOutPhrase('Vocês abrem para o almoço?')).toBe(false)
      expect(containsOptOutPhrase('Vou parar aí para almoçar')).toBe(false)
      expect(containsOptOutPhrase('Quero cancelar o item 2 do meu pedido')).toBe(false) // Pedido, não descadastro do canal
      expect(containsOptOutPhrase('Onde fica a churrascaria?')).toBe(false)
      expect(containsOptOutPhrase('')).toBe(false)
      expect(containsOptOutPhrase(null as any)).toBe(false)
    })
  })

  describe('containsOptInPhrase', () => {
    it('detects explicit menu subscription opt-in phrases', () => {
      expect(containsOptInPhrase('Quero receber o cardápio')).toBe(true)
      expect(containsOptInPhrase('sim, quero receber o cardapio')).toBe(true)
      expect(containsOptInPhrase('pode me mandar o cardápio todos os dias')).toBe(true)
      expect(containsOptInPhrase('quero me inscrever no cardápio')).toBe(true)
      expect(containsOptInPhrase('1 - Sim, quero receber')).toBe(true)
      expect(containsOptInPhrase('quero receber o menu')).toBe(true)
    })

    it('does not trigger on general questions about the menu', () => {
      expect(containsOptInPhrase('Qual é o cardápio de hoje?')).toBe(false)
      expect(containsOptInPhrase('Manda o cardápio por favor')).toBe(false) // Consulta pontual, não opt-in de recebimento diário
      expect(containsOptInPhrase('Tem costela no cardápio?')).toBe(false)
    })
  })

  describe('containsCandidatePhrase', () => {
    it('detects job recruitment and CV / Resume submissions', () => {
      expect(containsCandidatePhrase('Segue meu currículo em anexo')).toBe(true)
      expect(containsCandidatePhrase('Segue em anexo meu CV')).toBe(true)
      expect(containsCandidatePhrase('Gostaria de saber se tem vaga de emprego')).toBe(true)
      expect(containsCandidatePhrase('Vocês estão contratando garçom ou churrasqueiro?')).toBe(true)
      expect(containsCandidatePhrase('Gostaria de trabalhar com vocês')).toBe(true)
      expect(containsCandidatePhrase('Quero deixar meu curriculo')).toBe(true)
      expect(containsCandidatePhrase('Procuro vaga de emprego')).toBe(true)
    })

    it('does not trigger on normal food or meat orders', () => {
      expect(containsCandidatePhrase('Quero 1kg de costela e 500g de picanha')).toBe(false)
      expect(containsCandidatePhrase('Aceitam cartão de crédito?')).toBe(false)
      expect(containsCandidatePhrase('Tem vaga para estacionar o carro?')).toBe(false) // "vaga" mas para estacionamento
    })
  })

  describe('classificarIntencaoMensagem', () => {
    it('classifies opt-out intent with highest priority', () => {
      const res = classificarIntencaoMensagem('Por favor, STOP! Não quero receber mensagens.')
      expect(res.tipo).toBe('opt_out')
      expect(res.apenasCardapio).toBe(false)
    })

    it('classifies menu-only opt-out intent', () => {
      const res = classificarIntencaoMensagem('Não quero receber o cardápio diário')
      expect(res.tipo).toBe('opt_out')
      expect(res.apenasCardapio).toBe(true)
    })

    it('classifies job candidate intent', () => {
      const res = classificarIntencaoMensagem('Olá, tenho interesse na vaga de atendente, segue meu currículo')
      expect(res.tipo).toBe('candidato_emprego')
    })

    it('classifies menu opt-in intent', () => {
      const res = classificarIntencaoMensagem('Sim, quero receber o cardápio todos os dias!')
      expect(res.tipo).toBe('opt_in_cardapio')
    })

    it('classifies regular customer conversation', () => {
      const res = classificarIntencaoMensagem('Boa tarde! Vocês entregam no Batel?')
      expect(res.tipo).toBe('conversa_regular')
    })
  })
})
