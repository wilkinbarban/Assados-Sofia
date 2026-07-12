# Task Breakdown: RAG e Base de Conhecimento (Épica 5)

**ID da Mudança:** `epica5-rag-knowledge`  
**Status:** `Planejado`  

---

## 1. Estimativa de Linhas e Workload Budget

*   **Chained PRs recommended:** Yes  
*   **400-line budget risk:** High  
*   **Decision needed before apply:** Yes (Sob a estratégia `ask-on-risk`, o orquestrador deve solicitar autorização do usuário antes de aplicar as mudanças)  

*Justificativa:* O escopo da Épica 5 é robusto e complexo. Inclui migrações de banco de dados (tabela de base de conhecimento, triggers de atualização, geração de `tsvector` para busca textual indexada, função de busca `buscar_artigos_relevantes` em PL/pgSQL e políticas RLS de controle de acesso), um pipeline RAG sofisticado (`src/lib/ai/openrouter.ts`) que consome dados do banco, monta histórico de conversas e conecta ao OpenRouter com fallback resiliente para Mock Mode, além de hooks síncronos/assíncronos em webhooks (`src/app/api/webhooks/whatsapp/route.ts`), Server Actions estruturadas com checagem rígida de permissões (`src/app/actions/conhecimento.ts`), tela administrativa completa (`src/app/atendimento/conhecimento/page.tsx` com `src/components/operator/KnowledgeCRUD.tsx`) e testes de integração avançados (`scripts/test-rag-integration.js`). O total estimado de linhas modificadas ou criadas ficará em torno de **600 a 700 linhas**, ultrapassando significativamente o orçamento ideal de 400 linhas. A divisão em PRs menores e sequenciais é altamente recomendada.

---

## 2. Unidades de Trabalho (Work Units)

### Work Unit 1: Database Migration & RAG Utility
*   **Descrição:** Criação da migração SQL com a tabela `base_conhecimento`, coluna armazenada `busca_vector`, índice GIN, função de busca baseada em FTS e políticas RLS para proteção dos dados. Implementação em código do utilitário central do pipeline RAG (`src/lib/ai/openrouter.ts`), englobando busca semântica/textual via RPC, compilação de histórico de mensagens e integração com OpenRouter (com chave e Mock Mode).
*   **Riscos associados:** Desempenho inadequado do Full-Text Search (FTS) em português caso a conversão de caracteres e acentuação não esteja calibrada; vazamento de chaves ou comportamento incorreto da persona de IA se o contexto fornecido falhar.

### Work Unit 2: In-Code RAG Ingestion Hooking
*   **Descrição:** Integração e disparo do pipeline `processarRagPipeline` dentro do fluxo de recebimento de mensagens no Webhook do WhatsApp (`src/app/api/webhooks/whatsapp/route.ts`) e no fluxo de mensagens do portal do cliente, ativando a resposta automatizada de forma assíncrona apenas quando a flag `ia_ativa` na tabela `conversas` estiver habilitada.
*   **Riscos associados:** Chamadas duplicadas à API de IA caso o webhook do WhatsApp realize retentativas agressivas por timeout; overhead de latência se as promessas não forem disparadas de forma adequadamente isolada.

### Work Unit 3: Operator CRUD Panel & Server Actions
*   **Descrição:** Desenvolvimento das Server Actions em `src/app/actions/conhecimento.ts` para controle total dos artigos (criar, atualizar, excluir e ativar/desativar), aplicando validações estritas de perfil (`admin` ou `supervisor`). Construção da rota `/atendimento/conhecimento/page.tsx` e do componente interativo `src/components/operator/KnowledgeCRUD.tsx` usando tema escuro premium com cores âmbar/laranja.
*   **Riscos associados:** Falha na autorização das Server Actions permitindo que vendedores ou usuários externos modifiquem a base de conhecimento.

### Work Unit 4: RAG Integration & Security Testing
*   **Descrição:** Escrita do script de testes automatizados `scripts/test-rag-integration.js` para simular requisições de RAG, validar o ranqueamento do FTS, checar a compilação do prompt do OpenRouter, verificar o comportamento de envio assíncrono por WhatsApp e assegurar as regras do RLS.
*   **Riscos associados:** Falta de mock adequado nos testes provocando chamadas reais e desperdício de créditos na API externa; testes instáveis causados por concorrência de transações locais no Supabase.

---

## 3. Lista Hierárquica de Tarefas

### Fase 1: DB & AI Core (Banco de Dados & Núcleo da IA)

- [x] **1.1** Criar o arquivo de migração em `supabase/migrations/20260704160000_epica5_rag_knowledge.sql` contendo a tabela `public.base_conhecimento` e o trigger para atualização de timestamp.
- [x] **1.2** Adicionar a coluna armazenada `busca_vector` gerada automaticamente a partir do título e conteúdo, e criar o índice GIN `idx_base_conhecimento_busca_vector` para alta performance de busca.
- [x] **1.3** Implementar a função SQL de busca relevante `public.buscar_artigos_relevantes(query_text TEXT)` com privilégio `SECURITY DEFINER` e ranking por relevância (`ts_rank_cd`).
- [x] **1.4** Aplicar a política RLS restrita na tabela `public.base_conhecimento`, limitando qualquer operação de CRUD a operadores com papéis de `admin`, `supervisor` ou `vendedor`.
- [x] **1.5** Criar o módulo principal de inteligência artificial em `src/lib/ai/openrouter.ts`.
- [x] **1.6** Implementar a função `processarRagPipeline(conversaId: string, mensagemCliente: string)` que executa a RPC `buscar_artigos_relevantes` para recuperar o contexto ideal da base.
- [x] **1.7** Implementar no pipeline RAG a recuperação de até 10 mensagens anteriores da conversa ativa, ordenando-as cronologicamente (`data_criacao ASC`) para montar o contexto de chat.
- [x] **1.8** Estruturar o System Prompt da persona "Sofía" no pipeline, especificando traços de personalidade (Curitibana, churrascaria, amigável), limite de uso de emojis e restrição rígida de não alucinar fora do contexto.
- [x] **1.9** Implementar a chamada HTTP para a API do OpenRouter e o *Modo Mock* de contingência (que analisa palavras-chave e devolve respostas predefinidas caso a chave de API falhe ou não exista no ambiente).
- [x] **1.10** Adicionar a lógica de despacho final no pipeline: enviar via WhatsApp assíncrono se o telefone pertencer a Curitiba (`^55419[0-9]{8}$`) ou registrar diretamente na tabela `public.mensagens` caso contrário.

### Fase 2: Webhooks & Hooking (Webhooks & Integração de Entrada)

- [x] **2.1** Ajustar a rota de webhook do WhatsApp (`src/app/api/webhooks/whatsapp/route.ts`) para ler o status da conversa e identificar se `conversa.ia_ativa` é verdadeiro.
- [x] **2.2** Injetar a chamada assíncrona ao `processarRagPipeline` logo após a gravação da mensagem recebida do cliente no webhook, rodando em background para evitar timeouts na resposta ao provedor do WhatsApp.
- [x] **2.3** Integrar gancho equivalente no fluxo de inserção de mensagens da página do cliente (chat web) para acionar a resposta da IA se a conversa correspondente possuir atendimento por inteligência artificial habilitado.

### Fase 3: Admin Dashboard UI (Painel de Operador & Server Actions)

- [x] **3.1** Desenvolver as Server Actions em `src/app/actions/conhecimento.ts` exportando funções para `criarArtigo`, `atualizarArtigo`, `excluirArtigo` e `alternarStatusArtigo`.
- [x] **3.2** Incluir verificação rigorosa de sessão ativa e autorização do usuário nas Server Actions, rejeitando requisições de perfis que não possuam `funcao` igual a `'admin'` ou `'supervisor'`.
- [x] **3.3** Criar a rota de página administrativa `/atendimento/conhecimento/page.tsx` com tratamento de erro e bloqueio nativo em nível de roteamento se o perfil do usuário for inválido.
- [x] **3.4** Desenvolver o componente principal de gerenciamento `src/components/operator/KnowledgeCRUD.tsx` usando visual escuro e moderno alinhado à identidade visual premium do sistema.
- [x] **3.5** Implementar formulários com inputs elegantes, validações de campos obrigatórios (título, conteúdo), controle de tags e estados dinâmicos de submissão (loading).
- [x] **3.6** Integrar o controle rápido de ativação/desativação de artigos na listagem usando switches que disparam a ação `alternarStatusArtigo` otimista ou reativa.
- [x] **3.7** Adicionar modal de confirmação de exclusão física/lógica de artigos para evitar acidentes operacionais.

### Fase 4: Testing & Cleanup (Testes de Integração & Homologação)

- [x] **4.1** Desenvolver o script de testes `scripts/test-rag-integration.js` importando as utilidades do Supabase e as funções do pipeline de IA.
- [x] **4.2** Escrever testes que verifiquem a acurácia de ranking do Full-Text Search (FTS) inserindo artigos temporários de teste e realizando buscas controladas.
- [x] **4.3** Validar no script o fluxo completo do pipeline RAG sob o *Modo Mock* de contingência, assegurando que o prompt e o histórico sejam compilados adequadamente.
- [x] **4.4** Simular e testar as saídas do despachante de mensagens do pipeline (validando o envio por API de WhatsApp para número Curitibano e inserção direta no banco para outros DDDs).
- [x] **4.5** Testar a segurança de RLS tentando ler e escrever na tabela `base_conhecimento` a partir de um cliente Supabase anônimo ou sem privilégios administrativos.
- [x] **4.6** Realizar varredura nos logs de depuração do OpenRouter e do RAG para atestar a conformidade com a LGPD (assegurar que dados pessoais sensíveis ou PII bruto dos clientes não sejam logados nos servidores de aplicação).
