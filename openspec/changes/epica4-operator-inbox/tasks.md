# Task Breakdown: Bandeja de Entrada Web Realtime do Operador (Épica 4)

**ID da Mudança:** `epica4-operator-inbox`  
**Status:** `Planejado`  

---

## 1. Estimativa de Linhas e Workload Budget

*   **Chained PRs recommended:** Yes  
*   **400-line budget risk:** High  
*   **Decision needed before apply:** Yes (Sob a estratégia `ask-on-risk`, o orquestrador deve solicitar autorização do usuário antes de aplicar as mudanças)  

*Justificativa:* O escopo da Épica 4 envolve a criação de Server Actions complexas para gerenciamento do estado da IA e envio de mensagens (integrando-se com a Meta Cloud API do WhatsApp), criação de um Server Page para a rota `/atendimento`, e o desenvolvimento de três componentes React principais no lado do cliente (fila de conversas por abas, painel de chat e contêiner com assinaturas realtime). Com isso, estima-se que a alteração de código some entre **500 e 600 linhas**, ultrapassando o orçamento sugerido de 400 linhas para revisões individuais de PR. Recomenda-se fatiar o desenvolvimento seguindo as Unidades de Trabalho (Work Units) mapeadas.

---

## 2. Unidades de Trabalho (Work Units)

### Work Unit 1: Server Actions & Access Protection
*   **Descrição:** Criação do arquivo de Server Actions `src/app/actions/atendimento.ts` contendo as funções `alternarIaConversa` (para ligar/desligar a IA e transitar o status de conversas) e `enviarMensagemOperador` (que despacha mensagens pelo WhatsApp ou as insere diretamente no banco para clientes exclusivamente web). Também engloba a verificação da proteção de rotas no arquivo central `middleware.ts`.
*   **Riscos associados:** Vazamento de privilégios de acesso (permitindo a clientes burlarem a segurança e executarem as actions), erros de concorrência ou timeouts na integração com a Meta API de WhatsApp.

### Work Unit 2: Operator Workspace Components & Layout
*   **Descrição:** Desenvolvimento do Server Component principal `/atendimento/page.tsx` para carregamento de sessão e SSR das primeiras 50 conversas ativas. Criação dos componentes visuais `src/components/operator/ConversationsQueue.tsx` (fila de conversas com abas filtradas e badges) e `src/components/operator/OperatorChatConsole.tsx` (painel ativo de chat com balões diferenciados, switch de IA e textarea de escrita).
*   **Riscos associados:** Bugs de layout e comportamento responsivo em telas menores (quebra de console), latência perceptível no carregamento inicial da lista de conversas.

### Work Unit 3: Realtime Subscriptions & Handoff Integration
*   **Descrição:** Criação do contêiner `src/components/operator/OperatorInboxContainer.tsx` que orquestra a assinatura em tempo real via Supabase Client (escutando modificações na tabela `conversas` e `mensagens`), conciliação dos estados locais do painel e controle de rolagem automática (`scroll to bottom`).
*   **Riscos associados:** Múltiplas conexões abertas gerando re-renderizações duplicadas ou dessincronização de filas de atendimento em tempo real.

### Work Unit 4: Integration & Security Testing
*   **Descrição:** Elaboração do script `scripts/test-operator-integration.js` para certificar que operadores consigam ler/escrever dados e alternar o status da IA, enquanto clientes são estritamente barrados de realizar inserções do tipo 'operador' ou de modificar o status da IA.
*   **Riscos associados:** Falsos positivos em ambiente de testes devido a inconsistências de seed ou latência de rede nos testes realtime.

---

## 3. Lista Hierárquica de Tarefas

### Fase 1: Server Actions & Middleware (Ações de Servidor & Proteção de Rotas)

- [x] **1.1** Criar o arquivo `src/app/actions/atendimento.ts` para agrupar as Server Actions exclusivas do operador.
- [x] **1.2** Implementar a Server Action `alternarIaConversa(conversaId: string, iaAtiva: boolean)` que:
  *   Valida a sessão do usuário ativo via `createClient()`.
  *   Valida se a função (`funcao`) do usuário na tabela `perfis` é `'admin'`, `'supervisor'` ou `'vendedor'`, e se o perfil está ativo (`ativo = true`).
  *   Atualiza na tabela `conversas` o campo `ia_ativa` com o valor fornecido e o `status` correspondente: se `iaAtiva === true` define `status = 'ia_atendendo'`, caso contrário define `status = 'aberta'`.
- [x] **1.3** Implementar a Server Action `enviarMensagemOperador(conversaId: string, texto: string)` que:
  *   Valida a sessão e as permissões de operador (`admin`, `supervisor`, `vendedor`).
  *   Busca a conversa e os dados do cliente associado no banco.
  *   Se o cliente possui um `telefone` cadastrado correspondendo à regex Curitiba `^55419[0-9]{8}$`:
    *   Chama o utilitário existente `enviarMensagemWhatsapp(conversaId, { texto, remetente: 'operador' })`.
    *   Trata exceções de janela de 24 horas excedida e retorna `{ success: false, error: 'JANELA_24H_EXCEDIDA' }`.
  *   Se o cliente for exclusivo da Web (sem telefone Curitiba válido):
    *   Realiza o insert direto na tabela `mensagens` com `remetente = 'operador'::public.tipo_remetente`, `conteudo = texto` e `url_anexo = NULL`.
- [x] **1.4** Validar e ajustar o `middleware.ts` na raiz do projeto para certificar que a rota protegida `/atendimento` bloqueie requisições de clientes ou usuários não autenticados, redirecionando-os de volta para `/login` (ou `/403`).

### Fase 2: React Component Layouts (Páginas e Estruturas Visuais)

- [x] **2.1** Desenvolver a página principal `/atendimento/page.tsx` como Server Component que:
  *   Verifica a sessão atual e perfil do usuário do Supabase Auth.
  *   Realiza o pré-carregamento SSR das primeiras 50 conversas ativas (tabela `conversas` com `status != 'fechada'`), fazendo o join com a tabela `clientes` e ordenando por `data_atualizacao` decrescente.
  *   Renderiza o contêiner `OperatorInboxContainer` passando as conversas iniciais como prop.
- [x] **2.2** Criar o componente de fila de conversas em `src/components/operator/ConversationsQueue.tsx` (Client Component) contendo:
  *   Abas de filtros rápidos: "Fila IA" (conversas com `ia_ativa = true` e status `'ia_atendendo'`), "Fila Humana" (conversas com `ia_ativa = false` e status `'aberta'`), e "Fechadas" (conversas com status `'fechada'`).
  *   Renderização de cards de conversas com nome do cliente, trecho da última mensagem e indicador/badge de mensagens não lidas.
  *   Ordenação automática decrescente por `data_atualizacao`.
- [x] **2.3** Criar o console de chat ativo em `src/components/operator/OperatorChatConsole.tsx` (Client Component) contendo:
  *   Cabeçalho com o nome do cliente ativo e o switch/toggle visual "IA Ativa" (conectado à action `alternarIaConversa`).
  *   Corpo com histórico cronológico de mensagens, utilizando balões visuais distintos baseados no remetente (`cliente`, `operador`, `ia`).
  *   Alertas em banner caso a janela de 24 horas para envio de mensagens via WhatsApp tenha sido excedida.
  *   Rodapé com campo de digitação de texto e botão de envio bloqueados caso a conversa esteja com o status `'fechada'`.

### Fase 3: Realtime Logic (Lógica Reativa e Integração Realtime)

- [x] **3.1** Desenvolver o componente principal de orquestração `src/components/operator/OperatorInboxContainer.tsx` (Client Component) que une a fila lateral e o console de chat, controlando qual conversa está selecionada.
- [x] **3.2** Implementar no `OperatorInboxContainer` a subscrição Supabase Realtime (`supabase.channel('atendimento-realtime')`) escutando eventos de:
  *   `INSERT` e `UPDATE` na tabela `mensagens`.
  *   `UPDATE` na tabela `conversas`.
- [x] **3.3** Implementar lógica para atualizar o estado local de conversas e mensagens dinamicamente:
  *   Ao receber um update em `conversas`, ajustar a fila correspondente ("Fila IA", "Fila Humana", "Fechadas") e atualizar o cabeçalho se a conversa alterada for a ativa.
  *   Ao receber um novo insert in `mensagens`, anexar ao histórico do chat se corresponder à conversa ativa e atualizar a última mensagem visível no card da fila.
- [x] **3.4** Integrar o comportamento de scroll automático do chat ativo (`scroll to bottom`) usando uma ref do React, disparado sempre que a conversa ativa mudar ou uma nova mensagem for recebida.

### Fase 4: Verification & Security Tests (Scripts de Testes & Auditoria)

- [x] **4.1** Desenvolver o script de testes de integração e segurança em `scripts/test-operator-integration.js` configurando um cliente admin e um cliente comum para simulação.
- [x] **4.2** Implementar testes de fluxo feliz para garantir que contas com papel de operador possam:
  *   Carregar conversas e mensagens.
  *   Executar com sucesso as Server Actions `alternarIaConversa` e `enviarMensagemOperador`.
- [x] **4.3** Implementar testes de invasão e segurança para certificar que:
  *   Usuários com papel `'cliente'` tenham suas requisições às Server Actions bloqueadas com erro de permissão.
  *   Tabelas do banco com RLS ativo barrem inserts manuais de mensagens onde `remetente` seja `'operador'` a partir de conexões cliente.
- [x] **4.4** Rodar os testes de integração locais e auditar os logs do sistema de testes, validando que nenhuma informação sensível de clientes (PII) seja exposta na saída dos logs.
