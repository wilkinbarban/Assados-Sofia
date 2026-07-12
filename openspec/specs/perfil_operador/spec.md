# Especificação de Requisitos: Perfil do Operador (perfil_operador)

**ID da Mudança:** `epica10-melhorias-gerais`  
**Domínio:** `perfil_operador`  
**Status:** `Aprovado`  

---

## 1. Descrição Executiva

Este documento especifica os requisitos de negócio e técnicos para o gerenciamento de perfis de operadores no CRM Asados. Os operadores devem poder atualizar com segurança suas informações de exibição e credenciais de acesso, com auditoria completa de suas ações em conformidade com as diretrizes de proteção de dados (LGPD).

---

## 2. Requisitos de Negócio e de Sistema (RFC 2119)

### 2.1 Módulo de Perfil do Operador
*   **REQ-PRF-001**: O sistema MUST criar a página gerencial `/atendimento/perfil` dedicada aos perfis dos operadores.
*   **REQ-PRF-002**: O acesso à rota `/atendimento/perfil` MUST ser restrito a usuários autenticados cujos perfis na tabela `public.perfis` contenham as funções (`funcao`) `'admin'`, `'supervisor'` ou `'vendedor'`.
*   **REQ-PRF-003**: A página de perfil MUST permitir que o operador atualize o seu Nome completo. Ao salvar, o sistema MUST atualizar o valor na coluna `nome` da tabela `public.perfis` correspondente ao `id` (`auth.uid()`) do operador logado.
*   **REQ-PRF-004**: A página de perfil MUST permitir que o operador redefina sua senha de acesso ao sistema. O processo MUST invocar a API de redefinição de dados de login do Supabase Auth no servidor.
*   **REQ-PRF-005**: Qualquer ação de atualização de perfil ou alteração de senha executada pelo operador MUST registrar um log de auditoria na tabela `public.logs_auditoria` com a ação `'atualizar_perfil'` e os detalhes associados, excluindo a exibição de dados pessoais sensíveis ou senhas.

---

## 3. Cenários de Aceitação (Gherkin - Given/When/Then)

### Cenário 1: Atualização de perfil e redefinição de senha do operador
*   **Given** que um operador vendedor chamado "Maurício" está conectado no sistema.
*   **And** navega até o endereço `/atendimento/perfil`.
*   **When** altera o seu nome no formulário para "Maurício de Souza" e clica em "Salvar Alterações".
*   **Then** o sistema executa a atualização no banco na tabela `public.perfis` e exibe feedback de sucesso.
*   **When** digita sua nova senha de acesso e clica em "Atualizar Senha".
*   **Then** o sistema executa o método de alteração de senha no Supabase Auth e exibe confirmação.
*   **And** adiciona um log de auditoria registrando a atividade `'atualizar_perfil'` para o operador.
