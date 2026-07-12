# Regras de Desenvolvimento — Projeto Sofía (Asados)

Este arquivo define as regras e diretrizes mandatórias que qualquer agente da Antigravity deve seguir durante o ciclo de vida deste projeto.

---

## 1. Estratégia de Desenvolvimento por Rebanadas (Slices)
*   **Abordagem Incremental**: O desenvolvimento deve avançar estritamente Épica por Épica (fatiamento vertical). Não é permitido programar múltiplos módulos complexos ou paralelos ao mesmo tempo.
*   **Aprovação entre Slices**: O agente deve guiar o usuário na conclusão de cada Épica, verificar se tudo está 100% testado, e solicitar autorização explícita antes de avançar para a próxima rebanada.

## 2. Metodologia SDD (Spec-Driven Development) & TDD
*   **Fluxo SDD Obligatório**: Para cada Épica, seguir os subagentes específicos da fase (`sdd-spec` -> `sdd-design` -> `sdd-tasks` -> `sdd-apply` -> `sdd-verify`).
*   **Foco em TDD**: Antes de escrever a lógica final das Server Actions ou middlewares, devem ser criados ou estruturados os scripts de testes correspondentes (especialmente para validação de fluxos críticos e testes de políticas RLS em Supabase).

## 3. Diretrizes de Segurança e Privacidade
*   **Validação de Telefone**: Enforce a nível de banco de dados (`chk_telefone_curitiba`) e frontend que todo celular seja de Curitiba: DDI `55`, DDD `41`, prefixo `9` seguido por 8 dígitos (`55419XXXXXXXX`).
*   **WhatsApp OTP**: Nenhum telefone de cliente web pode ser vinculado ou ativado no banco sem antes passar pela validação de código OTP enviado por WhatsApp.
*   **Segurança de Chaves e LGPD**: Todas as credenciais sensíveis devem ser lidas exclusivamente do arquivo `.env` no servidor. Os logs de auditoria não podem conter dados pessoais brutos (PII) dos clientes.

## 4. Convenção de Idiomas
*   **Artefatos e Banco de Dados (pt-BR)**: Todos os nomes de tabelas, colunas, enums, comentários de código, textos da interface do usuário (UI) e prompts de IA devem ser criados em **Português do Brasil**.
*   **Respostas no Chat**: As respostas ao usuário devem ser mantidas no idioma atual dele (Espanhol Rioplatense com voseo).
