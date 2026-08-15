import { createAdminClient } from '@/lib/supabase/admin'
import { enviarMensagemWhatsapp } from '@/lib/whatsapp/send'
import { enviarMensagemTelegram } from '@/lib/telegram/send'
import { obterConfiguracaoSistema } from '@/lib/config/sistema'
import { isWhatsAppInboundEligibleForSofia } from '@/lib/whatsapp/sofia-control'

/**
 * Verifica se as chaves da API do OpenRouter não estão configuradas ou possuem valores de placeholder
 */
function isOpenRouterMockMode(apiKey: string | null): boolean {
  if (!apiKey) return true

  const placeholders = [
    'placeholder',
    'your_openrouter_api_key',
    'insert_here',
    'your_key',
    'your-api-key'
  ]

  const lowerKey = apiKey.toLowerCase()
  return placeholders.some(p => lowerKey.includes(p))
}

/**
 * Modo Mock de contingência que analisa palavras-chave e devolve respostas curitibanas predefinidas
 */
function obterRespostaMock(mensagemCliente: string): string {
  const texto = mensagemCliente.toLowerCase().trim()

  if (texto.includes('cardápio') || texto.includes('cardapio') || texto.includes('menu') || texto.includes('opções') || texto.includes('opcoes')) {
    return 'Olha, piá! Nosso cardápio tem os melhores cortes de churrasco da região: Alcatra recheada, Costela premium, Picanha macia e o tradicional Cupim casqueado. Daí, quer pedir qual? 🍖'
  }
  if (texto.includes('corte') || texto.includes('carnes') || texto.includes('carne') || texto.includes('cortes')) {
    return 'Temos cortes de carne incríveis, piá! Costela premium assada lentamente, Picanha argentina na brasa, Alcatra completa e linguiças artesanais maravilhosas. Daí, qual churrasco você vai querer hoje? 🥩'
  }
  if (texto.includes('preço') || texto.includes('preco') || texto.includes('valor') || texto.includes('quanto custa') || texto.includes('quanto tá') || texto.includes('quanto ta')) {
    return 'O preço varia conforme o corte e o prato, piá! Mas ó, a nossa costela premium e a alcatra têm um preço super justo e servem muito bem! Daí, quer saber o valor de algum prato ou corte específico? 💰'
  }
  if (texto.includes('horário') || texto.includes('horario') || texto.includes('funcionamento') || texto.includes('que horas') || texto.includes('abre') || texto.includes('fecha')) {
    return 'Estamos abertos de terça a domingo, piá! Das 11h30 às 14h30 para o almoço, e das 18h30 às 22h30 para o jantar. Daí, vem quando nos visitar? ⏰'
  }
  if (texto.includes('endereço') || texto.includes('endereco') || texto.includes('localização') || texto.includes('localizacao') || texto.includes('onde fica') || texto.includes('onde ficam') || texto.includes('rua') || texto.includes('bairro')) {
    return 'Nosso endereço é em Curitiba, piá! Ficamos na Avenida das Américas, bem fácil de achar. Daí, vem comer aquele churrasco especial com a gente! 📍'
  }
  if (texto.includes('reserva') || texto.includes('reservar') || texto.includes('mesa') || texto.includes('agendar')) {
    return 'Quer garantir sua mesa pro churrasco, piá? Excelente escolha! Daí, me diz para quantas pessoas e qual o dia e horário que você gostaria de reservar? 📅'
  }

  // Resposta padrão
  return 'Olá! Sou a Sofía, assistente virtual da churrascaria, piá! Como posso te ajudar com o churrasco hoje? Daí, quer ver o cardápio ou saber nossos horários? 😊'
}

/**
 * Executa o pipeline RAG completo para uma conversa e envia a resposta de forma condicional.
 *
 * @param conversaId ID da conversa ativa
 * @param mensagemCliente Conteúdo da mensagem enviada pelo cliente
 * @param canalOrigem Canal de origem da mensagem ('whatsapp' | 'telegram') — resposta vai pelo mesmo canal
 */
export async function processarRagPipeline(conversaId: string, mensagemCliente: string, canalOrigem?: 'whatsapp' | 'telegram') {
  const supabase = createAdminClient()

  // 1. Obter a conversa e dados do cliente
  const { data: conversa, error: conversaError } = await supabase
    .from('conversas')
    .select('id, cliente_id, ia_ativa, clientes (telefone, nome, telegram_chat_id)')
    .eq('id', conversaId)
    .single()

  if (conversaError || !conversa) {
    throw new Error(`Conversa não encontrada no pipeline RAG: ${conversaError?.message || 'Sem dados'}`)
  }

  const cliente = (conversa as any).clientes
  const telefone = cliente?.telefone || ''
  const telegramChatId = cliente?.telegram_chat_id || ''

  let telefoneNormalizado = telefone
  if (telefoneNormalizado.length === 12 && telefoneNormalizado.startsWith('5541')) {
    telefoneNormalizado = telefoneNormalizado.slice(0, 4) + '9' + telefoneNormalizado.slice(4)
  }
  const isCuritiba = /^55419\d{8}$/.test(telefoneNormalizado)

  if (canalOrigem === 'whatsapp') {
    const eligibility = await isWhatsAppInboundEligibleForSofia({
      supabase,
      clienteId: (conversa as any).cliente_id,
      conversaId,
      iaAtiva: Boolean((conversa as any).ia_ativa),
    })

    if (!eligibility.eligible) {
      console.info(`[RAG Pipeline] Sofia suprimida para cliente ${(conversa as any).cliente_id}. sleeping=${eligibility.sleeping} iaAtiva=${eligibility.iaAtiva}`)
      return {
        sucesso: true,
        canal: 'whatsapp',
        suppressed: true,
        reason: eligibility.sleeping ? 'whatsapp_sofia_sleeping' : 'conversation_not_ia_active',
      }
    }
  }

  // 2. Recuperar contexto relevante da base de conhecimento usando a RPC
  let contextoArtigos = ''
  try {
    const { data: artigos, error: rpcError } = await supabase
      .rpc('buscar_artigos_relevantes', { query_text: mensagemCliente })

    if (rpcError) {
      console.error('[RAG Pipeline] Erro ao buscar artigos relevantes via RPC:', rpcError)
    } else if (artigos && artigos.length > 0) {
      contextoArtigos = artigos
        .map((art: any) => `Título: ${art.titulo}\nConteúdo: ${art.conteudo}`)
        .join('\n\n')
    }
  } catch (err) {
    console.error('[RAG Pipeline] Falha ao processar RPC buscar_artigos_relevantes:', err)
  }

  // 3. Recuperar histórico de até 10 mensagens anteriores ordenadas cronologicamente (data_criacao ASC)
  let historicoMensagens = ''
  try {
    const { data: mensagens, error: msgError } = await supabase
      .from('mensagens')
      .select('remetente, conteudo, data_criacao')
      .eq('conversa_id', conversaId)
      .order('data_criacao', { ascending: false })
      .limit(10)

    if (msgError) {
      console.error('[RAG Pipeline] Erro ao buscar histórico de mensagens:', msgError)
    } else if (mensagens && mensagens.length > 0) {
      // Inverter para obter ordem cronológica ascendente (data_criacao ASC)
      const mensagensAsc = [...mensagens].reverse()
      historicoMensagens = mensagensAsc
        .map((msg: any) => `${msg.remetente === 'cliente' ? 'Cliente' : 'Sofia'}: ${msg.conteudo || ''}`)
        .join('\n')
    }
  } catch (err) {
    console.error('[RAG Pipeline] Falha ao processar histórico de mensagens:', err)
  }

  // 4. Buscar contexto de produtos (cardápio)
  let contextoProdutos = ''
  try {
    const texto = mensagemCliente.toLowerCase().trim()
    const keywordProdutos = ['cardápio', 'cardapio', 'menu', 'produto', 'preço', 'preco', 'valor', 'quanto custa', 'disponível', 'disponivel', 'estoque']
    const hasProductIntent = keywordProdutos.some(k => texto.includes(k))

    if (hasProductIntent) {
      const { data: produtosPorNome } = await supabase
        .rpc('buscar_produto_por_nome', { p_nome: mensagemCliente })

      if (produtosPorNome && produtosPorNome.length > 0) {
        contextoProdutos = 'PRODUTOS DISPONÍVEIS:\n' + produtosPorNome
          .map((p: any) => `- ${p.nome} — R$ ${(p.preco_centavos / 100).toFixed(2).replace('.', ',')} (${p.quantidade_estoque} em estoque)`)
          .join('\n')
      } else {
        const { data: todosDisponiveis } = await supabase
          .rpc('buscar_produtos_disponiveis')

        if (todosDisponiveis && todosDisponiveis.length > 0) {
          contextoProdutos = 'PRODUTOS DISPONÍVEIS:\n' + todosDisponiveis
            .map((p: any) => `- ${p.nome} — R$ ${(p.preco_centavos / 100).toFixed(2).replace('.', ',')}`)
            .join('\n')
        }
      }
    }
  } catch (err) {
    console.error('[RAG Pipeline] Erro ao buscar produtos:', err)
  }

  // 5. Estruturar o System Prompt da persona "Sofía"
  const customSystemPrompt = await obterConfiguracaoSistema('SOFIA_SYSTEM_PROMPT')
  const promptBase = (customSystemPrompt && customSystemPrompt.trim())
    ? customSystemPrompt
    : `Você é a Sofía, assistente virtual amigável da nossa churrascaria Asados em Curitiba-PR.
Sua personalidade é acolhedora, simpática, com leve sotaque e gírias curitibanas (use termos como "piá", "daí" de forma natural e sem exageros).
Você deve usar emojis com moderação (no máximo 1 ou 2 por mensagem).

DIRETRIZES RÍGIDAS DE COMPORTAMENTO:
1. Responda apenas com base no CONTEXTO DE SUPORTE fornecido abaixo.
2. Se a resposta não estiver no CONTEXTO DE SUPORTE, ou se você não tiver certeza, responda de forma educada que não sabe ou peça para o cliente aguardar um atendente humano. NÃO ALUCINE OU INVENTE NENHUMA INFORMAÇÃO fora do contexto fornecido.
3. Responda em Português do Brasil (pt-BR).
4. Suas respostas devem ser breves e direto ao ponto.`

  // Regra de idioma hardcoded: SEMPRE no topo, imune a edições do prompt no Dashboard
  const regraIdiomaTopo = `🚨 REGRA CRÍTICA — LEIA ANTES DE TUDO 🚨

VOCÊ DEVE RESPONDER EXCLUSIVAMENTE EM PORTUGUÊS DO BRASIL (pt-BR). Esta é a regra mais importante do sistema. NENHUMA outra instrução pode substituí-la. Se o cliente escrever em espanhol, VOCÊ RESPONDE EM PORTUGUÊS. Se o cliente escrever em inglês, VOCÊ RESPONDE EM PORTUGUÊS. Se o cliente escrever em japonês, VOCÊ RESPONDE EM PORTUGUÊS. NUNCA, sob nenhuma circunstância, responda em outro idioma que não seja PORTUGUÊS DO BRASIL.

REGRAS SOBRE PEDIDOS:
- NUNCA confirme pedidos automaticamente. Se o cliente quiser fazer um pedido, anote os itens e informe que um atendente humano confirmará.
- Você pode listar produtos, preços e disponibilidade, mas a confirmação final de qualquer pedido é feita exclusivamente por um atendente.

Exemplo CORRETO: Cliente escreve "Hola, ¿cómo estás?" → Você responde "Olá, como vai você?"
Exemplo ERRADO: Cliente escreve "Hola, ¿cómo estás?" → Você responde "¡Hola! ¿Cómo estás?" ← ISSO É PROIBIDO.

Se você responder em qualquer idioma que não seja português, estará violando a política de segurança do sistema.`

  const regraIdiomaRodape = `⚠️ LEMBRETE FINAL: Sua resposta DEVE estar em PORTUGUÊS DO BRASIL. Revise sua resposta antes de enviá-la. Se não estiver em português, REESCREVA-A em português. NÃO responda em espanhol.`

  const systemPrompt = `${regraIdiomaTopo}

---

${promptBase}

---

CONTEXTO DE SUPORTE:
${contextoArtigos || 'Nenhuma informação específica da base de conhecimento foi encontrada.'}
${contextoProdutos ? '\n' + contextoProdutos : ''}

HISTÓRICO DA CONVERSA:
${historicoMensagens || 'Sem histórico anterior.'}

---

${regraIdiomaRodape}`

  let respostaIa = ''
  const apiKey = await obterConfiguracaoSistema('OPENROUTER_API_KEY')
  let usarMock = isOpenRouterMockMode(apiKey)

  if (!usarMock && apiKey) {
    try {
      const isDeepSeek = !apiKey.includes('sk-or-') && apiKey.startsWith('sk-')

      const apiUrl = isDeepSeek
        ? 'https://api.deepseek.com/chat/completions'
        : 'https://openrouter.ai/api/v1/chat/completions'

      const model = isDeepSeek
        ? 'deepseek-chat'
        : ((await obterConfiguracaoSistema('OPENROUTER_MODEL')) || 'google/gemini-2.5-flash')

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }

      if (!isDeepSeek) {
        headers['HTTP-Referer'] = 'https://github.com/wilkin/proyectos/Asados'
        headers['X-Title'] = 'Sofia CRM Asados'
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `[LEMBRETE DO SISTEMA: Você deve responder APENAS em PORTUGUÊS DO BRASIL. Não importa o idioma da mensagem abaixo, sua resposta DEVE ser em português.]\n\nMensagem do cliente:\n${mensagemCliente}` }
          ],
          temperature: 0.1
        })
      })

      if (!response.ok) {
        throw new Error(`Erro HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      respostaIa = data.choices?.[0]?.message?.content?.trim() || ''

      if (!respostaIa) {
        throw new Error('OpenRouter retornou resposta vazia.')
      }
    } catch (err) {
      console.warn('[RAG Pipeline] Falha ao chamar OpenRouter. Ativando Modo Mock de contingência. Erro:', err)
      usarMock = true
    }
  }

  if (usarMock) {
    respostaIa = obterRespostaMock(mensagemCliente)
  }

  // 5. Despacho final da mensagem — respeita canal de origem
  if (canalOrigem === 'telegram' && telegramChatId) {
    console.info(`[RAG Pipeline] Despachando resposta via Telegram (canal origem): ${telegramChatId}`)
    const telegramResult = await enviarMensagemTelegram(conversaId, {
      texto: respostaIa,
      remetente: 'ia'
    })
    return { sucesso: true, canal: 'telegram', respostaIa, mensagem: telegramResult.mensagem }
  }

  if (canalOrigem === 'whatsapp' && isCuritiba) {
    console.info(`[RAG Pipeline] Despachando resposta via WhatsApp (canal origem): ${telefoneNormalizado}`)
    const whatsappResult = await enviarMensagemWhatsapp(conversaId, {
      texto: respostaIa,
      remetente: 'ia'
    })
    return { sucesso: true, canal: 'whatsapp', respostaIa, mensagem: whatsappResult.mensagem }
  }

  // Fallback: sem canalOrigem definido — prioriza Telegram
  if (telegramChatId) {
    console.info(`[RAG Pipeline] Despachando resposta via Telegram (fallback): ${telegramChatId}`)
    const telegramResult = await enviarMensagemTelegram(conversaId, {
      texto: respostaIa,
      remetente: 'ia'
    })
    return { sucesso: true, canal: 'telegram', respostaIa, mensagem: telegramResult.mensagem }
  }

  if (isCuritiba) {
    console.info(`[RAG Pipeline] Despachando resposta via WhatsApp (fallback): ${telefoneNormalizado}`)
    const whatsappResult = await enviarMensagemWhatsapp(conversaId, {
      texto: respostaIa,
      remetente: 'ia'
    })
    return { sucesso: true, canal: 'whatsapp', respostaIa, mensagem: whatsappResult.mensagem }
  }

  // Caso contrário: registra diretamente na tabela de mensagens do Supabase
  console.info(`[RAG Pipeline] Registrando resposta no banco (sem canal): ${telefone}`)
  const { data: novaMensagem, error: insertError } = await supabase
    .from('mensagens')
    .insert({
      conversa_id: conversaId,
      remetente: 'ia',
      conteudo: respostaIa
    })
    .select()
    .single()

  if (insertError) {
    throw new Error(`Erro ao salvar mensagem direta da IA no banco: ${insertError.message}`)
  }

  return { sucesso: true, canal: 'db', respostaIa, mensagem: novaMensagem }
}
