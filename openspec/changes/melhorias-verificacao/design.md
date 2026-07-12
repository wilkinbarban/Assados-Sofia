# Desenho Técnico: Melhorias de Verificação e Integração Multicanal

**ID da Mudança:** `melhorias-verificacao`  
**Status:** `Concluído`  

---

## 1. Decisões Arquiteturais (ADRs)

### ADR-1: Server Component + Props em vez de useSearchParams + Suspense
- **Contexto**: `VerificarEmailClient` usava `useSearchParams()` envolto em `<Suspense>`. Em Next.js 16, async server components que renderizam client components com `useSearchParams` podem falhar na hidratação.
- **Decisão**: `page.tsx` agora é um async server component que recebe `searchParams` como prop, faz `await`, e passa os valores ao client component como props normais.
- **Tradeoff**: Perde-se a renderização progressiva do Suspense, mas ganha-se confiabilidade total na hidratação.

### ADR-2: Link em vez de useRouter para navegação
- **Contexto**: `useRouter` em client components dentro de async server components pode falhar na hidratação.
- **Decisão**: Substituir `<button onClick={router.push}>` por `<Link href>` para navegação declarativa.
- **Tradeoff**: Não permite lógica condicional antes de navegar, mas para esta página (redirecionamento simples) é suficiente.

### ADR-3: Opção A — Telegram pede contato ao usuário
- **Contexto**: Telegram não compartilha telefone automaticamente. Sem telefone, `mesclar_contas` não pode fundir clientes Telegram com contas web.
- **Decisão**: Webhook envia keyboard button `request_contact` no primeiro contato. O telefone é normalizado (DDI 55) e salvo em `clientes.telefone`.
- **Alternativas consideradas**: (B) matching por nome (frágil), (C) fusão manual por admin, (D) OTP reverso.

### ADR-4: Telegram-first para envio de OTP
- **Contexto**: WhatsApp (Meta API) não está configurado (auth error 190), mas Telegram funciona. O sistema anterior tentava WhatsApp primeiro e falhava.
- **Decisão**: Inverter prioridade: Telegram primeiro, WhatsApp como fallback. Se Telegram envia com sucesso, WhatsApp nem é tentado.
- **Tradeoff**: Clientes sem Telegram dependem exclusivamente do WhatsApp (que precisa ser configurado).

### ADR-5: Regra de idioma hardcodeada no código
- **Contexto**: Prompt de 7K+ caracteres dilui instruções críticas. A regra "responder em pt-BR" era ignorada quando o usuário escrevia em espanhol.
- **Decisão**: Adicionar bloco `[REGRAS ABSOLUTAS]` no início do system prompt, hardcodeado em `openrouter.ts`, antes do prompt máster (editável) e do contexto RAG.
- **Tradeoff**: Regra não pode ser desabilitada pelo dashboard — é uma proteção intencional.

## 2. Fluxos

### 2.1 Fluxo Telegram → Contato → Fusão
```
Usuário envia primeira msg Telegram
  → Webhook detecta novo cliente (telefone = null)
    → Envia boas-vindas + keyboard "📱 Compartilhar meu número"
    → NÃO dispara RAG
Usuário toca "Compartilhar"
  → Telegram envia message.contact.phone_number
    → Normaliza (55 + DDD + número)
    → Salva em clientes.telefone
    → Confirma: "✅ Obrigado! Como posso ajudar?"
    → DISPARA RAG
```

### 2.2 Fluxo OTP Inteligente
```
POST /api/auth/otp { telefone: "55419..." }
  → detectarCanaisDisponiveis(telefone)
    ├─ Só Telegram → enviarOtpTelegram() → ✅
    ├─ Só WhatsApp → WhatsApp API → ✅/❌
    ├─ Ambos → Telegram primeiro → se OK ✅, senão WhatsApp
    └─ Nenhum → WhatsApp API → ✅/❌
  → Response: { success, canal: 'telegram'|'whatsapp' }
```

### 2.3 Fluxo mesclar_contas v2
```
verify-otp → mesclar_contas(usuario_id, telefone, endereco)
  → Busca cliente por telefone (WhatsApp)
  → Busca cliente por usuario_id (rascunho web)
  → NOVO: Busca cliente Telegram com mesmo telefone
  → Funde registros, preserva telegram_chat_id
  → Elimina duplicatas
```

## 3. Arquivos Modificados

| Arquivo | Tipo de Mudança |
|---|---|
| `src/app/verificar-email/page.tsx` | Server component + props |
| `src/app/verificar-email/VerificarEmailClient.tsx` | Link navigation + props |
| `src/app/api/auth/callback/route.ts` | Remove parâmetro next |
| `src/app/api/webhooks/telegram/route.ts` | Contact sharing flow |
| `src/lib/telegram/send.ts` | + enviarOtpTelegram() |
| `src/app/api/auth/otp/route.ts` | Channel detection + failover |
| `src/lib/ai/openrouter.ts` | regraIdioma hardcodeada |
| `src/app/cliente/verificar-telefone/page.tsx` | UI dinâmica |
| `supabase/migrations/20260707180000_mesclar_contas_telegram.sql` | mesclar_contas v2 |
| `configuracoes_sistema` (DB) | SOFIA_SYSTEM_PROMPT, EVOLUTION_* |
