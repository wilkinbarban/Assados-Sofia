'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { formatarMensagemForaHorario } from '@/lib/horarios/formatar'

const horarioDiaSchema = z.object({
  dia_semana: z.number().int().min(0).max(6),
  hora_abertura: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Formato inválido (HH:MM)'),
  hora_fechamento: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Formato inválido (HH:MM)'),
  ativo: z.boolean(),
}).refine(
  (data) => data.hora_abertura < data.hora_fechamento,
  { message: 'A hora de abertura deve ser anterior à hora de fechamento', path: ['hora_fechamento'] }
)

const mensagemSchema = z.object({
  mensagem: z.string().min(1, 'A mensagem é obrigatória'),
})

async function verificarPermissaoAdminSupervisor() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { authorized: false, error: 'ACESSO_NEGADO_NAO_AUTENTICADO' }
  }

  const { data: perfil, error: perfilError } = await supabase
    .from('perfis')
    .select('funcao, ativo')
    .eq('id', user.id)
    .single()

  if (perfilError || !perfil) {
    return { authorized: false, error: 'PERFIL_NAO_ENCONTRADO' }
  }

  if (!perfil.ativo) {
    return { authorized: false, error: 'PERFIL_INATIVO' }
  }

  const funcoesAutorizadas = ['admin', 'supervisor']
  if (!funcoesAutorizadas.includes(perfil.funcao)) {
    return { authorized: false, error: 'ACESSO_NEGADO_PERMISSAO_INSUFICIENTE' }
  }

  return { authorized: true, user, supabase }
}

export async function salvarHorarioDia(
  dia_semana: number,
  hora_abertura: string,
  hora_fechamento: string,
  ativo: boolean
) {
  try {
    const check = await verificarPermissaoAdminSupervisor()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    const validation = horarioDiaSchema.safeParse({ dia_semana, hora_abertura, hora_fechamento, ativo })
    if (!validation.success) {
      return {
        success: false,
        error: 'DADOS_INVALIDOS',
        details: validation.error.flatten().fieldErrors,
      }
    }

    const adminSupabase = createAdminClient()

    const { data, error } = await adminSupabase
      .from('horarios_atendimento')
      .upsert({
        dia_semana: validation.data.dia_semana,
        hora_abertura: validation.data.hora_abertura,
        hora_fechamento: validation.data.hora_fechamento,
        ativo: validation.data.ativo,
      }, { onConflict: 'dia_semana' })
      .select()
      .single()

    if (error) {
      console.error('Erro ao salvar horário:', error)
      return { success: false, error: `ERRO_BANCO: ${error.message}` }
    }

    if (check.user) {
      await adminSupabase.from('logs_auditoria').insert({
        usuario_id: check.user.id,
        acao: 'salvar_horario_dia',
        detalhes: { dia_semana, hora_abertura, hora_fechamento, ativo },
      })
    }

    revalidatePath('/atendimento/admin')
    return { success: true, data }
  } catch (error: any) {
    console.error('Erro na action salvarHorarioDia:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

export async function listarHorarios() {
  try {
    const adminSupabase = createAdminClient()

    const { data, error } = await adminSupabase
      .from('horarios_atendimento')
      .select('*')
      .order('dia_semana', { ascending: true })

    if (error) {
      console.error('Erro ao listar horários:', error)
      return { success: false, error: `ERRO_BANCO: ${error.message}` }
    }

    const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

    const todosHorarios = Array.from({ length: 7 }, (_, i) => {
      const existente = data?.find((h) => h.dia_semana === i)
      if (existente) {
        return {
          id: existente.id,
          dia_semana: i,
          dia_nome: diasSemana[i],
          hora_abertura: existente.hora_abertura.substring(0, 5),
          hora_fechamento: existente.hora_fechamento.substring(0, 5),
          ativo: existente.ativo,
        }
      }
      return {
        id: null,
        dia_semana: i,
        dia_nome: diasSemana[i],
        hora_abertura: '09:00',
        hora_fechamento: '18:00',
        ativo: false,
      }
    })

    return { success: true, data: todosHorarios }
  } catch (error: any) {
    console.error('Erro na action listarHorarios:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

export async function salvarMensagemForaHorario(mensagem: string) {
  try {
    const check = await verificarPermissaoAdminSupervisor()
    if (!check.authorized) {
      return { success: false, error: check.error }
    }

    const validation = mensagemSchema.safeParse({ mensagem })
    if (!validation.success) {
      return {
        success: false,
        error: 'DADOS_INVALIDOS',
        details: validation.error.flatten().fieldErrors,
      }
    }

    const adminSupabase = createAdminClient()

    const { error } = await adminSupabase
      .from('configuracoes_sistema')
      .upsert({
        chave: 'MENSAGEM_FORA_HORARIO',
        valor: validation.data.mensagem,
        eh_segredo: false,
        data_atualizacao: new Date().toISOString(),
      }, { onConflict: 'chave' })

    if (error) {
      console.error('Erro ao salvar mensagem fora de horário:', error)
      return { success: false, error: `ERRO_BANCO: ${error.message}` }
    }

    if (check.user) {
      await adminSupabase.from('logs_auditoria').insert({
        usuario_id: check.user.id,
        acao: 'salvar_mensagem_fora_horario',
        detalhes: { mensagem: mensagem.substring(0, 100) },
      })
    }

    revalidatePath('/atendimento/admin')
    return { success: true }
  } catch (error: any) {
    console.error('Erro na action salvarMensagemForaHorario:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}

export async function obterMensagemForaHorario() {
  try {
    const adminSupabase = createAdminClient()

    const { data: config, error: configError } = await adminSupabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'MENSAGEM_FORA_HORARIO')
      .maybeSingle()

    if (configError) {
      console.error('Erro ao buscar MENSAGEM_FORA_HORARIO:', configError)
    }

    const mensagemBase = config?.valor || ''

    const { data: horarios, error: horariosError } = await adminSupabase
      .from('horarios_atendimento')
      .select('dia_semana, hora_abertura, hora_fechamento, ativo')
      .eq('ativo', true)
      .order('dia_semana', { ascending: true })

    if (horariosError) {
      console.error('Erro ao buscar horários ativos:', horariosError)
    }

    if (horarios && horarios.length > 0) {
      const mensagem = formatarMensagemForaHorario(mensagemBase, horarios)
      return { success: true, data: mensagem }
    }

    const mensagem = formatarMensagemForaHorario(mensagemBase, [])
    return { success: true, data: mensagem }
  } catch (error: any) {
    console.error('Erro na action obterMensagemForaHorario:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}
