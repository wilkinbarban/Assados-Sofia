# Resumo da Sessão — Projeto Sofía (Asados)

## Objetivo da Sessão
Alinhamento e planejamento da **Fase 0** do CRM Inteligente WhatsApp + IA "Sofía" para a churrascaria Asados, além da inicialização do contexto de desenvolvimento.

## Decisões de Arquitetura e Configurações
*   **Banco de Dados & Dados**: Definidos 100% em **Português do Brasil (pt-BR)**. Os preços serão armazenados em centavos (INTEGER).
*   **Moeda**: Real Brasileiro (BRL / R$).
*   **Horário de Funcionamento**: Sábados e domingos, das 10h às 14h (apenas entrega/retirada).
*   **Área de Entrega**: Cidade de Curitiba, Paraná. Telefone restrito ao formato `55419XXXXXXXX` (enforcado via CHECK constraint no banco de dados).
*   **Integrações**: 
    *   Mercado Pago Checkout Pro (Sandbox) para pagamentos online.
    *   Google Calendar para sincronização de pedidos confirmados via Service Account.
    *   OpenRouter (Gemini 1.5 Flash) para o processamento de linguagem natural e OCR de imagens.
*   **Verificação OTP via WhatsApp**: O número de celular inserido no registro web dos clientes deve ser validado via código OTP enviado por WhatsApp antes de liberar o portal ou fundir as contas.

## Trabalho Realizado nesta Sessão
1.  **Fase 0 Concluída**: Planejamento completo documentado no arquivo `docs/Sofia_Fase0.md` (inclui arquitetura, modelo de dados, políticas RLS, diretrizes de segurança LGPD/pagamentos e backlog detalhado de tarefas).
2.  **Regras do Projeto**: Criado o arquivo `.agents/AGENTS.md` com as diretrizes do projeto (slices, TDD, pt-BR).
3.  **Configuração de Ambiente**: Criado o arquivo `.env` com a URL do projeto Supabase e placeholders para todas as credenciais do sistema.
4.  **Supabase CLI**: Local do Supabase inicializado (`supabase init`) e vinculado com sucesso ao projeto cloud oficial `Asados` (ref ID: `xvzdxoktwnzmxsfizkxo`).
5.  **Passo 1 (sdd-init) Concluído**: Subagente executou com sucesso a inicialização em modo `openspec`, gerando `openspec/config.yaml` e `.atl/skill-registry.md`.

## Próximos Passos
*   Iniciar a **Fase de Especificação/Design (`sdd-spec` ou `sdd-propose`)** para a **Épica 1** (Infraestrutura, base de dados local, registro de usuários com e-mail e telefone verificado via OTP).
