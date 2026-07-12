# Desenho Técnico: Bandeja de Entrada Web Realtime do Operador (Épica 4)

**ID da Mudança:** `epica4-operator-inbox`  
**Status:** `Pendente de Aprovação`

---

## 1. Estratégia Técnica e Fluxo

O operador interage com o painel no navegador, consumindo atualizações em tempo real do banco de dados via Supabase Realtime. As ações de escrita (como alternar estado da IA ou enviar mensagens) usam Next.js Server Actions seguras, as quais executam validações de permissões no lado do servidor.

```text
[Operador UI]
   |
   +---> (Ação de Envio) ---> Server Action [enviarMensagemOperador]
   |                                 |
   |                         [Se telefone Curitiba]
   |                                 v
   |                        Outbound Whatsapp (Meta API)
   |                                 |
   |                                 +---> Insere no DB [mensagens] (remetente = 'operador')
   |                                 |
   +---<--- (Supabase Realtime) <----+
```

---

## 2. Rota de Atendimento (`/atendimento`)

Um Server Component em `src/app/atendimento/page.tsx` será responsável por:
1. **Verificação de Papel**: Carrega a sessão atual e o perfil do usuário na tabela `perfis`. Confirma se a `funcao` está em `['admin', 'supervisor', 'vendedor']` e se o perfil está `ativo = true`.
2. **Dados Iniciais**: Realiza pré-carregamento (SSR) das primeiras 50 conversas ativas (com dados de clientes associados) e passa os dados para o Client Component principal.

---

## 3. Server Actions (`src/app/actions/atendimento.ts`)

Todas as Server Actions validam a sessão e a função do usuário (`admin`, `supervisor`, `vendedor`) através de um helper de segurança comum.

### A. `alternarIaConversa(conversaId: string, iaAtiva: boolean)`
*   **Ação**: Atualiza `ia_ativa` e `status` na tabela `conversas`.
*   **Regra**:
    *   Se `iaAtiva === true` $\rightarrow$ `status = 'ia_atendendo'`.
    *   Se `iaAtiva === false` $\rightarrow$ `status = 'aberta'`.
*   **Retorno**: `{ success: true }` ou `{ success: false, error: string }`.

### B. `enviarMensagemOperador(conversaId: string, texto: string)`
*   **Ação**: Envia uma mensagem para a conversa informada.
*   **Regra**:
    1. Busca a conversa e os dados do cliente associado.
    2. Se o cliente possuir `telefone` cadastrado correspondendo a `^55419[0-9]{8}$`:
       - Invoca o utilitário `enviarMensagemWhatsapp(conversaId, { texto, remetente: 'operador' })`.
       - Captura erros de janela de 24 horas (`janelaExcedida`) e retorna `{ success: false, error: 'JANELA_24H_EXCEDIDA' }`.
    3. Caso não possua telefone válido (cadastro exclusivo web):
       - Insere diretamente na tabela `mensagens` com `remetente = 'operador'`, `conteudo = texto` e `url_anexo = NULL`.
*   **Retorno**: `{ success: true, data: Mensagem }` ou `{ success: false, error: string }`.

---

## 4. Estrutura de Componentes UI

Os componentes serão desenvolvidos sob `src/components/operator/`:

| Componente | Tipo | Responsabilidade |
| :--- | :--- | :--- |
| `OperatorInboxContainer.tsx` | Client Component | Contêiner pai. Gerencia a subscrição Supabase Realtime para tabelas `conversas` e `mensagens`. Controla o estado da conversa ativa selecionada. |
| `ConversationsQueue.tsx` | Client Component | Painel esquerdo. Exibe abas de filtro ("Fila IA", "Fila Humana", "Fechadas"). Ordena por `data_atualizacao` decrescente. Exibe fragmento da última mensagem e sinaliza conversas não lidas. |
| `OperatorChatConsole.tsx` | Client Component | Painel direito de chat ativo. Renderiza histórico de mensagens cronológico. Inclui o Switch de IA, barra de digitação (bloqueada se status = `'fechada'`), e tratamento para alertas da janela de 24h. |

---

## 5. Segurança, Middleware e Políticas RLS

1. **Middleware**: Valida permissões de rotas protegidas em `/atendimento` e `/dashboard`. Redireciona usuários com papel `'cliente'` ou desautenticados para `/login` (ou `/403`).
2. **Políticas RLS**: O banco de dados já possui políticas adequadas criadas na Épica 2 (`tem_funcoes` para operadores). Não são necessárias novas migrações SQL.
3. **Restrições de Escrita**: Clientes web não possuem permissão para realizar updates na tabela `conversas` ou inserir registros em `mensagens` com remetente `'operador'` ou `'ia'`.

---

## 6. Trade-offs de Desenho

| Abordagem | Prós | Contras | Escolha |
| :--- | :--- | :--- | :--- |
| Server Actions para Alterações + Realtime para UI | Segurança no lado do servidor (Server Actions); UI reativa e sem latência via WebSockets. | Necessidade de lidar com sincronização de estados locais e remotos. | **Sim** (Padrão do Next.js + Supabase) |
| Supabase Client direto no Browser para Escrita | Menor código no backend Next.js. | Lógica de envio ao WhatsApp espalhada/difícil de expor com segurança. | **Não** (Ações de operador devem passar pelo servidor) |
