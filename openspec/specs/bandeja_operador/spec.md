# Especificação de Requisitos: Bandeja de Entrada em Tempo Real do Operador e Interruptor de IA (bandeja_operador)

**ID da Mudança:** `epica4-operator-inbox`  
**Domínio:** `bandeja_operador`  
**Status:** `Pendente de Revisão`  

---

## 1. Descrição Executiva

Este documento especifica formalmente os requisitos funcionais, não funcionais, de interface do usuário (UI) e de segurança para a **Bandeja de Entrada em Tempo Real do Operador** no sistema **Asados**. O objetivo principal é disponibilizar um painel administrativo centralizado para que operadores humanos (com funções de `admin`, `supervisor` ou `vendedor`) gerenciem e respondam a conversas de clientes de forma fluida e instantânea.

O painel deve conter uma visualização dividida (split-pane) com a listagem de conversas ativas à esquerda e a conversa selecionada (chat ativo) com seu histórico de mensagens à direita. O sistema deve permitir que o operador assuma a conversa desativando a inteligência artificial (Sofía) através de um interruptor visual (IA Manual Toggle), o qual altera as propriedades de status e delega o atendimento ao humano. 

Toda a troca de mensagens na interface deve ser atualizada em tempo real, subscrevendo-se aos canais do Supabase Realtime. Quando o operador enviar uma mensagem para um cliente com telefone validado, o sistema deve despachar automaticamente a mensagem por meio da API oficial do WhatsApp (Meta Cloud API) sob o capô, utilizando o utilitário `enviarMensagemWhatsapp`.

---

## 2. Requisitos de Negócio e de Sistema (RFC 2119)

### 2.1 Controle de Acesso e Rota do Operador
*   **REQ-OPE-001**: O painel de atendimento MUST estar localizado no caminho `/atendimento` ou `/dashboard`.
*   **REQ-OPE-002**: O acesso a essas rotas MUST ser restrito exclusivamente a usuários autenticados cujos perfis na tabela `perfis` tenham a coluna `funcao` definida como `'admin'`, `'supervisor'` ou `'vendedor'`, e a coluna `ativo` definida como `true`.
*   **REQ-OPE-003**: Qualquer tentativa de acesso às rotas de operador por usuários com papel `'cliente'` ou não autenticados MUST resultar em redirecionamento automático para a página de login (`/login`) ou de erro de acesso negado (`/403`), gerenciado via Middleware do Next.js.

### 2.2 Listagem de Conversas (Fila de Atendimento)
*   **REQ-OPE-004**: O painel esquerdo MUST listar as conversas ativas ordenadas pela coluna `conversas.data_atualizacao` de forma decrescente (mais recentes primeiro).
*   **REQ-OPE-005**: Cada item da listagem de conversa MUST exibir claramente:
    *   O nome do cliente (`clientes.nome`).
    *   O telefone do cliente formatado (`clientes.telefone`).
    *   Um fragmento (snippet) da última mensagem enviada ou recebida (a mensagem mais recente associada à conversa).
    *   O status atual da conversa (`conversas.status`: `'ia_atendendo'`, `'aberta'` ou `'fechada'`).
    *   O indicador de agente ativo (`ia_ativa` = `true` indica "Sofia (IA)" e `ia_ativa` = `false` indica "Humano").
*   **REQ-OPE-006**: A listagem de conversas MUST oferecer abas de filtro separadas para organizar o fluxo de trabalho:
    *   **Aba "Fila IA"**: Exibe apenas conversas onde `conversas.ia_ativa` é `true`.
    *   **Aba "Fila Humana"**: Exibe apenas conversas onde `conversas.ia_ativa` é `false` e `conversas.status = 'aberta'`.
    *   **Aba "Fechadas"**: Exibe conversas com `conversas.status = 'fechada'`.
*   **REQ-OPE-007**: A listagem MUST atualizar-se dinamicamente na interface sem recarregamento de página toda vez que houver uma inserção em `mensagens` ou atualização em `conversas` transmitidas via Supabase Realtime, movendo a conversa modificada para o topo da lista.

### 2.3 Painel do Chat Ativo e Mensagens em Tempo Real
*   **REQ-OPE-008**: Ao selecionar uma conversa na listagem, o painel central/direito MUST renderizar o histórico de mensagens ordenado cronologicamente por `mensagens.data_criacao` (ascendente).
*   **REQ-OPE-009**: As mensagens do histórico MUST ser alinhadas visualmente com base no remetente:
    *   Mensagens do cliente (`remetente = 'cliente'`): Alinhadas à esquerda com fundo contrastante neutro.
    *   Mensagens da IA (`remetente = 'ia'`): Alinhadas à direita com fundo diferenciado (estilo robô/automação).
    *   Mensagens do operador (`remetente = 'operador'`): Alinhadas à direita com a cor de destaque da marca.
*   **REQ-OPE-010**: A interface do painel de chat ativo MUST realizar uma subscrição em tempo real utilizando o Supabase Realtime para escutar inserções na tabela `mensagens` filtradas pelo ID da conversa selecionada (`conversa_id = eq.UUID`).
*   **REQ-OPE-011**: Ao detectar uma nova mensagem via canal Realtime, a UI do chat ativo MUST anexá-la imediatamente ao final da lista e executar a rolagem automática (scroll to bottom) para manter a última mensagem visível.

### 2.4 Envio de Mensagens pelo Operador e Disparo Outbound
*   **REQ-OPE-012**: O operador MUST poder redigir uma mensagem de texto simples e enviá-la através do campo de digitação e botão "Enviar" no chat ativo.
*   **REQ-OPE-013**: Quando o operador submete a mensagem, se o cliente correspondente possuir um número de telefone gravado em `clientes.telefone` que corresponda à restrição de Curitiba (`^55419[0-9]{8}$`), o sistema MUST invocar a função `enviarMensagemWhatsapp` sob o capô (passando o `conversaId` e o payload contendo o texto e `remetente = 'operador'`).
*   **REQ-OPE-014**: Se o envio via API do WhatsApp falhar por restrição de janela de 24 horas excedida, o sistema MUST retornar um aviso visível no chat e orientar o operador a enviar uma mensagem modelo (template homologado), bloqueando o envio de texto livre.
*   **REQ-OPE-015**: Se o cliente da conversa não possuir telefone cadastrado (atendimento exclusivamente web), o sistema MUST apenas inserir o registro na tabela `mensagens` com `remetente = 'operador'`, `conteudo` correspondente e `url_anexo = NULL`.

### 2.5 Interruptor Visual de IA (IA Manual Toggle)
*   **REQ-OPE-016**: O painel do chat ativo de uma conversa aberta ou em atendimento por IA MUST apresentar um interruptor visual (Switch/Toggle) identificando o estado do agente: "Sofía (IA)" (Ativo/Inativo).
*   **REQ-OPE-017**: A mudança de estado do interruptor MUST executar uma atualização na linha correspondente da tabela `conversas`:
    *   Ao **desativar** a IA (Toggle OFF): o sistema MUST atualizar `conversas.ia_ativa` para `false` e `conversas.status` para `'aberta'`.
    *   Ao **ativar** a IA (Toggle ON): o sistema MUST atualizar `conversas.ia_ativa` para `true` e `conversas.status` para `'ia_atendendo'`.
*   **REQ-OPE-018**: Esta alteração MUST ser persistida no banco de dados por meio de uma Server Action segura e propagada em tempo real para a listagem de conversas de todos os operadores conectados e para o portal do cliente.

### 2.6 Segurança e Políticas RLS (Row Level Security)
*   **REQ-OPE-019**: As políticas RLS para a tabela `conversas` MUST garantir que operadores (`admin`, `supervisor`, `vendedor`) tenham acesso completo de leitura (`SELECT`) e atualização (`UPDATE`) sobre todos os registros.
*   **REQ-OPE-020**: As políticas RLS para a tabela `mensagens` MUST garantir que operadores (`admin`, `supervisor`, `vendedor`) tenham acesso completo de leitura (`SELECT`) e inserção (`INSERT`) sobre todos os registros de mensagens.
*   **REQ-OPE-021**: Clientes autenticados no portal web SHALL NOT possuir qualquer permissão de gravação (`INSERT`, `UPDATE`, `DELETE`) que altere as colunas `ia_ativa` ou `status` na tabela `conversas`.
*   **REQ-OPE-022**: Clientes autenticados no portal web SHALL NOT possuir permissão para inserir mensagens na tabela `mensagens` cuja coluna `remetente` seja definida como `'operador'` ou `'ia'`.

### 2.7 Atalho de Retorno ao Painel Administrativo
*   **REQ-OPE-023**: O espaço de trabalho da fila de atendimento (chat do operador) em `/atendimento` MUST exibir um link ou botão de retorno ao painel administrativo.
*   **REQ-OPE-024**: O atalho para o painel administrativo em `/atendimento/admin` MUST ser exibido na interface apenas se o papel (`funcao`) do perfil do operador autenticado for `'admin'` ou `'supervisor'`.
*   **REQ-OPE-025**: Se o papel (`funcao`) do perfil do operador autenticado for `'vendedor'` ou `'cliente'`, o link/botão para `/atendimento/admin` SHALL NOT ser renderizado na interface.

---

## 3. Cenários de Aceitação (Gherkin - Given/When/Then)

### Cenário 1: Bloqueio de acesso de cliente ao painel do operador
*   **Given** que o usuário está autenticado no portal do cliente com o papel `'cliente'`.
*   **When** o usuário tenta acessar diretamente a URL `/atendimento` ou `/dashboard`.
*   **Then** o Middleware de segurança intercepta a requisição.
*   **And** redireciona o usuário para a página de login `/login` ou exibe a página `/403` de acesso proibido.

### Cenário 2: Visualização da listagem de conversas por operador ativo
*   **Given** que o operador com o papel `'vendedor'` está logado e acessa `/atendimento`.
*   **When** a página é carregada.
*   **Then** o sistema exibe a lista de conversas ativas no painel esquerdo.
*   **And** as conversas são ordenadas da mais recentemente modificada (`data_atualizacao` decrescente) para a mais antiga.
*   **And** cada cartão da conversa exibe o nome do cliente, o telefone Curitiba formatado, o snippet da última mensagem e o indicador de IA Ativa.

### Cenário 3: Filtragem de conversas por filas de atendimento
*   **Given** que o operador está visualizando o painel `/atendimento` que possui 3 conversas na fila IA (onde `ia_ativa = true`) e 2 na fila humana (onde `ia_ativa = false`).
*   **When** o operador clica na aba "Fila Humana".
*   **Then** a listagem atualiza para exibir apenas as 2 conversas onde `ia_ativa = false` e `status = 'aberta'`.
*   **When** o operador clica na aba "Fila IA".
*   **Then** a listagem atualiza para exibir apenas as 3 conversas onde `ia_ativa = true`.

### Cenário 4: Atualização dinâmica da fila por nova mensagem (Tempo Real)
*   **Given** que o operador está com o painel `/atendimento` aberto na aba "Fila IA", e a conversa com o cliente "Carlos" está na 5ª posição da lista.
*   **When** o cliente "Carlos" envia uma nova mensagem que é inserida no banco de dados.
*   **Then** o trigger do banco atualiza a coluna `data_atualizacao` da conversa associada.
*   **And** a subscrição Supabase Realtime notifica a interface do operador.
*   **And** a conversa com o cliente "Carlos" é movida automaticamente para a 1ª posição da listagem.
*   **And** o snippet do cartão é atualizado com o texto da nova mensagem.

### Cenário 5: Transmissão e visualização de mensagens no chat ativo (Tempo Real)
*   **Given** que o operador está com a conversa do cliente "Mariana" (ID `uuid-conversa-mariana`) selecionada no painel direito.
*   **When** uma nova mensagem do cliente "Mariana" chega via webhook do WhatsApp e é inserida na tabela `mensagens`.
*   **Then** o Supabase Realtime transmite a inserção para a interface do chat aberto.
*   **And** a mensagem é renderizada instantaneamente no lado esquerdo do histórico.
*   **And** a janela de mensagens rola automaticamente até o rodapé para manter a mensagem visível.

### Cenário 6: Envio de mensagem pelo operador para cliente com telefone validado
*   **Given** que o operador está com o chat aberto do cliente "Mariana" que tem o telefone validado `5541999998888`.
*   **And** a janela de 24 horas do WhatsApp está ativa (o cliente enviou mensagem há menos de 24 horas).
*   **When** o operador digita "Olá Mariana, seu pedido está pronto!" no campo de texto e clica em "Enviar".
*   **Then** o sistema aciona a Server Action que chama a função `enviarMensagemWhatsapp(conversaId, { texto: "Olá Mariana, seu pedido está pronto!", remetente: 'operador' })`.
*   **And** a mensagem é disparada via Meta WhatsApp API e gravada na tabela `mensagens` com `remetente = 'operador'`.
*   **And** a interface exibe a mensagem enviada do lado direito alinhada com as cores de destaque da churrascaria.

### Cenário 7: Bloqueio de envio de texto livre fora da janela de 24 horas (Outbound)
*   **Given** que a última mensagem do cliente na conversa ocorreu há 30 horas (janela de 24 horas excedida).
*   **When** o operador tenta enviar uma mensagem de texto livre "Olá, tudo bem?".
*   **Then** o sistema detecta que a janela de 24 horas expirou na função `enviarMensagemWhatsapp`.
*   **And** bloqueia a gravação da mensagem e o disparo da API.
*   **And** a interface do operador exibe um alerta de erro: "Não é possível enviar mensagem de texto livre. A janela de 24 horas expirou. Envie um template homologado para reabrir a conversa."

### Cenário 8: Desativação manual da IA pelo operador (Handoff Humano)
*   **Given** que o operador está visualizando a conversa de "João" onde a IA está ativa (`ia_ativa = true`, `status = 'ia_atendendo'`).
*   **When** o operador clica no interruptor visual (Switch) para desativar a IA.
*   **Then** o interface executa a Server Action que atualiza a conversa no Supabase para `ia_ativa = false` e `status = 'aberta'`.
*   **And** o interruptor é atualizado visualmente para o estado desligado.
*   **And** a conversa sai da aba "Fila IA" e aparece na aba "Fila Humana" na listagem de conversas.
*   **And** no portal do cliente, o cabeçalho do chat muda em tempo real para "Atendente Humano".

### Cenário 9: Reativação manual da IA pelo operador
*   **Given** que o operador terminou o atendimento humano e quer devolver o controle à IA (`ia_ativa = false`, `status = 'aberta'`).
*   **When** o operador clica no interruptor visual para ligar a IA.
*   **Then** o sistema executa a atualização no banco definindo `ia_ativa = true` e `status = 'ia_atendendo'`.
*   **And** a conversa retorna para a "Fila IA".
*   **And** no portal do cliente, o cabeçalho exibe "Sofia (IA)" com indicador verde ativo.

### Cenário 10: Bloqueio de modificação de controle da IA por cliente via API (Segurança RLS)
*   **Given** que o cliente está autenticado e tenta burlar o frontend enviando uma requisição de atualização direta na tabela `conversas` definindo `ia_ativa = false` ou `status = 'aberta'`.
*   **When** a transação é submetida ao Supabase.
*   **Then** o banco de dados bloqueia a operação devido à política RLS que proíbe atualizações em `conversas` por perfis com função `'cliente'`.
*   **And** o estado da conversa permanece inalterado.

### Cenário 11: Visualização do atalho de retorno para operador com perfil de administrador ou supervisor
*   **Given** que o usuário está autenticado e acessa a fila de chat em `/atendimento`,
*   **And** o perfil do usuário possui a função `funcao = 'admin'` ou `funcao = 'supervisor'`,
*   **When** a interface da fila de chat é renderizada,
*   **Then** o sistema exibe o link de atalho rotulado como "Painel Administrativo",
*   **And** clicar neste atalho direciona o usuário com sucesso para a rota `/atendimento/admin`.

### Cenário 12: Ocultação do atalho de retorno para operador com perfil de vendedor
*   **Given** que o usuário está autenticado e acessa a fila de chat em `/atendimento`,
*   **And** o perfil do usuário possui a função `funcao = 'vendedor'`,
*   **When** a interface da fila de chat é renderizada,
*   **Then** o sistema oculta e não renderiza o link de atalho para o painel administrativo `/atendimento/admin`.

---

## Requirements added by `atendimento-global-sofia-status-control`

### Requirement: Global Sofia controls by channel

The `/atendimento` interface MUST expose two independent global Sofia controls, one for WhatsApp and one for Telegram.

Each control MUST switch only between globally enabled and globally off. The yellow business-hours paused state MUST be derived from the schedule module, not manually selected by the control.

#### Scenario: Independent control per channel
- GIVEN an operator is viewing `/atendimento`
- WHEN the WhatsApp control is turned off and the Telegram control remains on
- THEN WhatsApp and Telegram MUST keep independent global states
- AND changing one control MUST NOT change the other

#### Scenario: Global off overrides local awake state
- GIVEN a conversation is marked awake for a client or conversation
- AND the channel global state is off
- WHEN the webhook or UI evaluates Sofia availability
- THEN the global off state MUST take priority over the awake state
- AND Sofia MUST remain blocked for that channel

### Requirement: Channel status bar

The `/atendimento` status bar MUST show the current state for each channel with the following visual semantics:
- green for operational
- yellow for business-hours paused or out-of-hours programmed message only
- red for globally off

The status bar MUST be channel-specific and MUST make the current state unambiguous.

#### Scenario: Green operational state
- GIVEN a channel is enabled and available for Sofia automation
- WHEN the status bar is rendered
- THEN the channel MUST appear green
- AND the label MUST indicate operational status

#### Scenario: Yellow paused state
- GIVEN a channel is globally enabled but outside business hours or paused by the schedule module
- WHEN the status bar is rendered
- THEN the channel MUST appear yellow
- AND the label MUST indicate that only the programmed schedule message is allowed

#### Scenario: Red globally off state
- GIVEN a channel is globally disabled
- WHEN the status bar is rendered
- THEN the channel MUST appear red
- AND the label MUST indicate that Sofia is globally off

### Requirement: LLM credits indicator

The `/atendimento` interface MUST display an LLM credits indicator for the active Sofia provider/model.

The indicator MUST show the remaining credit as a USD value, MUST refresh at least every 30 minutes, and MUST use the following color mapping:
- green when remaining value is greater than 2 USD
- yellow when remaining value is greater than 1 USD and less than or equal to 2 USD
- red when remaining value is less than 1 USD

If the provider is unavailable or the balance cannot be refreshed, the indicator MUST enter a stale or unknown state instead of showing a misleading numeric value.

#### Scenario: Credits in green range
- GIVEN the provider reports 2.01 USD remaining
- WHEN the indicator is rendered
- THEN the value MUST be shown in USD
- AND the indicator MUST be green

#### Scenario: Credits in yellow and red ranges
- GIVEN the provider reports 1.50 USD remaining
- WHEN the indicator is rendered
- THEN the indicator MUST be yellow
- GIVEN the provider reports 0.75 USD remaining
- WHEN the indicator is rendered
- THEN the indicator MUST be red

#### Scenario: Provider unavailable
- GIVEN the provider cannot be reached during refresh
- WHEN the indicator is updated
- THEN the UI MUST show a stale or unknown state
- AND the last known numeric balance MUST NOT be presented as current
