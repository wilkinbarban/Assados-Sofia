# Especificação: Módulos Horário do Atendimento + Estoque

**ID da Mudança:** `estoque-horarios`  
**Status:** `Arquivado` | **Arquivado em:** 2026-07-07  

---

## Módulo 1: Horário do Atendimento

### Spec H1: Definição de Horários
**Critérios de aceitação:**
- [ ] Admin pode definir horário de abertura e fechamento para cada dia da semana (0-6)
- [ ] Cada dia tem toggle ativo/inativo independente
- [ ] Horários são salvos na tabela `horarios_atendimento`
- [ ] UI mostra 7 cards (Dom a Sáb) com seletor de hora e toggle
- [ ] Alterações são auditadas em `logs_auditoria`

### Spec H2: Mensagem Fora de Horário
**Critérios de aceitação:**
- [ ] Admin pode editar a mensagem de fora de horário via `configuracoes_sistema` (chave `MENSAGEM_FORA_HORARIO`)
- [ ] Placeholder `{dias_semana}` é substituído pela lista de dias ativos (ex: "sábado e domingo")
- [ ] Placeholder `{horario_inicio}` e `{horario_fim}` são preenchidos automaticamente
- [ ] Mensagem é fixa, amigável, em português
- [ ] Preview em tempo real na UI

### Spec H3: Verificação Automática de Horário
**Critérios de aceitação:**
- [ ] Todos os webhooks (Telegram, Evolution/WhatsApp) verificam horário antes de processar
- [ ] Chat web (`processarIaChat`) verifica horário antes do RAG
- [ ] Se fora do horário: envia MENSAGEM_FORA_HORARIO e NÃO dispara LLM
- [ ] Se dentro do horário: fluxo normal (RAG pipeline)
- [ ] Verificação consome 0 tokens do LLM
- [ ] Função `verificarHorarioAtendimento()` retorna `{ dentro: boolean, mensagem?: string }`

### Spec H4: Resposta Fora de Horário por Canal
**Critérios de aceitação:**
- [ ] WhatsApp: envia mensagem de texto via Evolution API
- [ ] Telegram: envia mensagem via Bot API
- [ ] Chat Web: retorna mensagem no response da server action
- [ ] Mensagem é IDÊNTICA em todos os canais

---

## Módulo 2: Estoque

### Spec E1: Extensão da Tabela `produtos`
**Critérios de aceitação:**
- [ ] Coluna `quantidade_estoque` (INTEGER, DEFAULT 0, CHECK >= 0)
- [ ] Coluna `estoque_minimo` (INTEGER, DEFAULT 5, CHECK >= 0)
- [ ] Coluna `controlar_estoque` (BOOLEAN, DEFAULT TRUE)
- [ ] Coluna `url_imagem_thumb` (TEXT) — thumbnail 300px
- [ ] Coluna `url_imagem_2` (TEXT) — segunda foto full
- [ ] Coluna `url_imagem_2_thumb` (TEXT) — segunda foto thumbnail
- [ ] Migração não quebra dados existentes (usa DEFAULTs)

### Spec E2: CRUD de Produtos com Estoque
**Critérios de aceitação:**
- [ ] Criar produto: nome (obrigatório), descrição, preço (obrigatório, centavos), quantidade inicial, estoque mínimo
- [ ] Editar produto: todos os campos editáveis
- [ ] Excluir produto: cascade — remove fotos do bucket, movimentações, itens de pedidos associados
- [ ] Toggle ativar/desativar produto
- [ ] Desabilitar automaticamente quando `quantidade_estoque = 0` E `controlar_estoque = TRUE`
- [ ] Validação zod em todas as operações

### Spec E3: Upload de Imagens
**Critérios de aceitação:**
- [ ] Aceitar apenas JPEG, PNG, WebP (validar MIME type + extensão)
- [ ] Máximo 10MB por arquivo
- [ ] Máximo 2 fotos por produto
- [ ] Processar com `sharp`: gerar thumb (300px) e full (800px) em WebP
- [ ] Upload para bucket `produto-imagens` (privado)
- [ ] Excluir fotos do bucket ao remover produto ou trocar imagem
- [ ] Preview na UI antes de salvar

### Spec E4: Movimentações de Estoque
**Critérios de aceitação:**
- [ ] Tabela `movimentacoes_estoque` registra toda alteração de quantidade
- [ ] Tipos: `entrada`, `saida`, `ajuste`, `cancelamento`
- [ ] Registra: quantidade anterior, nova quantidade, motivo, usuário, pedido (se aplicável)
- [ ] Histórico visível na UI por produto

### Spec E5: Integração com Vendas
**Critérios de aceitação:**
- [ ] Ao confirmar pedido (`status = 'confirmado'`), reduzir estoque de cada item
- [ ] Registrar movimentação tipo `saida` para cada produto
- [ ] Se `quantidade_estoque <= 0`, desabilitar produto (`ativo = FALSE`)
- [ ] Ao cancelar pedido, restaurar estoque (movimentação tipo `cancelamento`)

### Spec E6: Integração com Sofía
**Critérios de aceitação:**
- [ ] RPC `buscar_produtos_disponiveis()` — retorna produtos ativos com estoque > 0
- [ ] RPC `buscar_produto_por_nome(nome TEXT)` — busca textual
- [ ] Sofía pode listar cardápio, informar preços, verificar disponibilidade
- [ ] Sofía NUNCA confirma pedido automaticamente — sempre pergunta ao operador
- [ ] Sofía informa "indisponível temporariamente" para produtos desabilitados
- [ ] Sofía sugere ofertas e complementos de forma natural

### Spec E7: UI do Dashboard
**Critérios de aceitação:**
- [ ] Nova aba "Estoque" no AdminDashboard
- [ ] Tabela de produtos: nome, preço (formatado R$), estoque, status (badge), ações
- [ ] Modal criar/editar com upload de imagem (drag & drop)
- [ ] Botões +/- para ajuste rápido de estoque
- [ ] Filtros: ativos / esgotados / todos
- [ ] Histórico de movimentações abaixo da tabela
