# Desenho Técnico: Chat do Cliente e Histórico (Épica 2)

**ID da Mudança:** `epica2-client-chat`  
**Status:** `Pendente de Aprovação`

---

## 1. Estratégia Técnica e Fluxo

```text
[Cliente Web (Portal)] -> (Envia Mensagem) -> [mensagens] -> Supabase Realtime -> [ChatContainer UI]
[Operador (CRM)]       -> (Envia Resposta) -> [mensagens] -> Supabase Realtime -> [ChatContainer UI]
```

---

## 2. Banco de Dados e Migrações (PostgreSQL)

Arquivo: `supabase/migrations/20260704140000_epica2_client_chat.sql`

```sql
-- 1. Criação dos Enums
CREATE TYPE public.status_conversa AS ENUM ('ia_atendendo', 'aberta', 'fechada');
CREATE TYPE public.tipo_remetente AS ENUM ('cliente', 'operador', 'ia');

-- 2. Tabela de Conversas
CREATE TABLE public.conversas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    status public.status_conversa NOT NULL DEFAULT 'ia_atendendo',
    ia_ativa BOOLEAN NOT NULL DEFAULT TRUE,
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER tr_conversas_atualizar_data
BEFORE UPDATE ON public.conversas
FOR EACH ROW EXECUTE FUNCTION public.atualizar_data_atualizacao();

-- 3. Tabela de Mensagens
CREATE TABLE public.mensagens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversa_id UUID NOT NULL REFERENCES public.conversas(id) ON DELETE CASCADE,
    remetente public.tipo_remetente NOT NULL,
    conteudo TEXT,
    url_anexo TEXT,
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_conteudo_ou_anexo CHECK (conteudo IS NOT NULL OR url_anexo IS NOT NULL)
);

-- 4. Habilitar Row Level Security (RLS)
ALTER TABLE public.conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensagens ENABLE ROW LEVEL SECURITY;

-- 5. Políticas RLS para conversas
CREATE POLICY "Clientes selecionam suas próprias conversas" ON public.conversas
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.clientes
        WHERE id = conversas.cliente_id AND usuario_id = auth.uid()
    )
);

CREATE POLICY "Clientes inserem suas próprias conversas" ON public.conversas
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.clientes
        WHERE id = cliente_id AND usuario_id = auth.uid()
    )
);

CREATE POLICY "Operadores leem todas as conversas" ON public.conversas
FOR SELECT USING (
    public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao])
);

-- 6. Políticas RLS para mensagens
CREATE POLICY "Clientes selecionam suas mensagens" ON public.mensagens
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.conversas c
        JOIN public.clientes cl ON cl.id = c.cliente_id
        WHERE c.id = mensagens.conversa_id AND cl.usuario_id = auth.uid()
    )
);

CREATE POLICY "Clientes inserem mensagens em conversas ativas" ON public.mensagens
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.conversas c
        JOIN public.clientes cl ON cl.id = c.cliente_id
        WHERE c.id = conversa_id 
          AND cl.usuario_id = auth.uid() 
          AND c.status <> 'fechada'::public.status_conversa
    )
    AND remetente = 'cliente'::public.tipo_remetente
);

CREATE POLICY "Operadores leem todas as mensagens" ON public.mensagens
FOR SELECT USING (
    public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao])
);

CREATE POLICY "Operadores inserem mensagens" ON public.mensagens
FOR INSERT WITH CHECK (
    public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao])
);

-- 7. Ativação de Replicação Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mensagens;
```

---

## 3. Políticas do Bucket Storage `chat-midias`

```sql
CREATE POLICY "Leitura de midias por dono ou operadores" ON storage.objects
FOR SELECT USING (
    bucket_id = 'chat-midias'
    AND (
        auth.uid() = owner
        OR public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao])
    )
);

CREATE POLICY "Upload de midias por dono ou operadores" ON storage.objects
FOR INSERT WITH CHECK (
    bucket_id = 'chat-midias'
    AND (
        auth.uid() = owner
        OR public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao])
    )
);
```

---

## 4. Validação Zod

```typescript
import { z } from 'zod';

export const novaMensagemSchema = z.object({
  conversa_id: z.string().uuid({ message: "ID da conversa inválido" }),
  remetente: z.literal('cliente'),
  conteudo: z.string().trim().nullable().optional(),
  url_anexo: z.string().url({ message: "URL inválida" }).nullable().optional(),
}).superRefine((data, ctx) => {
  if (!data.conteudo && !data.url_anexo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A mensagem precisa ter conteúdo em texto ou anexo.",
      path: ["conteudo"],
    });
  }
});
```

---

## 5. Estrutura Next.js 16

### A. Server Component: `src/app/cliente/chat/page.tsx`
*   Verifica sessão autenticada (usando `createClient` de `src/lib/supabase/server.ts`).
*   Busca registro do cliente e localiza a conversa ativa (`status != 'fechada'`). Caso não exista, cria uma nova.
*   Busca as últimas 50 mensagens dessa conversa.
*   Renderiza o contêiner passando dados iniciais via props.

### B. Client Component: `src/components/chat/ChatContainer.tsx`
*   Assina tempo real (`supabase.channel`) filtrado por `conversa_id` para `mensagens` (inserções) e `conversas` (atualizações de status/IA).
*   Se `status` for `'fechada'`, bloqueia entrada de dados e oculta botões.
*   Controla scroll automático ao final do histórico com referência mutable (`useRef`).
*   Possui estado dinâmico para indicar agente ativo: "Sofia (IA)" com badge verde pulsante, ou "Atendente Humano" com badge azul.

---

## 6. Trade-offs de Implementação

| Abordagem | Prós | Contras | Escolha |
| :--- | :--- | :--- | :--- |
| Escrita direta via SDK com RLS | Rápido, menor latência, pub/sub nativo. | Regras de validação duplicadas no DB. | **Sim** (Ideal para chat realtime) |
| API Route intermediária | Lógica de validação centralizada em TS. | Latência adicional, mais rotas. | **Não** |
