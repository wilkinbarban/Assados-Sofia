# Proposta: Melhorias de Verificação e Integração Multicanal

**ID da Mudança:** `melhorias-verificacao`  
**Status:** `Concluído`  
**Data:** 2026-07-07

---

## 1. Problema

O fluxo de cadastro de clientes apresentava múltiplos problemas:

1. **Página de verificação de email quebrada**: `/verificar-email?sucesso=true` mostrava loading infinito devido a falha de hidratação com `useSearchParams` + Suspense em Next.js 16.
2. **Parâmetro `next` desnecessário na URL**: O callback de auth sempre injetava `next=/cliente/verificar-telefone`.
3. **Cliente Telegram não era fundido com conta web**: `mesclar_contas` só buscava por `telefone`, mas clientes Telegram tinham `telefone = null`.
4. **OTP sempre enviado via WhatsApp**: Mesmo quando o cliente só tinha Telegram, o sistema tentava WhatsApp (não configurado) e falhava com erro 502.
5. **Sofía respondia em espanhol**: A regra de idioma estava enterrada em 7K+ caracteres e o LLM a ignorava.
6. **UI mostrava "WhatsApp Verificado"** mesmo quando o código foi enviado por Telegram.

## 2. Solução Proposta

### 2.1 Correção da página de verificação de email
- Converter `page.tsx` para server component que recebe `searchParams` como prop
- Passar props ao client component em vez de usar `useSearchParams()`
- Substituir `useRouter` + `onClick` por `<Link>` do Next.js
- Remover parâmetro `next` do callback de auth

### 2.2 Integração Telegram com Opção A (compartilhar contato)
- Modificar webhook Telegram para detectar novos usuários
- Enviar mensagem de boas-vindas com keyboard button "📱 Compartilhar meu número"
- Ao receber contato, extrair e normalizar telefone, salvar em `clientes.telefone`
- Com telefone salvo, `mesclar_contas` funciona automaticamente

### 2.3 OTP inteligente com detecção de canais
- Função `detectarCanaisDisponiveis`: consulta `clientes` pelo telefone
- Ordem de tentativa: 1) Telegram (mais confiável), 2) WhatsApp (fallback)
- Se Telegram envia com sucesso → WhatsApp não é tentado → sem erro falso
- Nova função `enviarOtpTelegram()` em `lib/telegram/send.ts`

### 2.4 System Prompt Máster + regra de idioma hardcodeada
- Prompt máster de 7.8K chars inserido em `configuracoes_sistema.SOFIA_SYSTEM_PROMPT`
- Regra de idioma hardcodeada no início de todo system prompt (imune a edições)
- Estrutura: `[REGRAS ABSOLUTAS] → [MASTER PROMPT] → [RAG] → [HISTÓRICO]`

### 2.5 mesclar_contas v2
- Nova migração SQL que busca clientes Telegram pelo telefone
- Migra `telegram_chat_id` ao fundir registros
- Elimina duplicatas de clientes multicanales

### 2.6 UI dinâmica
- Estado `canalEnvio` lido da resposta da API
- Textos condicionais: "via Telegram" / "via WhatsApp", "Telegram Verificado!" / "WhatsApp Verificado!"

## 3. Impacto

- **Nenhuma breaking change** — todas as APIs mantêm compatibilidade
- **Melhoria progressiva** — clientes existentes não são afetados
- **Telegram-first** — reduz dependência do WhatsApp (não configurado)
