# Especificação de Requisitos: Validação de Telefone e Portal do Cliente (validacao_telefone)

**ID da Mudança:** `epica1-auth-otp`  
**Domínio:** `validacao_telefone`  
**Status:** `Aprovado`  

---

## 1. Descrição Executiva
Este documento especifica as regras de validação de telefone para a cidade de Curitiba (DDD 41), o fluxo de verificação de número via WhatsApp OTP (One-Time Password) usando a Meta Cloud API, e o processo de fusão de contas (Account Merge) entre o usuário web cadastrado e seu histórico prévio gerado pelo WhatsApp. Adicionalmente, são definidos os requisitos para a página de configurações de perfil e endereço do cliente.

---

## 2. Requisitos de Negócio e de Sistema (RFC 2119)

### 2.1 Validação de Formato e Restrição de DDD 41 Curitiba
*   **REQ-TEL-001**: O número de telefone coletado no portal web MUST ser sanitizado antes de qualquer operação, removendo todos os caracteres não numéricos.
*   **REQ-TEL-002**: O número de telefone sanitizado MUST seguir estritamente o padrão de Curitiba (DDI 55, DDD 41, prefixo celular 9 seguido de 8 dígitos): `55419XXXXXXXX` (13 dígitos).
*   **REQ-TEL-003**: Qualquer tentativa de registrar ou enviar OTP para um número de telefone que não corresponda ao padrão `^55419[0-9]{8}$` MUST ser rejeitada na validação de formulário (frontend), na Server Action (backend) e na restrição do banco de dados (`chk_telefone_curitiba` e `chk_otp_telefone_curitiba`).

### 2.2 Fluxo de Geração e Envio de OTP via WhatsApp
*   **REQ-TEL-004**: O código OTP gerado MUST conter exatamente 6 dígitos numéricos aleatórios (por exemplo, `123456`).
*   **REQ-TEL-005**: Ao solicitar um código de verificação, o sistema MUST criar um registro na tabela `codigos_verificacao` contendo `usuario_id`, `telefone`, `codigo`, `verificado = false` e a data de expiração `expira_em` definida para exatamente 10 minutos após a geração.
*   **REQ-TEL-006**: O envio do OTP MUST ser feito de forma assíncrona chamando a API oficial de saída (outbound) da Meta WhatsApp Cloud API.
*   **REQ-TEL-007**: O sistema MUST implementar uma política de taxa limite (rate limit) que impeça a geração de um novo código OTP para o mesmo telefone/usuário em um intervalo menor que 60 segundos.

### 2.3 Validação de OTP e Vinculação de Conta (Account Merge)
*   **REQ-TEL-008**: O usuário MUST digitar o código OTP recebido em sua conta do WhatsApp na tela de verificação do portal.
*   **REQ-TEL-009**: O sistema MUST comparar o código inserido e validar que a data/hora atual é inferior à data/hora gravada em `expira_em` e que a flag `verificado` é falsa.
*   **REQ-TEL-010**: Se o OTP for válido e o número de telefone **não existir** previamente na tabela `clientes`, o sistema MUST criar um novo registro em `clientes` preenchendo `usuario_id` com o ID do usuário logado (`auth.uid()`), o `nome` do usuário, o `telefone` verificado e o `endereco` (se houver).
*   **REQ-TEL-011**: Se o OTP for válido e o número de telefone **já existir** na tabela `clientes` (por exemplo, de interações prévias do cliente via WhatsApp que criaram uma linha com `usuario_id IS NULL`), o sistema MUST executar o processo de fusão de contas (Account Merge), atualizando a linha existente para associar o `usuario_id` ao ID do usuário autenticado no site (`auth.uid()`).
*   **REQ-TEL-012**: O sistema MUST realizar a atualização e fusão em uma única transação atômica de banco de dados para evitar inconsistência de dados.
*   **REQ-TEL-013**: Após a validação com sucesso do OTP, o sistema MUST marcar o registro correspondente em `codigos_verificacao` como `verificado = true` para invalidar reutilizações.

### 2.4 Configurações de Perfil e Alteração de Telefone
*   **REQ-TEL-014**: O portal do cliente MUST possuir uma tela de "Perfil e Configurações" permitindo a alteração de: `nome`, `senha` e `endereco`.
*   **REQ-TEL-015**: Se o cliente tentar alterar o seu número de telefone na tela de configurações, o novo telefone digitado MUST passar pelo mesmo processo de validação de DDD 41 Curitiba (`55419XXXXXXXX`).
*   **REQ-TEL-016**: A alteração de telefone SHALL NOT ser efetivada imediatamente. O sistema MUST manter o telefone antigo ativo até que o novo número seja validado com sucesso através de um novo fluxo de verificação OTP via WhatsApp.
*   **REQ-TEL-017**: Se o novo número digitado já estiver vinculado a outro `usuario_id` diferente na tabela `clientes`, o sistema MUST rejeitar a alteração com erro de duplicidade.

---

## 3. Cenários de Aceitação (Gherkin - Given/When/Then)

### Cenário 1: Digitação de telefone Curitiba válido
*   **Given** que o usuário está autenticado e acessa a tela de verificação de telefone.
*   **When** o usuário digita o telefone `(41) 98888-7777` no campo de telefone.
*   **Then** o sistema sanitiza o valor para `5541988887777`.
*   **And** valida que o número atende à máscara internacional e à regex de Curitiba.
*   **And** permite o clique no botão "Enviar Código por WhatsApp".

### Cenário 2: Digitação de telefone inválido (DDI diferente ou DDD de outra cidade)
*   **Given** que o usuário está na tela de verificação de telefone.
*   **When** o usuário digita o número `(11) 99999-9999` (DDD de São Paulo) ou `(41) 3333-3333` (telefone fixo).
*   **Then** o sistema exibe um aviso visual de erro de validação.
*   **And** bloqueia o envio do formulário, exibindo a mensagem: "Somente telefones celulares DDD 41 de Curitiba (formato: (41) 9XXXX-XXXX) são permitidos".

### Cenário 3: Solicitação e Envio de OTP com Rate Limit
*   **Given** que o usuário digitou um telefone Curitiba válido `5541988887777`.
*   **When** o usuário clica em "Enviar Código por WhatsApp".
*   **Then** o sistema gera o código de 6 dígitos (ex: `654321`), cria o registro em `codigos_verificacao` com expiração de 10 minutos e dispara o webhook/mensagem na WhatsApp API da Meta.
*   **And** inicia um temporizador visual de 60 segundos na tela, desabilitando o botão de reenvio durante esse período.

### Cenário 4: Validação de OTP com sucesso (Sem histórico prévio)
*   **Given** que o sistema gerou o código `654321` para o telefone `5541988887777` e o usuário está na tela de verificação.
*   **When** o usuário digita o código correto `654321` dentro do prazo de 10 minutos e envia.
*   **Then** o sistema verifica a validade do código no banco de dados.
*   **And** cria um novo registro na tabela `clientes` mapeando `usuario_id` para o ID do usuário logado, `telefone` = `5541988887777` e `nome` = "Wilkin da Silva".
*   **And** marca o código como verificado.
*   **And** redireciona o cliente para a tela inicial do portal com acesso liberado.

### Cenário 5: Tentativa de validação com OTP incorreto ou expirado
*   **Given** que o código `654321` foi gerado, mas já se passaram 12 minutos (expirado) ou o usuário digita `111111` (incorreto).
*   **When** o usuário submete o formulário com o código inválido.
*   **Then** o sistema rejeita a validação no banco de dados.
*   **And** exibe uma mensagem de erro na interface dizendo "Código incorreto ou expirado. Por favor, solicite um novo código".
*   **And** mantém a tela de bloqueio ativa impedindo o acesso do cliente ao portal.

### Cenário 6: Fusão (Merge) de conta com histórico de WhatsApp pré-existente
*   **Given** que já existe uma linha na tabela `clientes` com `telefone` = `5541988887777`, `usuario_id` = `NULL`, contendo 5 conversas e 2 pedidos associados no banco de dados (histórico do WhatsApp).
*   **And** o usuário autenticado na web "cliente.wilkin@gmail.com" digita esse mesmo telefone e valida o OTP com sucesso.
*   **When** o sistema executa a vinculação após a validação.
*   **Then** o sistema atualiza o registro de `clientes` pré-existente definindo a coluna `usuario_id` com o UUID do usuário autenticado.
*   **And** o cliente passa a visualizar de forma unificada no seu painel web o histórico das 5 conversas e 2 pedidos vinculados a esse telefone.

### Cenário 7: Alteração bem-sucedida de endereço no portal
*   **Given** que o cliente logado acessa a página `/configuracoes`.
*   **When** o cliente edita o campo `endereco` para "Rua XV de Novembro, 1000 - Centro, Curitiba/PR" e clica em "Salvar".
*   **Then** o sistema atualiza a coluna `endereco` correspondente na tabela `clientes` via Server Action.
*   **And** exibe uma mensagem de sucesso temporária: "Endereço atualizado com sucesso".

### Cenário 8: Fluxo de alteração de telefone com nova validação OTP
*   **Given** que o cliente está com o telefone `5541988887777` validado e associado à sua conta.
*   **When** o cliente acessa as configurações e insere um novo número `(41) 97777-6666`.
*   **Then** o sistema bloqueia a alteração imediata.
*   **And** abre um modal solicitando o código de confirmação enviado para o novo número de WhatsApp.
*   **And** envia uma nova mensagem OTP de 6 dígitos via Meta Cloud API para o novo número `5541977776666`.
*   **When** o usuário insere o código correto enviado para o novo número.
*   **Then** o sistema altera o telefone na tabela `clientes` de `5541988887777` para `5541977776666`.
*   **And** exibe mensagem de telefone alterado com sucesso.
