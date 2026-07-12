# Especificação de Requisitos: Catálogo Drag and Drop (client-drag-drop-menu)

**ID da Mudança:** `cliente-chat-modulo`  
**Domínio:** `client-drag-drop-menu`  
**Status:** `Pendente de Revisão`  

---

## 1. Descrição Executiva
Esta especificação detalha o painel lateral do catálogo de produtos para os clientes finais, permitindo que visualizem os produtos e seus detalhes (nome, preço, fotos) e usem a funcionalidade de arrastar e soltar (ou toque direto no celular) para enviar o produto à conversa do chat.

---

## 2. Requisitos de Sistema (RFC 2119)
*   **REQ-DDMENU-001**: O painel lateral do catálogo MUST exibir uma listagem plana de produtos ativos, contendo imagem/foto, nome e preço em centavos formatado.
*   **REQ-DDMENU-002**: Os cards de produtos no painel MUST suportar arrastar e soltar (HTML5 Drag and Drop) em direção à área de chat.
*   **REQ-DDMENU-003**: A área de chat MUST atuar como drop zone, identificando o produto arrastado e disparando a intenção de pedido via `processarIaChat`.
*   **REQ-DDMENU-004**: No ambiente móvel ou como fallback, os cards de produto MUST suportar clique ou toque direto (tap-to-add) para adicionar o item ao chat sem arrastar.

---

## 3. Cenários de Aceitação (Gherkin)

### Cenário: Adicionar produto via arrastar e soltar (Desktop)
*   **Given** que o cliente está logado no portal e o catálogo lateral de produtos está carregado.
*   **When** o cliente arrasta o card do produto "Picanha" e o solta na área de mensagens do chat.
*   **Then** a interface captura o evento de drop do produto.
*   **And** envia uma mensagem de intenção de pedido do item correspondente à Sofía.

### Cenário: Adicionar produto via clique direto (Mobile/Fallback)
*   **Given** que o cliente está visualizando o catálogo em um celular.
*   **When** o cliente toca no botão/card do produto "Costela".
*   **Then** o sistema adiciona o item ao input do chat e envia a mensagem para disparar a intenção do pedido.
