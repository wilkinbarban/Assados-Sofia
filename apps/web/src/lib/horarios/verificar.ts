import { createAdminClient } from '@/lib/supabase/admin'
import { formatarMensagemForaHorario } from './formatar'

export async function verificarHorarioAtendimento(): Promise<{
  dentro: boolean
  mensagem?: string
}> {
  try {
    const supabase = createAdminClient()

    // Obter a data e hora atual na timezone America/Sao_Paulo (Curitiba)
    const agora = new Date()
    const tzString = agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
    const dateInTimezone = new Date(tzString)
    const diaSemana = dateInTimezone.getDay()
    const minutosAtual = dateInTimezone.getHours() * 60 + dateInTimezone.getMinutes()

    const { data: horario, error } = await supabase
      .from('horarios_atendimento')
      .select('hora_abertura, hora_fechamento')
      .eq('dia_semana', diaSemana)
      .eq('ativo', true)
      .maybeSingle()

    if (error) {
      console.error('Erro ao verificar horário de atendimento:', error)
    }

    if (!horario) {
      const mensagem = await gerarMensagemForaHorario()
      return { dentro: false, mensagem }
    }

    const [ah, am] = horario.hora_abertura.split(':').map(Number)
    const [fh, fm] = horario.hora_fechamento.split(':').map(Number)
    const abertura = ah * 60 + am
    const fechamento = fh * 60 + fm

    if (minutosAtual >= abertura && minutosAtual <= fechamento) {
      return { dentro: true }
    }

    const mensagem = await gerarMensagemForaHorario()
    return { dentro: false, mensagem }
  } catch (error) {
    console.error('Erro ao verificar horário de atendimento:', error)
    // Fail Closed: Em caso de falha de banco ou runtime, rejeitar e informar erro
    return { dentro: false, mensagem: 'Erro de conexão ao verificar o horário de funcionamento.' }
  }
}

export async function gerarMensagemForaHorario(): Promise<string> {
  try {
    const supabase = createAdminClient()

    const { data: config } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'MENSAGEM_FORA_HORARIO')
      .maybeSingle()

    const mensagemBase = config?.valor || ''

    const { data: horarios } = await supabase
      .from('horarios_atendimento')
      .select('dia_semana, hora_abertura, hora_fechamento, ativo')
      .eq('ativo', true)
      .order('dia_semana', { ascending: true })

    if (!horarios) {
      return mensagemBase
    }

    return formatarMensagemForaHorario(mensagemBase, horarios)
  } catch (error) {
    console.error('Erro ao gerar mensagem fora de horário:', error)
    return 'Olá! No momento estamos fora do nosso horário de atendimento. Por favor, entre em contato durante nosso horário de funcionamento.'
  }
}
