# Task Breakdown: Melhorias de Integração (Épica 9)

**ID da Mudança:** `epica9-melhorias-integracao`  
**Status:** `Planejado`  

---

## 1. Estimativa de Linhas e Workload Budget

*   **Chained PRs recommended:** Yes  
*   **400-line budget risk:** High  
*   **Decision needed before apply:** No (gerenciado via fluxo `auto-chain` utilizando a estratégia `stacked-to-main`)  

*Justificativa:* O escopo da Épica 9 é amplo e envolve múltiplos componentes de infraestrutura e aplicação: configurações de Docker e Nginx, nova página de tradução de e-mail e runbooks, criação de 5 novos componentes de cartões de integração na interface administrativa, refatoração de uma página central (`AdminDashboard.tsx`) reduzindo um bloco monolítico de formulário de cerca de 350 linhas, novas Server Actions de testes de conectividade, novos clientes e arquivos de integração de provedores do WhatsApp, além de novas rotas de webhook e scripts de testes diagnósticos. O total estimado de linhas afetadas ficará em torno de **600 a 700 linhas**, o que excede o limite recomendado de 400 linhas por PR. A estratégia de PRs encadeados (Stacked PRs) garante que cada parte do sistema seja revisada, testada e homologada de forma independente e isolada.

---

## 2. Unidades de Trabalho (Work Units)

### Work Unit 1: Email Confirmation & pt-BR i18n
*   **Descrição:** Tradução completa da página de verificação de e-mail (`/verificar-email`) para o Português do Brasil. Elaboração do template HTML oficial pt-BR do e-mail de confirmação e redação do guia de configuração externa do console do Supabase para direcionamento de URLs e templates de autenticação.
*   **Riscos associados:** Perda de compatibilidade de visualização em clientes de e-mail antigos devido ao uso inadequado de CSS no template HTML; links de confirmação inválidos caso a variável reservada do Supabase seja digitada incorretamente.

### Work Unit 2: Modular Integrations UI Components
*   **Descrição:** Modularização do painel de integrações da área administrativa. Criação de 5 componentes independentes para gerenciar configurações (LLM API, Meta WhatsApp, Evolution API, Google Calendar e Mercado Pago). Atualização do carregador SSR e refatoração completa do `AdminDashboard.tsx` para renderizar os novos componentes.
*   **Riscos associados:** Regressões visuais no painel administrativo ao desacoplar os campos; sincronização de estado incorreta da flag de provedor ativo (`WHATSAPP_PROVIDER`) entre os cartões de Meta e Evolution.

### Work Unit 3: Evolution API Service & Webhook Routing
*   **Descrição:** Configuração e implantação do serviço do Evolution API v2.2.3 no ambiente local e de produção via Docker Compose, configuração do proxy reverso Nginx para expor o serviço e implementação do endpoint de webhook específico para recepção de eventos de mensagens do Evolution, normalizando as cargas úteis.
*   **Riscos associados:** Exposição indesejada da API do Evolution caso as regras de roteamento do Nginx não reescrevam as URLs adequadamente; instabilidade na entrega de webhooks decorrente de falha de autenticação do cabeçalho da chave de API.

### Work Unit 4: WhatsApp Provider Abstraction & Testing
*   **Descrição:** Criação da camada abstrata de fábrica de provedores de WhatsApp para rotear dinamicamente as mensagens entre a API da Meta Cloud e o Evolution API. Implementação de Server Actions para os testes de conectividade e geração de QR code, correção do bug de leitura de variáveis de ambiente no webhook do WhatsApp, e criação de script diagnóstico ponta a ponta para validação de fluxos.
*   **Riscos associados:** Falha catastrófica de envio caso o provedor ativo retorne nulo; vazamento de conexões ou chamadas à API em ambiente de teste causados por mock inadequado.

---

## 3. Lista Hierárquica de Tarefas

### Fase 1: Email Confirmation & pt-BR i18n (Tradução e Fluxo de E-mail)

- [x] **1.1** Traduzir as strings em espanhol do arquivo `src/app/verificar-email/page.tsx` para pt-BR conforme especificado na seção 1.3 do design técnico.
- [x] **1.2** Criar o template de e-mail de confirmação em `docs/templates/email-confirmacao.html` usando cores oficiais (amber-500, red-600, zinc-950) e estilização inline compatível com leitores de e-mail.
- [x] **1.3** Incluir a variável obrigatória do Supabase `{{ .ConfirmationURL }}` no botão principal do template de e-mail.
- [x] **1.4** Criar o runbook `docs/supabase-email-setup.md` detalhando os passos para configurar a Site URL, Redirect URLs e o template de cadastro no painel do Supabase.
- [x] **1.5** Validar a exibição HTML do template simulando o envio ou abrindo-o localmente em um navegador web.

### Fase 2: Modular Integrations UI Components (Painel Modular de Integrações)

- [x] **2.1** Criar o arquivo de tipos em `src/components/operator/integrations/types.ts` contendo a interface `IntegrationCardProps` e suas extensões.
- [x] **2.2** Desenvolver o componente `LlmApiCard.tsx` sob `src/components/operator/integrations/` com formulário isolado para chaves do OpenRouter e botão de teste de conexão.
- [x] **2.3** Desenvolver o componente `MetaWhatsAppCard.tsx` sob `src/components/operator/integrations/` contendo as configurações de token, ID de telefone, segredo e token de verificação.
- [x] **2.4** Desenvolver o componente `EvolutionApiCard.tsx` sob `src/components/operator/integrations/` contendo campos de URL, chave de API, nome de instância e o seletor rápido (toggle) de provedor ativo (`WHATSAPP_PROVIDER`).
- [x] **2.5** Desenvolver o componente `GoogleCalendarCard.tsx` sob `src/components/operator/integrations/` exibindo as configurações vigentes em modo somente-leitura.
- [x] **2.6** Desenvolver o componente `MercadoPagoCard.tsx` sob `src/components/operator/integrations/` com campos de Access Token, Public Key e ação de salvar e testar credenciais.
- [x] **2.7** Atualizar o inicializador de configurações SSR em `src/app/atendimento/admin/page.tsx` para passar os novos valores padrões de chaves do Evolution API e Mercado Pago.
- [x] **2.8** Refatorar o arquivo `src/components/operator/AdminDashboard.tsx`, removendo o bloco de JSX de integrações monolítico (~350 linhas) e injetando os 5 novos cartões integrados com estado compartilhado para o controle de provedor ativo.

### Fase 3: Evolution API Service & Webhook Routing (Docker & Webhook)

- [x] **3.1** Inserir a definição do serviço `evolution-api` no arquivo `docker-compose.yml` utilizando a imagem `atendai/evolution-api:v2.2.3`, expondo a porta `8080` e configurando as variáveis de ambiente necessárias.
- [x] **3.2** Criar um volume nomeado no `docker-compose.yml` para persistência dos dados do banco local do Evolution API (`evolution_store`).
- [x] **3.3** Adicionar a regra de proxy reverso no `nginx.conf` apontando `/evolution/` para a porta local `8080` e configurando os cabeçalhos HTTP necessários.
- [x] **3.4** Criar a rota de API de Webhook do Evolution em `src/app/api/webhooks/evolution/route.ts`.
- [x] **3.5** Implementar a validação de autenticação no webhook checando se a requisição contém o cabeçalho `apikey` compatível com o valor de `EVOLUTION_API_KEY`.
- [x] **3.6** Implementar a normalização de payloads da API do Evolution para o formato unificado de mensagens do banco de dados (telefone, tipo de mídia, conteúdo) e gravação de histórico de conversas.


### Fase 4: WhatsApp Provider Abstraction & Testing (Fábrica de Provedores e Ações)

- [x] **4.1** Desenvolver a lógica de abstração e fábrica de provedores em `src/lib/whatsapp/provider.ts` para ler a chave de sistema `WHATSAPP_PROVIDER` e despachar a mensagem para o provedor adequado (Meta ou Evolution).
- [x] **4.2** Criar o arquivo `src/lib/whatsapp/evolution.ts` com funções utilitárias para chamar os endpoints de envio de texto, envio de mídia, verificação de status e solicitação de QR Code de conexão.
- [x] **4.3** Refatorar `src/lib/whatsapp/send.ts` isolando a lógica específica de envio da API Cloud da Meta e garantindo que o ponto de entrada comum consuma a fábrica unificada.
- [x] **4.4** Desenvolver a Server Action `testarConexaoEvolution` em `src/app/actions/admin.ts` para validar a conexão HTTP com a instância configurada do Evolution API.
- [x] **4.5** Desenvolver a Server Action `obterQrCodeEvolution` em `src/app/actions/admin.ts` para buscar o código QR base64 da API do Evolution.
- [x] **4.6** Desenvolver a Server Action `testarConexaoMercadoPago` em `src/app/actions/admin.ts` realizando uma chamada HTTP de teste ao endpoint de métodos de pagamento do Mercado Pago.
- [x] **4.7** Aplicar a correção no webhook original do WhatsApp `src/app/api/webhooks/whatsapp/route.ts` na linha 278, alterando o uso de variável de ambiente estática pela leitura dinâmica `obterConfiguracaoSistema('WHATSAPP_ACCESS_TOKEN')`.
- [x] **4.8** Desenvolver o script de diagnósticos integrados `scripts/test-epica9-integrations.js` testando a comutação de provedores, envio mockado do Evolution, rota de webhook e chamadas das Server Actions.
