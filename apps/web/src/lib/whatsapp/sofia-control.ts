import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

export type WhatsAppSofiaChannel = 'whatsapp'
export type SofiaSleepReason = 'manual' | 'handoff_phrase' | 'cooldown_operador' | 'opt_out'
export type SofiaSleepSource = 'operator' | 'meta_webhook' | 'evolution_webhook'

export interface WhatsAppSofiaState {
  id: string
  clienteId: string
  canal: WhatsAppSofiaChannel
  sleeping: boolean
  reason: SofiaSleepReason | null
  source: SofiaSleepSource | null
  actorUserId: string | null
  silenciadaAte?: string | null
  createdAt: string
  updatedAt: string
}

export interface SetWhatsAppSofiaSleepInput {
  supabase?: SupabaseClient
  clienteId: string
  sleeping: boolean
  reason: SofiaSleepReason
  source: SofiaSleepSource
  actorUserId?: string | null
  silenciadaAte?: string | null
}

export interface GetWhatsAppSofiaStateInput {
  supabase?: SupabaseClient
  clienteId: string
}

export interface ResolveWhatsAppInboundConversationInput {
  supabase?: SupabaseClient
  clienteId: string
  inboundText: string | null
  source: Extract<SofiaSleepSource, 'meta_webhook' | 'evolution_webhook'>
}

export interface ResolveWhatsAppInboundConversationOutput {
  conversaId: string
  iaAtiva: boolean
  sleeping: boolean
  handoffTriggered: boolean
  state: WhatsAppSofiaState | null
}

export interface IsWhatsAppInboundEligibleForSofiaInput {
  supabase?: SupabaseClient
  clienteId: string
  conversaId?: string | null
  iaAtiva?: boolean | null
}

export interface IsWhatsAppInboundEligibleForSofiaOutput {
  eligible: boolean
  sleeping: boolean
  iaAtiva: boolean
  state: WhatsAppSofiaState | null
}

const WHATSAPP_CHANNEL: WhatsAppSofiaChannel = 'whatsapp'
const HANDOFF_PATTERNS = [
  /\bhumano\b/i,
  /\batendente\b/i,
  /\bquiero\s+hablar\s+con\s+alguien\b/i,
]

type WhatsAppSofiaStateRow = {
  id: string
  cliente_id: string
  canal: WhatsAppSofiaChannel
  sofia_dormindo: boolean
  motivo: SofiaSleepReason | null
  origem: SofiaSleepSource | null
  alterado_por: string | null
  silenciada_ate?: string | null
  data_criacao: string
  data_atualizacao: string
}

type ConversationRow = {
  id: string
  ia_ativa: boolean
}

function getSupabaseClient(supabase?: SupabaseClient): SupabaseClient {
  return supabase ?? createAdminClient()
}

function mapState(row: WhatsAppSofiaStateRow): WhatsAppSofiaState {
  let isSleeping = row.sofia_dormindo

  // Verificar se cooldown expirou
  if (isSleeping && row.silenciada_ate) {
    if (new Date(row.silenciada_ate) <= new Date()) {
      isSleeping = false
    }
  }

  return {
    id: row.id,
    clienteId: row.cliente_id,
    canal: row.canal,
    sleeping: isSleeping,
    reason: row.motivo,
    source: row.origem,
    actorUserId: row.alterado_por,
    silenciadaAte: row.silenciada_ate || null,
    createdAt: row.data_criacao,
    updatedAt: row.data_atualizacao,
  }
}

export function normalizeHandoffText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function containsWhatsAppHandoffPhrase(text: string | null | undefined): boolean {
  if (!text) return false

  const normalizedText = normalizeHandoffText(text)
  return HANDOFF_PATTERNS.some((pattern) => pattern.test(normalizedText))
}

export async function getWhatsAppSofiaState(
  input: GetWhatsAppSofiaStateInput
): Promise<WhatsAppSofiaState | null> {
  const supabase = getSupabaseClient(input.supabase)

  const { data, error } = await supabase
    .from('whatsapp_sofia_states')
    .select('id, cliente_id, canal, sofia_dormindo, motivo, origem, alterado_por, silenciada_ate, data_criacao, data_atualizacao')
    .eq('cliente_id', input.clienteId)
    .eq('canal', WHATSAPP_CHANNEL)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to fetch WhatsApp Sofia state: ${error.message}`)
  }

  return data ? mapState(data as WhatsAppSofiaStateRow) : null
}

export async function setWhatsAppSofiaSleep(
  input: SetWhatsAppSofiaSleepInput
): Promise<WhatsAppSofiaState> {
  const supabase = getSupabaseClient(input.supabase)

  const { data, error } = await supabase
    .from('whatsapp_sofia_states')
    .upsert(
      {
        cliente_id: input.clienteId,
        canal: WHATSAPP_CHANNEL,
        sofia_dormindo: input.sleeping,
        motivo: input.reason,
        origem: input.source,
        alterado_por: input.actorUserId ?? null,
        silenciada_ate: input.silenciadaAte ?? null,
      },
      { onConflict: 'cliente_id,canal' }
    )
    .select('id, cliente_id, canal, sofia_dormindo, motivo, origem, alterado_por, silenciada_ate, data_criacao, data_atualizacao')
    .single()

  if (error) {
    throw new Error(`Failed to set WhatsApp Sofia sleep state: ${error.message}`)
  }

  return mapState(data as WhatsAppSofiaStateRow)
}

async function findConversation(
  supabase: SupabaseClient,
  clienteId: string,
  status: 'ia_atendendo' | 'aberta'
): Promise<ConversationRow | null> {
  const { data, error } = await supabase
    .from('conversas')
    .select('id, ia_ativa')
    .eq('cliente_id', clienteId)
    .eq('status', status)
    .order('data_atualizacao', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to find ${status} conversation: ${error.message}`)
  }

  return data as ConversationRow | null
}

async function createConversation(
  supabase: SupabaseClient,
  clienteId: string,
  status: 'ia_atendendo' | 'aberta',
  iaAtiva: boolean
): Promise<ConversationRow> {
  const { data, error } = await supabase
    .from('conversas')
    .insert({
      cliente_id: clienteId,
      status,
      ia_ativa: iaAtiva,
    })
    .select('id, ia_ativa')
    .single()

  if (error) {
    throw new Error(`Failed to create ${status} conversation: ${error.message}`)
  }

  return data as ConversationRow
}

async function resolveHumanConversation(
  supabase: SupabaseClient,
  clienteId: string
): Promise<ConversationRow> {
  return (
    (await findConversation(supabase, clienteId, 'aberta')) ??
    (await createConversation(supabase, clienteId, 'aberta', false))
  )
}

async function resolveSofiaConversation(
  supabase: SupabaseClient,
  clienteId: string
): Promise<ConversationRow> {
  return (
    (await findConversation(supabase, clienteId, 'ia_atendendo')) ??
    (await createConversation(supabase, clienteId, 'ia_atendendo', true))
  )
}

export async function resolveWhatsAppInboundConversation(
  input: ResolveWhatsAppInboundConversationInput
): Promise<ResolveWhatsAppInboundConversationOutput> {
  const supabase = getSupabaseClient(input.supabase)
  const handoffTriggered = containsWhatsAppHandoffPhrase(input.inboundText)
  let state = await getWhatsAppSofiaState({ supabase, clienteId: input.clienteId })

  if (handoffTriggered) {
    state = await setWhatsAppSofiaSleep({
      supabase,
      clienteId: input.clienteId,
      sleeping: true,
      reason: 'handoff_phrase',
      source: input.source,
    })
  }

  const sleeping = handoffTriggered || state?.sleeping === true
  const conversation = sleeping
    ? await resolveHumanConversation(supabase, input.clienteId)
    : await resolveSofiaConversation(supabase, input.clienteId)

  return {
    conversaId: conversation.id,
    iaAtiva: !sleeping && conversation.ia_ativa,
    sleeping,
    handoffTriggered,
    state,
  }
}

export async function isWhatsAppInboundEligibleForSofia(
  input: IsWhatsAppInboundEligibleForSofiaInput
): Promise<IsWhatsAppInboundEligibleForSofiaOutput> {
  const supabase = getSupabaseClient(input.supabase)
  const state = await getWhatsAppSofiaState({ supabase, clienteId: input.clienteId })
  let iaAtiva = input.iaAtiva ?? null

  if (iaAtiva === null && input.conversaId) {
    const { data, error } = await supabase
      .from('conversas')
      .select('ia_ativa')
      .eq('id', input.conversaId)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to check conversation IA eligibility: ${error.message}`)
    }

    iaAtiva = Boolean(data?.ia_ativa)
  }

  const sleeping = state?.sleeping === true
  const conversationIaActive = iaAtiva === true

  return {
    eligible: conversationIaActive && !sleeping,
    sleeping,
    iaAtiva: conversationIaActive,
    state,
  }
}
