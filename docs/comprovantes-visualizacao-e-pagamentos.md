# Módulo de Comprovantes, Visualização de Pagamentos e Integração no Chat

## 1. Visão Geral

Este documento descreve as melhorias implementadas na gestão e visualização de comprovantes de pagamento e documentos fiscais na Casa de Assados Sofia, abrangendo tanto a área de atendimento/admin quanto a área do cliente web.

---

## 2. Componentes e Arquitetura

### 2.1 Modal de Visualização de Comprovantes (`ModalVisualizadorComprovante.tsx`)
- **Exibição como Imagem**: Para evitar tentativas de download automático indesejado disparadas por navegadores ao lidar com PDFs nativos, o visualizador renderiza estritamente uma imagem em alta definição (`<img>`).
- **Comprovantes de Venda / 2ª Via**: Consomem a rota `/api/receipts/[id]/png` com formatação térmica vetorial instantânea.
- **Arquivos PDF Externos / Anexos de Chat**: Rasterizados no cliente através do motor PDF.js com Worker instanciado via Blob em memória (`URL.createObjectURL(new Blob([...]))`), contornando restrições de Same-Origin Policy / CORS dos navegadores.
- **Recursos Interativos**:
  - Controles de zoom in (+), zoom out (-) e redefinição (100%).
  - Paginação para documentos com múltiplas páginas.
  - Ações de **Imprimir**, **Abrir PNG em Nova Aba** e **Baixar PDF Original**.

### 2.2 Endpoint de Comprovante em Imagem (`/api/receipts/[id]/png`)
- Rota autenticada do Next.js que gera a representação visual (SVG/imagem) do comprovante térmico de 80mm com base no snapshot imutável da tabela `comprovantes_venda`.
- Permite acesso tanto para operadores (admin, supervisor, vendedor) quanto para o cliente titular do pedido (`via=cliente`).

### 2.3 Integração de Pagamento no Chat do Cliente (`ChatContainer.tsx`)
- Integrado o modal de pagamento Pix / Cartão (`ModalPagamentoCliente`) diretamente nas abas de pedidos do Chat Web:
  - **Banner superior**: Notifica sobre pedidos pendentes com botão direto para "Pagar Pedido".
  - **Sidebar lateral (Desktop)** e **Drawer (Mobile)**: Listam pedidos ativos com status em tempo real, QR Code Pix dinâmico, código Copia e Cola e visualizador de comprovante após aprovação.

---

## 3. Segurança e Conformidade

1. **Validação de Telefones de Curitiba**:
   - Padrão `55419XXXXXXXX` verificado tanto no frontend quanto nas restrições de banco de dados (`chk_telefone_curitiba`).
2. **Autorização e RLS**:
   - Acesso a comprovantes restrito aos operadores e ao cliente autenticado proprietário do pedido.
3. **Isolamento de PII**:
   - Dados sensíveis preservados em variáveis de ambiente `.env` e snapshots controlados.
