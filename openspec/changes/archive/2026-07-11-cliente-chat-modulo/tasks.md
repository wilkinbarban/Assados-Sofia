# Task Breakdown: Módulo Chat do Cliente

**ID da Mudança:** `cliente-chat-modulo`
**Status:** `Planejado`

---

## Review Workload Forecast

| Métrica | Valor |
|---|---|
| Linhas estimadas | 450-600 |
| Budget de 400 linhas | ❌ Excedido |
| **Chained PRs recomendados** | ✅ Sim |
| Estratégia sugerida | PR 1 (Fundação) → PR 2 (Interface Core Chat) → PR 3 (Integração e Testes) |
| Delivery strategy | `ask-on-risk` |
| Chain strategy | `stacked-to-main` |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units
| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Reorganizar layout do cliente e perfil | PR 1 | [layout.tsx](file:///home/wilkin/proyectos/Asados/src/app/cliente/layout.tsx), [page.tsx](file:///home/wilkin/proyectos/Asados/src/app/cliente/perfil/page.tsx), redirecionamentos |
| 2 | Atualização da interface de chat core | PR 2 | Alinhamento e badges em [ChatContainer.tsx](file:///home/wilkin/proyectos/Asados/src/components/chat/ChatContainer.tsx) |
| 3 | Catálogo, drag & drop e testes | PR 3 | Sidebar, eventos de drop, RPC [chat/page.tsx](file:///home/wilkin/proyectos/Asados/src/app/cliente/chat/page.tsx), testes |

---

## Phase 1: Foundation

- [x] 1.1 Criar o [layout.tsx](file:///home/wilkin/proyectos/Asados/src/app/cliente/layout.tsx) com verificação de login, abas (Chat/Perfil) e logout.
- [x] 1.2 Criar a página [page.tsx](file:///home/wilkin/proyectos/Asados/src/app/cliente/page.tsx) com redirect de `/cliente` para `/cliente/chat`.
- [x] 1.3 Migrar lógica de perfil de [page.tsx](file:///home/wilkin/proyectos/Asados/src/app/cliente/configuracoes/page.tsx) para [page.tsx](file:///home/wilkin/proyectos/Asados/src/app/cliente/perfil/page.tsx).
- [x] 1.4 Excluir a página obsoleta [page.tsx](file:///home/wilkin/proyectos/Asados/src/app/cliente/configuracoes/page.tsx).
- [x] 1.5 Atualizar links para `/cliente/perfil` in [page.tsx](file:///home/wilkin/proyectos/Asados/src/app/login/page.tsx), [page.tsx](file:///home/wilkin/proyectos/Asados/src/app/cliente/verificar-telefone/page.tsx) e [VerificarEmailClient.tsx](file:///home/wilkin/proyectos/Asados/src/app/verificar-email/VerificarEmailClient.tsx).

## Phase 2: Core Implementation

- [x] 2.1 Ajustar alinhamento no [ChatContainer.tsx](file:///home/wilkin/proyectos/Asados/src/components/chat/ChatContainer.tsx) (mensagens do cliente à direita; IA/atendente à esquerda).
- [x] 2.2 Adicionar badges de canal (WhatsApp, Telegram ou Web) baseados nos IDs das mensagens em [ChatContainer.tsx](file:///home/wilkin/proyectos/Asados/src/components/chat/ChatContainer.tsx).
- [x] 2.3 Exibir identificadores "Sofia (IA)" (laranja) e "Atendente" (azul) baseados no remetente em [ChatContainer.tsx](file:///home/wilkin/proyectos/Asados/src/components/chat/ChatContainer.tsx).
- [x] 2.4 Renderizar o markup inicial da sidebar com imagem, nome e preço em [ChatContainer.tsx](file:///home/wilkin/proyectos/Asados/src/components/chat/ChatContainer.tsx).

## Phase 3: Integration

- [x] 3.1 Chamar `buscar_produtos_disponiveis` em [page.tsx](file:///home/wilkin/proyectos/Asados/src/app/cliente/chat/page.tsx) e passar dados para `ChatContainer`.
- [x] 3.2 Implementar handlers HTML5 Drag & Drop (`onDragStart`, `onDragOver`, `onDrop`) nos cards de produtos em [ChatContainer.tsx](file:///home/wilkin/proyectos/Asados/src/components/chat/ChatContainer.tsx).
- [x] 3.3 Adicionar fallback para dispositivos móveis (`onClick` nos cards de produtos) em [ChatContainer.tsx](file:///home/wilkin/proyectos/Asados/src/components/chat/ChatContainer.tsx).
- [x] 3.4 Conectar o drop/clique de produtos com o envio de mensagem e chamada assíncrona da action `processarIaChat`.

## Phase 4: Testing & Verification

- [x] 4.1 Criar testes de integração para validar se usuários sem telefone verificado são redirecionados para `/cliente/verificar-telefone`.
- [x] 4.2 Criar testes unitários para verificar se o drag-and-drop e cliques simulam o envio de mensagens corretamente.
- [x] 4.3 Criar testes de UI para validar badges de canal e alinhamento de mensagens com e sem IDs externos.
