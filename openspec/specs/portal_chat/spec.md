# Especificação de Requisitos: Portal de Chat do Cliente e Histórico (portal_chat)

**ID da Mudança:** `epica2-client-chat`  
**Domínio:** `portal_chat`  
**Status:** `Pendente de Revisão`  

---

## 1. Descrição Executiva
Este documento especifica formalmente os requisitos funcionais, de modelagem de banco de dados, segurança em nível de linha (RLS) e comportamento da interface do usuário (UI) para o Portal de Chat do Cliente Web e seu Histórico no sistema da churrascaria **Asados**. O objetivo é prover um canal de comunicação bidirecional direto e fluido entre o cliente final e o atendimento da churrascaria, o qual é operado inicialmente pela inteligência artificial (Sofía) e, quando necessário, por operadores humanos. A sincronização de mensagens deve ocorrer em tempo real sem dependência de recarregamento manual (F5).

---

## 2. Requisitos de Negócio e de Sistema (RFC 2119)

### 2.1 Modelagem do Banco de Dados e Enums
*   **REQ-CHAT-001**: O sistema MUST criar o tipo ENUM `status_conversa` contendo exatamente os valores:
    *   `'ia_atendendo'`: A inteligência artificial (Sofía) está encarregada de responder autonomamente às interações do cliente.
    *   `'aberta'`: A conversa foi transferida para a fila de atendimento humano e aguarda ou está em atendimento por um operador.
    *   `'fechada'`: O atendimento foi encerrado, não permitindo novas mensagens.
*   **REQ-CHAT-002**: O sistema MUST criar o tipo ENUM `tipo_remetente` contendo exatamente os valores:
    *   `'cliente'`: Mensagem enviada pelo próprio cliente dono do chat através do portal web.
    *   `'operador'`: Mensagem enviada por um funcionário da churrascaria via painel CRM.
    *   `'ia'`: Mensagem gerada automaticamente pela Sofía (IA).
*   **REQ-CHAT-003**: O sistema MUST criar a tabela `conversas` com a seguinte estrutura e restrições:
    *   `id` (uuid): Chave primária, gerada automaticamente via `gen_random_uuid()`.
    *   `cliente_id` (uuid): Chave estrangeira que referencia `clientes.id`. O preenchimento MUST ser obrigatório (`NOT NULL`).
    *   `status` (`status_conversa`): Status atual do fluxo. MUST possuir valor padrão `'ia_atendendo'` e ser obrigatório.
    *   `ia_ativa` (boolean): Flag de controle indicando se a IA está ativa na conversa. MUST possuir valor padrão `true` e ser obrigatório.
    *   `created_at` (timestamp with time zone): Data/hora de criação do chat. Valor padrão `now()`, obrigatório.
    *   `updated_at` (timestamp with time zone): Data/hora da última alteração. Valor padrão `now()`, obrigatório.
*   **REQ-CHAT-004**: O sistema MUST criar a tabela `mensagens` com a seguinte estrutura e restrições:
    *   `id` (uuid): Chave primária, gerada automaticamente via `gen_random_uuid()`.
    *   `conversa_id` (uuid): Chave estrangeira que referencia `conversas.id` com política `ON DELETE CASCADE`. O preenchimento MUST ser obrigatório (`NOT NULL`).
    *   `remetente` (`tipo_remetente`): Quem originou a mensagem. O preenchimento MUST ser obrigatório (`NOT NULL`).
    *   `conteudo` (text): O texto da mensagem. Pode ser nulo se houver anexo.
    *   `url_anexo` (text): O link público do arquivo armazenado no Supabase Storage. Opcional (`NULL`).
    *   `created_at` (timestamp with time zone): Data/hora do envio da mensagem. Valor padrão `now()`, obrigatório.
*   **REQ-CHAT-005**: O banco de dados MUST impor uma restrição de verificação (`CHECK constraint` com nome `chk_conteudo_ou_anexo`) na tabela `mensagens` para garantir que pelo menos uma das colunas `conteudo` ou `url_anexo` não seja nula: `(conteudo IS NOT NULL OR url_anexo IS NOT NULL)`.

### 2.2 Segurança de Nível de Linha (RLS)
*   **REQ-CHAT-006**: O sistema MUST ativar Row Level Security (RLS) nas tabelas `conversas` e `mensagens`.
*   **REQ-CHAT-007**: As políticas RLS para a tabela `conversas` sob o escopo do papel do cliente autenticado MUST atender a:
    *   **SELECT**: O usuário logado só pode visualizar registros em `conversas` se existir uma linha na tabela `clientes` cujo `usuario_id` seja correspondente a `auth.uid()` e cujo `id` seja igual ao `cliente_id` da conversa.
    *   **INSERT**: O usuário logado só pode inserir uma conversa se o `cliente_id` fornecido possuir `usuario_id = auth.uid()` na tabela `clientes`.
    *   **UPDATE / DELETE**: Clientes autenticados SHALL NOT possuir permissão para atualizar ou remover registros da tabela `conversas`. Essas operações são de uso exclusivo do sistema (através de trigger/serviço) ou de operadores humanos autenticados com papéis adequados.
*   **REQ-CHAT-008**: As políticas RLS para a tabela `mensagens` sob o escopo do papel do cliente autenticado MUST atender a:
    *   **SELECT**: O usuário logado só pode consultar mensagens vinculadas a conversas de sua propriedade (onde `conversas.cliente_id` aponta para `clientes.id` cujo `usuario_id = auth.uid()`).
    *   **INSERT**: O usuário logado só pode inserir uma mensagem se:
        1. A conversa vinculada (`conversa_id`) pertencer a ele (validação de propriedade via `cliente_id`).
        2. A coluna `remetente` da nova mensagem for exatamente `'cliente'`.
        3. O status da conversa associada no momento da inserção for diferente de `'fechada'`.
    *   **UPDATE / DELETE**: Clientes autenticados SHALL NOT possuir permissão para atualizar ou deletar mensagens já gravadas no banco de dados.

### 2.3 Sincronização em Tempo Real (Supabase Realtime)
*   **REQ-CHAT-009**: A tabela `mensagens` MUST ser exposta na publicação de replicação em tempo real (`supabase_realtime`) para permitir a escuta ativa de eventos de inserção (`INSERT`).
*   **REQ-CHAT-010**: A interface do chat no portal do cliente MUST assinar o canal do Supabase Realtime aplicando um filtro dinâmico pelo ID da conversa aberta (`conversa_id = eq.UUID`).
*   **REQ-CHAT-011**: Sempre que um novo registro de mensagem for disparado no canal de tempo real, a interface do portal do cliente MUST renderizar a mensagem de forma reativa, anexando-a ao final da lista visual instantaneamente.

### 2.4 Interface do Usuário (UI) e Funcionalidades do Portal
*   **REQ-CHAT-012**: O Portal de Chat MUST ser desenvolvido usando componentes acessíveis, responsivos (otimizados para mobile) e baseados nos padrões visuais premium da churrascaria Asados (CSS/Tailwind, fontes modernas e paleta de cores escura e quente harmoniosa).
*   **REQ-CHAT-013**: O cabeçalho da janela do chat MUST exibir um indicador persistente de quem está no comando do atendimento:
    *   Se `ia_ativa` for `true` ou `status` for `'ia_atendendo'`: Exibir "Sofia (IA)" com um badge verde piscante indicando sistema automatizado ativo.
    *   Se `ia_ativa` for `false` ou `status` for `'aberta'`: Exibir "Atendente Humano" com um badge azul estático indicando atendimento por um operador da churrascaria.
*   **REQ-CHAT-014**: Se o status da conversa for alterado para `'fechada'`, o chat do cliente MUST mudar visualmente:
    *   O campo de texto (`textarea`/`input`) MUST ser desabilitado (`disabled`).
    *   O botão de envio e o botão de upload de anexos MUST ser ocultados ou desabilitados.
    *   Uma caixa informativa destacada MUST ser renderizada com o texto: "Esta conversa foi encerrada. Se precisar de ajuda, inicie um novo atendimento."
*   **REQ-CHAT-015**: As mensagens trocadas MUST ser apresentadas de forma contrastante no histórico:
    *   Mensagens do `'cliente'`: Alinhadas à direita com fundo contrastante destacado da marca Asados.
    *   Mensagens da `'ia'` ou `'operador'`: Alinhadas à esquerda com fundo neutro suave (cinza ou tom escuro sutil).
*   **REQ-CHAT-016**: A exibição de anexos (`url_anexo`) na interface do chat MUST seguir as seguintes diretrizes:
    *   Se a URL apontar para um formato de imagem (por exemplo, extensões `.jpg`, `.jpeg`, `.png`, `.webp` ou metadados de imagem), a UI MUST renderizar uma miniatura (thumbnail) do arquivo com zoom ou abertura em lightbox sob clique.
    *   Se for outro formato de arquivo (ex: `.pdf`, `.txt`), a UI MUST renderizar um cartão contendo um ícone de documento e um link de download rotulado de forma limpa.
*   **REQ-CHAT-017**: A janela de mensagens MUST implementar um comportamento de scroll automático para a parte inferior sempre que a tela for aberta e sempre que novas mensagens (enviadas ou recebidas via Realtime) forem incorporadas ao histórico.

---

## 3. Cenários de Aceitação (Gherkin - Given/When/Then)

### Cenário 1: Inicialização automática de chat pelo cliente
*   **Given** que o cliente está autenticado no portal do cliente e não possui nenhuma conversa em andamento.
*   **When** o cliente acessa a tela de ajuda ou clica em "Iniciar Chat".
*   **Then** o sistema invoca uma Server Action que insere um registro na tabela `conversas` definindo o `cliente_id` associado ao usuário autenticado, `status` = `'ia_atendendo'` e `ia_ativa` = `true`.
*   **And** a interface do portal carrega a janela de chat com o indicador visual "Sofia (IA)" ativo.

### Cenário 2: Envio de mensagem de texto simples pelo cliente
*   **Given** que a conversa do cliente está ativa com status `'ia_atendendo'`.
*   **When** o cliente insere o texto "Qual o horário de funcionamento de hoje?" no campo de entrada e clica em "Enviar".
*   **Then** o sistema executa a inserção na tabela `mensagens` definindo o `conversa_id` correspondente, `remetente` = `'cliente'`, `conteudo` = "Qual o horário de funcionamento de hoje?" e `url_anexo` = `NULL`.
*   **And** a mensagem é exibida imediatamente no histórico alinhada à direita com a cor de destaque da marca.

### Cenário 3: Bloqueio de inserção direta com remetente falso (RLS)
*   **Given** que o cliente com ID de usuário "user-cliente-1" está autenticado.
*   **When** ele executa um comando de inserção direta no banco de dados na tabela `mensagens` com `remetente` = `'operador'` ou `remetente` = `'ia'`.
*   **Then** o Supabase intercepta a requisição e rejeita a inserção devido à política RLS que proíbe clientes de gravarem mensagens que não tenham o remetente configurado como `'cliente'`.
*   **And** nenhum registro é adicionado à tabela `mensagens`.

### Cenário 4: Bloqueio de leitura de chat de terceiros (RLS)
*   **Given** que o cliente "A" com ID de usuário "user-cliente-A" está autenticado no portal.
*   **When** ele tenta efetuar um `select` na tabela `mensagens` ou na tabela `conversas` informando o ID de conversa correspondente ao atendimento do cliente "B".
*   **Then** a política RLS intercepta o comando e retorna uma resposta vazia (0 registros localizados).
*   **And** nenhuma mensagem ou dados do cliente "B" são revelados.

### Cenário 5: Atualização reativa em tempo real no portal ao receber resposta da IA
*   **Given** que o cliente está visualizando a tela de chat correspondente à conversa de ID "uuid-conversa-123".
*   **When** a inteligência artificial (Sofía) processa a dúvida do cliente e insere uma nova linha na tabela `mensagens` com `conversa_id` = "uuid-conversa-123", `remetente` = `'ia'` e `conteudo` = "Abrimos das 18h às 23h30.".
*   **Then** o cliente do Supabase Realtime no navegador captura o evento de inserção.
*   **And** a interface do portal adiciona dinamicamente a resposta da Sofía no lado esquerdo do chat com o texto "Abrimos das 18h às 23h30.".
*   **And** realiza a rolagem (scroll) automática da tela de mensagens até o rodapé.

### Cenário 6: Mudança visual de canal de atendimento ao transferir para humano
*   **Given** que o cliente está com o chat aberto na tela, com o cabeçalho marcando "Sofia (IA)" em verde.
*   **When** um operador da churrascaria clica em "Assumir Conversa" no painel administrativo, alterando a linha em `conversas` para `status` = `'aberta'` e `ia_ativa` = `false`.
*   **Then** a interface do portal do cliente recebe a atualização de estado em tempo real.
*   **And** atualiza instantaneamente o cabeçalho do chat do cliente para "Atendente Humano" com um badge azul.
*   **And** o cliente visualiza que as próximas mensagens serão respondidas por um atendente.

### Cenário 7: Envio de mensagem com anexo de imagem
*   **Given** que o cliente deseja enviar uma imagem de um comprovante no chat.
*   **When** ele seleciona o arquivo `recibo.png`, digita a mensagem opcional "Segue o recibo" e clica em enviar.
*   **Then** o sistema realiza o upload do arquivo para o bucket privado do Supabase Storage.
*   **And** grava o registro na tabela `mensagens` com `conteudo` = "Segue o recibo" e `url_anexo` = "https://supabase.co/storage/v1/object/public/anexos/recibo.png".
*   **And** a interface renderiza a mensagem no histórico do chat apresentando a imagem em miniatura embutida e clicável para visualização ampliada.

### Cenário 8: Rejeição de mensagem sem conteúdo e sem anexo (Constraint do Banco)
*   **Given** que o cliente está digitando no chat.
*   **When** por erro ou tentativa maliciosa, o cliente envia um payload de mensagem contendo `conteudo` = `NULL` e `url_anexo` = `NULL`.
*   **Then** o banco de dados PostgreSQL rejeita a transação por violar a restrição de verificação `chk_conteudo_ou_anexo`.
*   **And** o sistema retorna uma mensagem de erro apropriada no console/API e não grava a linha.

### Cenário 9: Comportamento do portal de chat ao ser encerrado
*   **Given** que o operador encerra a conversa no CRM, alterando o status para `'fechada'`.
*   **When** o cliente visualiza ou tenta interagir com a janela do chat correspondente.
*   **Then** o portal de chat desabilita o campo de digitação de texto (`disabled`) e esconde os botões de envio/anexos.
*   **And** renderiza uma faixa visual amarela na base do chat exibindo: "Esta conversa foi encerrada. Se precisar de ajuda, inicie um novo atendimento."
*   **And** qualquer tentativa de inserção de mensagem para este `conversa_id` via API direta pelo cliente é rejeitada pela política RLS.
