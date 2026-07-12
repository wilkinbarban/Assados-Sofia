# Task Breakdown: Melhorias de Verificação e Integração Multicanal

**ID da Mudança:** `melhorias-verificacao`  
**Status:** `Concluído`  

---

## 1. Work Units Implementadas

### Work Unit 1: Correção da Página de Verificação de Email
- [x] Converter `page.tsx` para async server component com `searchParams` prop
- [x] Remover `useSearchParams()` e `<Suspense>` do `VerificarEmailClient`
- [x] Substituir `useRouter` + `onClick` por `<Link href>` nos 3 botões
- [x] Remover parâmetro `next` do redirect em `api/auth/callback/route.ts`
- [x] Default redirect do "Continuar" para `/cliente/configuracoes`
- [x] Build e deploy

### Work Unit 2: Telegram Contact Sharing (Opção A)
- [x] Detectar `message.contact` no webhook do Telegram
- [x] Normalizar telefone (DDI 55 + DDD 41 + número)
- [x] Salvar em `clientes.telefone` ao receber contato
- [x] Mensagem de boas-vindas com keyboard button `request_contact`
- [x] Não disparar RAG até receber o contato
- [x] Confirmar recebimento e disparar RAG após contato
- [x] Build e deploy

### Work Unit 3: OTP Inteligente com Detecção de Canais
- [x] Função `detectarCanaisDisponiveis()` consultando `clientes`
- [x] Função `enviarOtpTelegram()` em `lib/telegram/send.ts`
- [x] Lógica de failover: Telegram → WhatsApp
- [x] Corrigir bug `envioSucesso` (não setava true no fallback)
- [x] Response incluir campo `canal` ('telegram' | 'whatsapp')
- [x] Build e deploy

### Work Unit 4: System Prompt Máster + Regra de Idioma
- [x] Inserir prompt máster (7.8K chars) em `configuracoes_sistema.SOFIA_SYSTEM_PROMPT`
- [x] Adicionar bloco `[REGRAS ABSOLUTAS]` hardcodeado em `openrouter.ts`
- [x] Estrutura: regras → prompt máster → RAG → histórico
- [x] Build e deploy

### Work Unit 5: mesclar_contas v2
- [x] Criar migração SQL `20260707180000_mesclar_contas_telegram.sql`
- [x] Adicionar busca de cliente Telegram por telefone
- [x] Migrar `telegram_chat_id` ao fundir registros
- [x] Aplicar migração via `supabase db push --linked`
- [x] Verificar função ativa no banco

### Work Unit 6: UI Dinâmica (Canal)
- [x] Adicionar estado `canalEnvio` no componente
- [x] Ler `data.canal` da resposta da API OTP
- [x] Textos condicionais: step 1, step 2, step 3
- [x] Build e deploy

### Work Unit 7: Configurações de Infra
- [x] Inserir `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_NAME` em configuracoes_sistema
- [x] Registrar webhook Telegram em `https://api.telegram.org`
- [x] Verificar conectividade DeepSeek API
- [x] Verificar conectividade Telegram Bot API

## 2. Verificação

### Testes Realizados
- [x] Webhook Telegram responde HTTP 200
- [x] DeepSeek API responde corretamente
- [x] Telegram Bot `@casadeasados_bot` operacional
- [x] OTP enviado via Telegram para chat_id real (7051275102)
- [x] Mensagens Sofía registradas em `mensagens` com `telegram_mensagem_id`
- [x] mesclar_contas v2 executável (teste com UUID falso → FK constraint OK)
- [x] SOFIA_SYSTEM_PROMPT carregado (7803 chars)
- [x] Build TypeScript sem erros
- [x] 6 deploys Docker sem falhas

### Pendente
- [ ] Configurar WhatsApp (Evolution API instance QR scan)
- [ ] Teste end-to-end: Telegram → compartilhar contato → web cadastro → OTP → fusão
- [ ] Verificar edição do SOFIA_SYSTEM_PROMPT pelo dashboard admin

## 3. Estimativa de Linhas

| Categoria | Linhas |
|---|---|
| Novas | ~350 |
| Modificadas | ~200 |
| Removidas | ~50 |
| **Total** | **~600** |
