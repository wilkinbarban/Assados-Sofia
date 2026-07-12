# Desenho Técnico: RAG e Base de Conhecimento (Épica 5)

**ID da Mudança:** `epica5-rag-knowledge`  
**Status:** `Pendente de Aprovação`

---

## 1. Estratégia Técnica e Fluxo

O pipeline RAG (Retrieval-Augmented Generation) processa mensagens entrantes em nível de código (nas rotas do Webhook e no chat web) para evitar lockups no PostgreSQL causados por chamadas HTTP lentas de triggers síncronos.

```text
[Mensagem Cliente]
       |
       v (Trigger In-Code)
[processarRagPipeline] ---> 1. Busca 3 artigos (FTS plainto_tsquery)
       |               ---> 2. Obtém últimas 10 mensagens
       v
[OpenRouter / Mock]    ---> 3. Gera resposta ("Sofía", pt-BR, Curitiba-PR)
       |
       +---> [Cliente Curitiba?]
                 |
                 +---> SIM: enviarMensagemWhatsapp() (envia e insere mensagem no DB)
                 |
                 +---> NÃO: Insere direto em [mensagens] (remetente = 'ia')
```

---

## 2. Banco de Dados e Migração SQL

Arquivo: `supabase/migrations/20260704160000_epica5_rag_knowledge.sql`

```sql
-- Criação da tabela de base de conhecimento
CREATE TABLE public.base_conhecimento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo VARCHAR(255) NOT NULL,
    conteudo TEXT NOT NULL,
    tags VARCHAR(100)[] NOT NULL DEFAULT '{}',
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Trigger de atualização de timestamp
CREATE TRIGGER tr_base_conhecimento_atualizar_data
BEFORE UPDATE ON public.base_conhecimento
FOR EACH ROW EXECUTE FUNCTION public.atualizar_data_atualizacao();

-- Full-Text Search (FTS) em português brasileiro
ALTER TABLE public.base_conhecimento
ADD COLUMN busca_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('portuguese', coalesce(titulo, '') || ' ' || coalesce(conteudo, ''))
) STORED;

CREATE INDEX idx_base_conhecimento_busca_vector ON public.base_conhecimento USING gin(busca_vector);

-- Função de busca com SECURITY DEFINER (bypass RLS na consulta RAG)
CREATE OR REPLACE FUNCTION public.buscar_artigos_relevantes(query_text TEXT)
RETURNS SETOF public.base_conhecimento AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM public.base_conhecimento
    WHERE ativo = TRUE
      AND busca_vector @@ plainto_tsquery('portuguese', query_text)
    ORDER BY ts_rank_cd(busca_vector, plainto_tsquery('portuguese', query_text)) DESC
    LIMIT 3;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS: Acesso CRUD restrito a operadores do sistema
ALTER TABLE public.base_conhecimento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operadores possuem acesso completo" ON public.base_conhecimento
FOR ALL TO authenticated
USING (public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao]))
WITH CHECK (public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao]));
```

---

## 3. Server Actions (`src/app/actions/conhecimento.ts`)

Encapsulam operações de CRUD garantindo verificação rígida de autenticação e papel (`admin` ou `supervisor`).

*   `criarArtigo(titulo, conteudo, tags, ativo)`: Insere registro na tabela.
*   `atualizarArtigo(id, titulo, conteudo, tags, ativo)`: Atualiza campos do artigo correspondente.
*   `excluirArtigo(id)`: Remove fisicamente ou logicamente o artigo após confirmação.
*   `alternarStatusArtigo(id, ativo)`: Atualiza apenas a flag `ativo`.

*Todos os fluxos validam:*
```typescript
const { data: perfil } = await supabase.from('perfis').select('funcao, ativo').eq('id', user.id).single();
if (!perfil || !perfil.ativo || !['admin', 'supervisor'].includes(perfil.funcao)) {
  return { success: false, error: 'ACESSO_NEGADO' };
}
```

---

## 4. Pipeline de IA / RAG (`src/lib/ai/openrouter.ts`)

A função centralizada `processarRagPipeline(conversaId: string, mensagemCliente: string)` realiza o fluxo:

1.  **Recuperação**: Executa a RPC `buscar_artigos_relevantes` com o texto da mensagem do cliente.
2.  **Histórico**: Recupera até 10 mensagens anteriores da conversa ordenadas de forma cronológica ascendente.
3.  **System Prompt**: Define a persona "Sofía": curitibana simpática da churrascaria, amigável, usa emojis moderadamente, responde de forma breve e estruturada, atendo-se *estritamente* ao contexto recuperado (evita alucinações).
4.  **Integração**: Executa chamada ao OpenRouter via API. Se a chave `OPENROUTER_API_KEY` for nula/placeholder, entra em *Modo Mock*, retornando respostas programadas com base em palavras-chave da mensagem do cliente.
5.  **Despacho**:
    *   Se o cliente possui telefone de Curitiba (`^55419[0-9]{8}$`): Invoca assincronamente `enviarMensagemWhatsapp(conversaId, { texto: respostaIA, remetente: 'ia' })` (que envia o WhatsApp e insere no banco).
    *   Caso contrário: Insere diretamente a resposta em `public.mensagens` com `remetente = 'ia'`.

---

## 5. Interface Administrativa (`/atendimento/conhecimento/page.tsx`)

Um painel premium escuro com detalhes em laranja/âmbar para gerenciar a base de conhecimento.

*   **Controles de Acesso**: Bloqueia se o perfil logado não for `admin` ou `supervisor` (retorna HTTP 403).
*   **Recursos Visuais**:
    *   Listagem em grid com busca por título e filtro por tags.
    *   Formulários elegantes de inserção/edição integrados com estados visuais de loading.
    *   Switch interativo na tabela para ativar/desativar artigos rapidamente (`alternarStatusArtigo`).
    *   Modal flutuante de confirmação para exclusão segura.

---

## 6. Trade-offs de Desenho

| Abordagem | Prós | Contras | Escolha |
| :--- | :--- | :--- | :--- |
| Disparo In-Code (Server Actions/Webhooks) | Sem risco de travar conexões do DB; controle fácil de timeout, retentativas e mock mode. | Requer invocação explícita nos pontos de entrada de mensagens. | **Sim** (Mais resiliente e isolado) |
| Trigger PostgreSQL síncrono (pg_net) | Garante execução em qualquer canal de inserção de mensagens de forma centralizada. | Pode causar gargalo severo nas transações do banco se o serviço de IA atrasar. | **Não** (Risco operacional alto) |
