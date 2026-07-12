# Desenho Técnico: Módulo Chat do Cliente

**ID da Mudança:** `cliente-chat-modulo`  
**Status:** `Em Proposta`  

---

## 1. Decisões de Arquitetura

| Decisão | Escolha | Alternativas Consideradas | Racional |
| :--- | :--- | :--- | :--- |
| **Nesting do Layout do Cliente** | Next.js Nested Layout em `src/app/cliente/layout.tsx` | Layouts separados por página | Evita duplicação de cabeçalho, elimina piscadas de página (layout shifting), e centraliza a verificação de telefone autenticado. |
| **Interface do Catálogo no Chat** | Painel lateral (Desktop) / Painel inferior retrátil (Mobile) | Janela modal ou comando inline | Mantém a conversa em foco enquanto exibe o catálogo. Suporta arrastar e soltar (UX imersiva). |
| **Mobile Fallback** | Evento de toque (`onClick`) | Sem suporte a produtos no mobile | Telas de toque não possuem arrastar-e-soltar nativo prático. O clique simula a ação de forma natural. |
| **Visualização de Canais** | Badges/Ícones discretos com base em `whatsapp_mensagem_id` / `telegram_mensagem_id` | Rótulos de metadados extensos | Otimiza espaço no balão de fala mantendo o foco na leitura da conversa. |

---

## 2. Fluxo de Dados

O diagrama abaixo ilustra o ciclo de vida da seleção de produtos via Drag & Drop ou clique, e o processamento assíncrono pela IA Sofía:

```
[Card de Produto] ───(Drag / Clique)───→ [ChatContainer (State)]
                                                │
                                        (Inserir Mensagem)
                                                ▼
[Sub Realtime] ←────(Notificação)─────── [Supabase DB]
      │                                         ▲
(Renderizar Msg)                        (Inserir Resposta)
      │                                         │
      └──────→ [processarIaChat (Action)] ──────┘
```

---

## 3. Alterações de Arquivos

| Arquivo | Ação | Descrição |
| :--- | :--- | :--- |
| `src/app/cliente/layout.tsx` | Criar | Layout aninhado de cliente. Valida a verificação do telefone e renderiza header, abas (Chat e Perfil) e botão de LogOut. |
| `src/app/cliente/page.tsx` | Criar | Página de entrada da rota `/cliente` que redireciona para `/cliente/chat` via Next.js `redirect()`. |
| `src/app/cliente/perfil/page.tsx` | Criar | Nova página de perfil (código migrado de `configuracoes/page.tsx`). |
| `src/app/cliente/configuracoes/page.tsx` | Excluir | Removido em favor de `perfil/page.tsx`. |
| `src/app/cliente/chat/page.tsx` | Modificar | Consulta produtos disponíveis via RPC `buscar_produtos_disponiveis` e injeta-os como propriedade no `ChatContainer`. |
| `src/components/chat/ChatContainer.tsx` | Modificar | Integra o drop zone HTML5 (`onDragOver`, `onDrop`), painel lateral de catálogo, badges de origem da mensagem e alinhamento neutro para IA/Operador. |
| `src/app/login/page.tsx` | Modificar | Atualiza redirecionamento pós-login de `/cliente/configuracoes` para `/cliente/perfil`. |
| `src/app/cliente/verificar-telefone/page.tsx` | Modificar | Atualiza redirecionamento pós-verificação de `/cliente/configuracoes` para `/cliente/perfil`. |
| `src/app/verificar-email/VerificarEmailClient.tsx` | Modificar | Atualiza redirecionamento padrão de `/cliente/configuracoes` para `/cliente/perfil`. |

---

## 4. Estrutura de UI e Componentes

### 4.1 Layout Compartilhado (`layout.tsx`)
- Executa a validação server-side com Supabase para garantir que o cliente está logado e verificado (via tabela `clientes`).
- Exibe o cabeçalho "Asados Sofía" e abas de navegação usando o componente `Link` do Next.js:
  - **Chat:** Direciona para `/cliente/chat`
  - **Perfil:** Direciona para `/cliente/perfil`
- Fornece botão de "Sair" centralizado.

### 4.2 Indicadores de Origem e Alinhamento no Chat
- **Alinhamento:**
  - Mensagens do `cliente`: Alinhadas à direita.
  - Mensagens de `ia` / `operador`: Alinhamento à esquerda (neutro).
- **Badges de Canal (Mensagens do Cliente):**
  - Se `whatsapp_mensagem_id` estiver presente: Badge verde ou ícone do WhatsApp.
  - Se `telegram_mensagem_id` estiver presente: Badge azul ou ícone do Telegram.
  - Se não houver IDs de canal externo: Badge cinza indicando "Web".
- **Identificação do Remetente:**
  - Se `remetente === 'ia'`: Exibe o nome "Sofia (IA)" com tema laranja/vermelho.
  - Se `remetente === 'operador'`: Exibe o nome "Atendente" com tema azul.

### 4.3 Sidebar de Catálogo com Drag & Drop
- **Query:** Invoca `buscar_produtos_disponiveis` no Server Component de Chat e passa o array de produtos ativos/em estoque.
- **Painel Lateral:** Exibe os produtos com imagem, nome e preço formatado (`preco_centavos / 100`).
- **Drag & Drop:**
  - Cartão do Produto: Configurado com `draggable="true"` e `onDragStart` salvando o JSON `{ id, nome }` em `dataTransfer`.
  - Dropzone (Chat History): Eventos `onDragOver` (prevent default) e `onDrop`.
- **Comportamento no Drop / Clique:**
  1. Insere mensagem do usuário: `"Quero adicionar [Nome do Produto] ao meu pedido."` na tabela `mensagens`.
  2. Atualiza o estado de mensagens do chat em tempo real.
  3. Dispara chamada assíncrona ao Server Action `processarIaChat(conversa.id, mensagem)` sem bloquear a UI.

---

## 5. Estratégia de Testes

| Camada | Escopo de Teste | Abordagem |
| :--- | :--- | :--- |
| **Integração** | Fluxo de Verificação | Garantir que usuários sem registro em `clientes` sejam barrados de acessar `/cliente/chat` e direcionados a `/cliente/verificar-telefone`. |
| **Componentes (UI)** | Drag & Drop | Simular o drop de dados no ChatContainer e verificar a adição de mensagem correta no feed. |
| **Componentes (UI)** | Fallback Mobile | Verificar se o clique em um produto envia a mensagem e chama `processarIaChat` corretamente. |
| **Integração** | Badges de Mensagens | Validar renderização de badges correspondentes com presença/ausência de `whatsapp_mensagem_id` e `telegram_mensagem_id`. |
