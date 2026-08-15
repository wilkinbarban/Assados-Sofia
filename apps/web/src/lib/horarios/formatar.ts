export const DIAS_NOMES = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

export function formatarDiasSemana(diasAtivos: number[]): string {
  if (diasAtivos.length === 0) return 'nossos dias de atendimento'

  if (diasAtivos.length === 7) return 'segunda a domingo'

  if (diasAtivos.length === 1) return DIAS_NOMES[diasAtivos[0]]

  if (diasAtivos.length === 2) {
    return `${DIAS_NOMES[diasAtivos[0]]} e ${DIAS_NOMES[diasAtivos[1]]}`
  }

  const isConsecutive = diasAtivos.every((d, i) => i === 0 || d === diasAtivos[i - 1] + 1)
  if (isConsecutive) {
    return `${DIAS_NOMES[diasAtivos[0]]} a ${DIAS_NOMES[diasAtivos[diasAtivos.length - 1]]}`
  }

  const ultimo = DIAS_NOMES[diasAtivos[diasAtivos.length - 1]]
  const anteriores = diasAtivos.slice(0, -1).map((d) => DIAS_NOMES[d])
  return `${anteriores.join(', ')} e ${ultimo}`
}

export function gerarGradeHorarios(
  horariosAtivos: { dia_semana: number; hora_abertura: string; hora_fechamento: string }[],
  inline = false
): string {
  if (!horariosAtivos || horariosAtivos.length === 0) {
    return 'nossos horários de atendimento'
  }

  const grupos: { [key: string]: number[] } = {}
  for (const h of horariosAtivos) {
    const ab = h.hora_abertura.slice(0, 5)
    const fc = h.hora_fechamento.slice(0, 5)
    const key = `${ab} às ${fc}`
    if (!grupos[key]) {
      grupos[key] = []
    }
    grupos[key].push(h.dia_semana)
  }

  const partes: string[] = []
  const keys = Object.keys(grupos)

  for (const key of keys) {
    const dias = grupos[key].sort((a, b) => a - b)
    const diasFormatados = formatarDiasSemana(dias)
    if (inline) {
      partes.push(`${diasFormatados} das ${key}`)
    } else {
      partes.push(`${diasFormatados}: ${key}`)
    }
  }

  if (inline) {
    if (partes.length === 1) return partes[0]
    if (partes.length === 2) return `${partes[0]} e ${partes[1]}`
    return `${partes.slice(0, -1).join(', ')}, e ${partes[partes.length - 1]}`
  }

  return partes.join('\n')
}

export function formatarMensagemForaHorario(
  mensagemBase: string,
  horarios: { dia_semana: number; hora_abertura: string; hora_fechamento: string; ativo: boolean }[]
): string {
  const horariosAtivos = horarios.filter((h) => h.ativo)
  const diasAtivos = horariosAtivos.map((h) => h.dia_semana)

  const diasFormatados = formatarDiasSemana(diasAtivos)
  let horaInicio = '--:--'
  let horaFim = '--:--'

  if (horariosAtivos.length > 0) {
    horaInicio = horariosAtivos.reduce(
      (min, h) => (h.hora_abertura < min ? h.hora_abertura : min),
      horariosAtivos[0].hora_abertura
    ).slice(0, 5)
    horaFim = horariosAtivos.reduce(
      (max, h) => (h.hora_fechamento > max ? h.hora_fechamento : max),
      horariosAtivos[0].hora_fechamento
    ).slice(0, 5)
  }

  const grade = gerarGradeHorarios(horariosAtivos, false)
  const gradeInline = gerarGradeHorarios(horariosAtivos, true)

  return mensagemBase
    .replace(/\{dias_semana\}/g, diasFormatados)
    .replace(/\{horario_inicio\}/g, horaInicio)
    .replace(/\{horario_fim\}/g, horaFim)
    .replace(/\{grade_horarios\}/g, grade)
    .replace(/\{grade_horarios_inline\}/g, gradeInline)
}
