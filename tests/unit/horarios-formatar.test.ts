import { describe, expect, it } from 'vitest'
import { 
  formatarDiasSemana, 
  gerarGradeHorarios, 
  formatarMensagemForaHorario 
} from '@/lib/horarios/formatar'

describe('Schedule Formatting Logic (formatar.ts)', () => {
  describe('formatarDiasSemana', () => {
    it('returns default text if empty', () => {
      expect(formatarDiasSemana([])).toBe('nossos dias de atendimento')
    })

    it('returns single day name', () => {
      expect(formatarDiasSemana([1])).toBe('segunda-feira')
      expect(formatarDiasSemana([6])).toBe('sábado')
    })

    it('returns two days separated by e', () => {
      expect(formatarDiasSemana([1, 5])).toBe('segunda-feira e sexta-feira')
    })

    it('returns consecutive range', () => {
      expect(formatarDiasSemana([1, 2, 3, 4, 5])).toBe('segunda-feira a sexta-feira')
    })

    it('returns list for non-consecutive days', () => {
      expect(formatarDiasSemana([1, 3, 5])).toBe('segunda-feira, quarta-feira e sexta-feira')
    })

    it('returns segunda a domingo for all days', () => {
      expect(formatarDiasSemana([0, 1, 2, 3, 4, 5, 6])).toBe('segunda a domingo')
    })
  })

  describe('gerarGradeHorarios', () => {
    const horarios = [
      { dia_semana: 1, hora_abertura: '08:00:00', hora_fechamento: '18:00:00' },
      { dia_semana: 2, hora_abertura: '08:00:00', hora_fechamento: '18:00:00' },
      { dia_semana: 3, hora_abertura: '08:00:00', hora_fechamento: '18:00:00' },
      { dia_semana: 4, hora_abertura: '08:00:00', hora_fechamento: '18:00:00' },
      { dia_semana: 5, hora_abertura: '08:00:00', hora_fechamento: '18:00:00' },
      { dia_semana: 6, hora_abertura: '08:00:00', hora_fechamento: '12:00:00' },
    ]

    it('groups days by schedule and joins with newlines in multiline mode', () => {
      const result = gerarGradeHorarios(horarios, false)
      expect(result).toBe(
        'segunda-feira a sexta-feira: 08:00 às 18:00\nsábado: 08:00 às 12:00'
      )
    })

    it('groups days by schedule and joins inline in inline mode', () => {
      const result = gerarGradeHorarios(horarios, true)
      expect(result).toBe(
        'segunda-feira a sexta-feira das 08:00 às 18:00 e sábado das 08:00 às 12:00'
      )
    })
  })

  describe('formatarMensagemForaHorario', () => {
    const horarios = [
      { dia_semana: 1, hora_abertura: '08:00:00', hora_fechamento: '18:00:00', ativo: true },
      { dia_semana: 2, hora_abertura: '08:00:00', hora_fechamento: '18:00:00', ativo: true },
      { dia_semana: 3, hora_abertura: '08:00:00', hora_fechamento: '18:00:00', ativo: true },
      { dia_semana: 4, hora_abertura: '08:00:00', hora_fechamento: '18:00:00', ativo: true },
      { dia_semana: 5, hora_abertura: '08:00:00', hora_fechamento: '18:00:00', ativo: true },
      { dia_semana: 6, hora_abertura: '08:00:00', hora_fechamento: '12:00:00', ativo: true },
    ]

    it('replaces all placeholders correctly in template', () => {
      const template = 'Horários:\n{grade_horarios}\nInline: {grade_horarios_inline}\nResumo: de {dias_semana} ({horario_inicio} às {horario_fim})'
      const result = formatarMensagemForaHorario(template, horarios)
      
      expect(result).toContain('segunda-feira a sexta-feira: 08:00 às 18:00')
      expect(result).toContain('sábado: 08:00 às 12:00')
      expect(result).toContain('segunda-feira a sexta-feira das 08:00 às 18:00 e sábado das 08:00 às 12:00')
      expect(result).toContain('Resumo: de segunda-feira a sábado (08:00 às 18:00)')
    })
  })
})
