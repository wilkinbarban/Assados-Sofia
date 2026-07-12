# client-payment-receipts Specification

## Purpose
Enforce valid PDF uploads, trigger Sofia handoff, and log receipt metadata.

## Requirements

### Requirement: REQ-REC-001 - Validação de PDF
O chat MUST aceitar apenas PDFs válidos (< 5MB, magic bytes `%PDF` no cabeçalho).

#### Scenario: Upload válido
- GIVEN o chat aberto
- WHEN o cliente envia um PDF < 5MB com magic bytes `%PDF`
- THEN o upload é aceito e o arquivo é salvo no bucket `chat-midias`

#### Scenario: Upload inválido
- GIVEN o chat aberto
- WHEN o cliente envia um arquivo > 5MB ou sem magic bytes `%PDF`
- THEN o upload é rejeitado com mensagem de erro

### Requirement: REQ-REC-002 - Desativação de IA Sofia e Handoff
Ao aceitar um PDF, o sistema MUST desativar Sofia (`ia_ativa = false`), mudar o chat para `aberta` e enviar a resposta de handoff.

#### Scenario: Handoff automático
- GIVEN `ia_ativa = true`
- WHEN um PDF válido é enviado
- THEN `ia_ativa` altera para `false`
- AND o status do chat altera para `aberta`
- AND a mensagem de auto-resposta de Sofia é inserida no chat

### Requirement: REQ-REC-003 - Registro no Banco
Os comprovantes válidos MUST ser registrados na tabela `comprovantes`.

#### Scenario: Persistência de metadados
- GIVEN o upload com sucesso do PDF no bucket `chat-midias`
- WHEN o registro é processado
- THEN uma nova linha é criada na tabela `comprovantes` vinculada ao cliente
