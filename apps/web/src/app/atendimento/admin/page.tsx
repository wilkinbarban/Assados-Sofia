import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listarUsuariosAdmin, obterEstatisticasMensagens } from '@/app/actions/admin'
import AdminDashboard from '@/components/operator/AdminDashboard'
import { OperatorWorkspaceHeader } from '@/components/operator/OperatorWorkspaceHeader'

export const dynamic = 'force-dynamic'

type AdminPageProps = {
  searchParams: Promise<{ tab?: string | string[] }>
}

const adminTabs = new Set([
  'operadores', 'integracoes', 'conhecimento', 'metricas', 'auditoria',
  'prompt', 'horarios', 'estoque', 'storage-orphans', 'comprovantes',
])

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const supabase = await createClient()
  const requestedTab = (await searchParams).tab
  const initialTab = typeof requestedTab === 'string' && adminTabs.has(requestedTab)
    ? requestedTab
    : 'operadores'

  // 1. Verificar sessão do usuário ativo
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  // 2. Buscar perfil e validar se está ativo e possui papel administrativo (admin/supervisor)
  const { data: perfil, error: perfilError } = await supabase
    .from('perfis')
    .select('id, nome, funcao, ativo')
    .eq('id', user.id)
    .single()

  if (perfilError || !perfil || !perfil.ativo) {
    redirect('/login')
  }

  const allowedRoles = ['admin', 'supervisor']
  if (!allowedRoles.includes(perfil.funcao)) {
    redirect('/login') // Redireciona para o login ou página apropriada
  }

  // 3. Pré-carregar dados via Server Actions e consultas diretas
  const [usuariosRes, estatisticasRes] = await Promise.all([
    listarUsuariosAdmin(),
    obterEstatisticasMensagens()
  ])

  // 4. Buscar últimos 50 logs de auditoria
  const { data: logs, error: logsError } = await supabase
    .from('logs_auditoria')
    .select('*')
    .order('data_criacao', { ascending: false })
    .limit(50)

  if (logsError) {
    console.error('Erro ao buscar logs de auditoria no SSR:', logsError)
  }

  // 5. Buscar artigos de base de conhecimento
  const { data: artigos, error: artigosError } = await supabase
    .from('base_conhecimento')
    .select('id, titulo, conteudo, tags, ativo, data_criacao, data_atualizacao')
    .order('data_criacao', { ascending: false })

  if (artigosError) {
    console.error('Erro ao buscar artigos no SSR:', artigosError)
  }

  // 6. Buscar configurações do sistema
  const { data: dbConfigs, error: configsError } = await supabase
    .from('configuracoes_sistema')
    .select('chave, valor')

  if (configsError) {
    console.error('Erro ao buscar configuracoes do sistema no SSR:', configsError)
  }

  const systemConfigs: Record<string, string> = {
    OPENROUTER_API_KEY: '',
    WHATSAPP_ACCESS_TOKEN: '',
    WHATSAPP_PHONE_NUMBER_ID: '',
    OPENROUTER_MODEL: '',
    WHATSAPP_APP_SECRET: '',
    WHATSAPP_VERIFY_TOKEN: '',
    EVOLUTION_API_URL: '',
    EVOLUTION_API_KEY: '',
    EVOLUTION_INSTANCE_NAME: '',
    WHATSAPP_PROVIDER: 'meta',
    MERCADO_PAGO_ACCESS_TOKEN: '',
    MERCADO_PAGO_PUBLIC_KEY: '',
    MERCADO_PAGO_WEBHOOK_SECRET: '',
    TELEGRAM_BOT_TOKEN: '',
    SOFIA_SYSTEM_PROMPT: '',
  }

  if (dbConfigs) {
    dbConfigs.forEach((cfg) => {
      systemConfigs[cfg.chave] = cfg.valor
    })
  }

  // Fallback to environment variables if not present in the database
  if (!systemConfigs.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY) {
    systemConfigs.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
  }
  if (!systemConfigs.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_ACCESS_TOKEN) {
    systemConfigs.WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN
  }
  if (!systemConfigs.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    systemConfigs.WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID
  }
  if (!systemConfigs.OPENROUTER_MODEL && process.env.OPENROUTER_MODEL) {
    systemConfigs.OPENROUTER_MODEL = process.env.OPENROUTER_MODEL
  }
  if (!systemConfigs.WHATSAPP_APP_SECRET && process.env.WHATSAPP_APP_SECRET) {
    systemConfigs.WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET
  }
  if (!systemConfigs.WHATSAPP_VERIFY_TOKEN && process.env.WHATSAPP_VERIFY_TOKEN) {
    systemConfigs.WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN
  }
  if (!systemConfigs.EVOLUTION_API_URL && process.env.EVOLUTION_API_URL) {
    systemConfigs.EVOLUTION_API_URL = process.env.EVOLUTION_API_URL
  }
  if (!systemConfigs.EVOLUTION_API_KEY && process.env.EVOLUTION_API_KEY) {
    systemConfigs.EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY
  }
  if (!systemConfigs.EVOLUTION_INSTANCE_NAME && process.env.EVOLUTION_INSTANCE_NAME) {
    systemConfigs.EVOLUTION_INSTANCE_NAME = process.env.EVOLUTION_INSTANCE_NAME
  }
  if (!systemConfigs.WHATSAPP_PROVIDER && process.env.WHATSAPP_PROVIDER) {
    systemConfigs.WHATSAPP_PROVIDER = process.env.WHATSAPP_PROVIDER
  }
  if (!systemConfigs.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN) {
    systemConfigs.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
  }
  if (!systemConfigs.SOFIA_SYSTEM_PROMPT && process.env.SOFIA_SYSTEM_PROMPT) {
    systemConfigs.SOFIA_SYSTEM_PROMPT = process.env.SOFIA_SYSTEM_PROMPT
  }
  if (!systemConfigs.MERCADO_PAGO_ACCESS_TOKEN && process.env.MERCADO_PAGO_ACCESS_TOKEN) {
    systemConfigs.MERCADO_PAGO_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN
  }
  if (!systemConfigs.MERCADO_PAGO_PUBLIC_KEY && process.env.MERCADO_PAGO_PUBLIC_KEY) {
    systemConfigs.MERCADO_PAGO_PUBLIC_KEY = process.env.MERCADO_PAGO_PUBLIC_KEY
  }
  if (!systemConfigs.MERCADO_PAGO_WEBHOOK_SECRET && process.env.MERCADO_PAGO_WEBHOOK_SECRET) {
    systemConfigs.MERCADO_PAGO_WEBHOOK_SECRET = process.env.MERCADO_PAGO_WEBHOOK_SECRET
  }
  if (!systemConfigs.OMNIROUTE_BASE_URL && process.env.OMNIROUTE_BASE_URL) {
    systemConfigs.OMNIROUTE_BASE_URL = process.env.OMNIROUTE_BASE_URL
  }
  if (!systemConfigs.OMNIROUTE_API_KEY && process.env.OMNIROUTE_API_KEY) {
    systemConfigs.OMNIROUTE_API_KEY = process.env.OMNIROUTE_API_KEY
  }
  if (!systemConfigs.AI_ROUTING_V2_ENABLED && process.env.AI_ROUTING_V2_ENABLED) {
    systemConfigs.AI_ROUTING_V2_ENABLED = process.env.AI_ROUTING_V2_ENABLED
  }
  if (!systemConfigs.AI_ROUTING_LEGACY_FALLBACK_ENABLED && process.env.AI_ROUTING_LEGACY_FALLBACK_ENABLED) {
    systemConfigs.AI_ROUTING_LEGACY_FALLBACK_ENABLED = process.env.AI_ROUTING_LEGACY_FALLBACK_ENABLED
  }

  // 7. Configuração do Google Calendar
  const calendarConfig = {
    googleCalendarId: process.env.GOOGLE_CALENDAR_ID || null,
    googleClientEmail: process.env.GOOGLE_CLIENT_EMAIL || null,
    googlePrivateKeyConfigured: !!process.env.GOOGLE_PRIVATE_KEY
  }

  return (
    <div className="flex h-screen w-full flex-col bg-zinc-950 text-zinc-50 overflow-hidden font-sans">
      <OperatorWorkspaceHeader
        active="admin"
        role={perfil.funcao}
        adminTab={initialTab}
      />

      {/* Conteúdo Principal */}
      <main className="flex-1 overflow-hidden">
        <AdminDashboard
          initialTab={initialTab as 'operadores'}
          usuarioLogado={{
            id: perfil.id,
            nome: perfil.nome,
            funcao: perfil.funcao,
            ativo: perfil.ativo
          }}
          usuariosIniciais={usuariosRes.success ? (usuariosRes.data || []) : []}
          estatisticasIniciais={estatisticasRes.success ? (estatisticasRes.data || { totalIa: 0, totalOperador: 0, totalCliente: 0, totalMensagens: 0, taxaAutomacao: 0 }) : { totalIa: 0, totalOperador: 0, totalCliente: 0, totalMensagens: 0, taxaAutomacao: 0 }}
          logsIniciais={logs || []}
          calendarConfig={calendarConfig}
          artigosIniciais={artigos || []}
          systemConfigs={systemConfigs}
        />
      </main>
    </div>
  )
}
