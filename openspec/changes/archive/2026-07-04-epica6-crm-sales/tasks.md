# Task Breakdown: CRM, Vendas e Integração com Google Calendar (Épica 6)

**ID da Mudança:** `epica6-crm-sales`  
**Status:** `Concluído`  

---

## 1. Estimativa de Linhas e Workload Budget

*   **Chained PRs recommended:** Yes  
*   **400-line budget risk:** High  
*   **Decision needed before apply:** Yes (Sob a estratégia `ask-on-risk`, o orquestrador deve solicitar autorização do usuário antes de aplicar as mudanças)  

*Justificativa:* A Épica 6 introduz uma quantidade substancial de lógica em camadas variadas: banco de dados (migração SQL com 3 tabelas, enums, triggers e RLS), backend (3 arquivos de Server Actions e serviço do Google Calendar com autenticação via JWT) e frontend (sidebar de CRM, modal de criação de pedidos rápidos e tela administrativa de catálogo com controle de layout), além de um script JavaScript abrangente de testes de integração. Estima-se entre 800 e 900 linhas de código alteradas no total, o que excede significativamente o limite de 400 linhas e exige fatiamento rigoroso.

---

## 2. Unidades de Trabalho (Work Units)

### Work Unit 1: Database Migration & Client CRM Sidebar
*   **Descrição:** Criação da migração SQL contendo a definição de novos enums (`status_pedido`, `tipo_entrega`, `status_pagamento`, `meio_pagamento`), adição de colunas de CRM na tabela `clientes` (`tags`, `notas`, `score`), tabelas de `produtos`, `pedidos` e `itens_pedido` com triggers e políticas RLS em pt-BR. Desenvolvimento da Server Action `src/app/actions/clientes.ts` (`atualizarClienteCrm`) e criação da sidebar visual de atendimento `src/components/operator/ClientCrmPanel.tsx` para edição interativa de notas, tags e endereço.
*   **Arquivos envolvidos:**
    *   `supabase/migrations/20260704170000_epica6_crm_sales.sql`
    *   `src/app/actions/clientes.ts`
    *   `src/components/operator/ClientCrmPanel.tsx`
*   **Riscos associados:** RLS restritivo demais que cause falhas na exibição de dados para os operadores, vazamento ou sobrescrita acidental de notas/tags de clientes.

### Work Unit 2: Product Catalog Administration Page
*   **Descrição:** Desenvolvimento das Server Actions em `src/app/actions/produtos.ts` para manipulação do catálogo (`criarProduto`, `atualizarProduto`, `alternarStatusProduto`) com validação de perfil de operador (`admin`/`supervisor`). Implementação da rota `/atendimento/produtos/page.tsx` e seu respectivo `layout.tsx` fornecendo uma interface de gerenciamento de produtos com paginação, busca e switch para ativar/desativar produtos.
*   **Arquivos envolvidos:**
    *   `src/app/actions/produtos.ts`
    *   `src/app/atendimento/produtos/layout.tsx`
    *   `src/app/atendimento/produtos/page.tsx`
*   **Riscos associados:** Ausência de validação de papéis no nível do servidor permitindo que vendedores/clientes acessem a administração do catálogo.

### Work Unit 3: Quick Order Modal & Calculation
*   **Descrição:** Criação da Server Action `src/app/actions/pedidos.ts` com a lógica de `criarPedidoOperador`, responsável por resgatar os preços atuais em centavos diretamente do banco, calcular subtotais e salvar o pedido com status `'novo'` e seus itens. Desenvolvimento do componente modal interativo `src/components/operator/CreateOrderModal.tsx` no painel do operador para adicionar produtos e calcular o total do pedido em tempo real.
*   **Arquivos envolvidos:**
    *   `src/app/actions/pedidos.ts`
    *   `src/components/operator/CreateOrderModal.tsx`
*   **Riscos associados:** Divergências de cálculo entre o subtotal do frontend e o preço histórico gravado no banco, vazamento de concorrência ou criação de pedidos sem clientes.

### Work Unit 4: Resilient Google Calendar Service
*   **Descrição:** Implementação do serviço de integração com a API do Google Calendar in `src/lib/calendar/google.ts` utilizando autenticação de conta de serviço JWT, formatação em português e isolamento total via `try/catch`. Desenvolvimento da Action `confirmarPedidoOperador(pedidoId)` que transiciona o pedido para `'confirmado'`, agenda no calendário e vincula o `google_event_id`.
*   **Arquivos envolvidos:**
    *   `src/lib/calendar/google.ts`
    *   `src/app/actions/pedidos.ts` (extensão para incluir `confirmarPedidoOperador`)
*   **Riscos associados:** Lentidão na confirmação do pedido por tempo de resposta da rede, falhas de sincronização causadas por credenciais corrompidas ou API do Google offline que impeçam a transação do banco.

### Work Unit 5: CRM & Sales Integration Tests
*   **Descrição:** Script de teste de ponta a ponta `scripts/test-crm-integration.js` para simular o comportamento de RLS nas novas tabelas, testar as Server Actions e atestar que a falha da API do Google Calendar é tratada de forma resiliente, não revertendo a confirmação do pedido no banco de dados.
*   **Arquivos envolvidos:**
    *   `scripts/test-crm-integration.js`
*   **Riscos associados:** Inconsistência no banco local de testes por falta de teardown correto das transações.

---

## 3. Lista Hierárquica de Tarefas

### Phase 1: DB & CRM Foundation

- [x] **1.1** Criar o arquivo de migração do banco de dados `supabase/migrations/20260704170000_epica6_crm_sales.sql`.
- [x] **1.2** Definir no arquivo SQL os enums `status_pedido`, `tipo_entrega`, `status_pagamento`, `meio_pagamento`.
- [x] **1.3** Adicionar colunas `tags` (array de string), `notas` (texto) e `score` (inteiro) na tabela `clientes`.
- [x] **1.4** Criar a tabela `produtos` com validação de `preco_centavos >= 0`, trigger de data de atualização e habilitar RLS.
- [x] **1.5** Criar as tabelas `pedidos` e `itens_pedido` com chaves estrangeiras apropriadas, triggers e habilitar RLS.
- [x] **1.6** Configurar políticas RLS para `produtos` (leitura pública, escrita para admin/supervisor), `pedidos` (leitura para dono ou operadores, escrita total para operadores) e `itens_pedido`.
- [x] **1.7** Recriar as políticas RLS de `clientes` para garantir acesso de leitura, inserção e alteração para papéis do tipo `admin`, `supervisor` e `vendedor`.
- [x] **1.8** Implementar a Server Action `src/app/actions/clientes.ts` com a função `atualizarClienteCrm` contendo validação de role.
- [x] **1.9** Desenvolver o componente `src/components/operator/ClientCrmPanel.tsx` com suporte para adicionar/remover tags em pills, textarea de notas com salvamento seguro e visualização de endereço.

### Phase 2: Catalog Management

- [x] **2.1** Desenvolver as Server Actions em `src/app/actions/produtos.ts`: `criarProduto`, `atualizarProduto` e `alternarStatusProduto` com validação de permissões de supervisor ou admin.
- [x] **2.2** Criar o arquivo de layout `src/app/atendimento/produtos/layout.tsx` para delimitar a estrutura da área administrativa de catálogo.
- [x] **2.3** Desenvolver a página de catálogo `src/app/atendimento/produtos/page.tsx` integrando listagem, filtro de busca, switch de status ativo/inativo e modal de cadastro de produtos.

### Phase 3: Order Flow & Calendar

- [x] **3.1** Criar a Server Action `src/app/actions/pedidos.ts` com a lógica de `criarPedidoOperador` que busca preços atuais, calcula totais em centavos e insere os registros nas tabelas `pedidos` e `itens_pedido`.
- [x] **3.2** Desenvolver o componente `src/components/operator/CreateOrderModal.tsx` com combobox de produtos, cálculo do total em tempo real (convertendo centavos para BRL) e chamada para criar o pedido.
- [x] **3.3** Implementar o módulo de integração `src/lib/calendar/google.ts` usando o JWT do Google API Auth, com mapeamento correto em português e bloco `try/catch` para isolar erros de rede ou API.
- [x] **3.4** Adicionar a Server Action `confirmarPedidoOperador` em `src/app/actions/pedidos.ts` mudando status para `'confirmado'`, invocando a integração do Google Calendar assincronamente e gravando o `google_event_id`.

### Phase 4: Integration Tests & Cleanup

- [x] **4.1** Desenvolver o script de integração `scripts/test-crm-integration.js` para automatizar testes locais de CRUD de catálogo, atualização do CRM e manipulação de pedidos.
- [x] **4.2** Testar a resiliência no script de integração simulando indisponibilidade da API do Google Calendar (mocking ou chaves inválidas) e confirmando que o pedido permanece ativo no banco.
- [x] **4.3** Realizar auditoria de logs no código para assegurar que informações sensíveis (como CPF, números de telefone crus ou detalhes confidenciais) não fiquem gravados abertamente nos logs do servidor.
