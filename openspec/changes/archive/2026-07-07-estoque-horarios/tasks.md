# Task Breakdown: Módulos Horário do Atendimento + Estoque

**ID da Mudança:** `estoque-horarios`  
**Status:** `Arquivado` | **Arquivado em:** 2026-07-07  

---

## 1. Estimativa e Workload Budget

| Métrica | Valor |
|---|---|
| Linhas estimadas | ~1150 |
| Budget de 400 linhas | ❌ Excedido |
| **Chained PRs recomendados** | ✅ Sim (3 PRs) |
| Estratégia | `ask-on-risk` → 3 PRs encadeados |

---

## 2. Estratégia de PRs Encadeados

```
PR #1 (base)        PR #2 (UI)         PR #3 (integração)
┌──────────┐      ┌──────────┐       ┌──────────┐
│ Migração │ ───→ │ UI Admin │ ────→ │ Sofía +  │
│ + Actions│      │ Dashboard│       │ Webhooks │
└──────────┘      └──────────┘       └──────────┘
   ~400 lin          ~450 lin           ~300 lin
```

**Chain strategy:** `stacked-to-main` — cada PR mergeia em main em ordem.

---

## 3. PR #1: Migração SQL + Server Actions (~400 linhas)

### Work Unit 1.1: Migração do Banco de Dados
- [x] Criar arquivo `supabase/migrations/YYYYMMDD_estoque_horarios.sql`
- [x] Tabela `horarios_atendimento` (id, dia_semana, hora_abertura, hora_fechamento, ativo)
- [x] Trigger auto-update `data_atualizacao`
- [x] RLS: leitura pública, escrita admin/supervisor
- [x] ALTER TABLE `produtos`: +6 colunas (quantidade_estoque, estoque_minimo, controlar_estoque, url_imagem_thumb, url_imagem_2, url_imagem_2_thumb)
- [x] ENUM `tipo_movimentacao` + tabela `movimentacoes_estoque`
- [x] RLS `movimentacoes_estoque`: leitura/escrita operadores
- [x] Bucket `produto-imagens` + RLS policies
- [x] RPC `buscar_produtos_disponiveis()`
- [x] RPC `buscar_produto_por_nome(nome TEXT)`
- [x] Inserir config default `MENSAGEM_FORA_HORARIO` em `configuracoes_sistema`
- [x] Push migration: `npx supabase db push --linked`

### Work Unit 1.2: Server Actions — Horários
- [x] Criar `src/app/actions/horarios.ts`
- [x] `salvarHorarioDia(dia_semana, hora_abertura, hora_fechamento, ativo)` — upsert
- [x] `listarHorarios()` — retorna todos os 7 dias (com defaults para dias não configurados)
- [x] `salvarMensagemForaHorario(mensagem)` — upsert em configuracoes_sistema
- [x] `obterMensagemForaHorario()` — retorna a mensagem formatada com horários
- [x] Validação zod: hora_abertura < hora_fechamento, dia_semana 0-6
- [x] Permissão: admin/supervisor
- [x] Auditoria em `logs_auditoria`

### Work Unit 1.3: Server Actions — Estoque (Produtos)
- [x] Criar `src/app/actions/estoque.ts`
- [x] `criarProduto(data)` — com quantidade_estoque, estoque_minimo, preco_centavos
- [x] `atualizarProduto(id, data)` — atualiza campos do produto
- [x] `alternarStatusProduto(id)` — toggle ativo (já existe, estender)
- [x] `excluirProduto(id)` — cascade: remove fotos do bucket, movimentações, atualiza itens_pedido
- [x] `ajustarEstoque(produto_id, quantidade, tipo, motivo)` — atualiza quantidade + registra movimentação
- [x] `listarMovimentacoes(produto_id)` — histórico de movimentações
- [x] Validação zod para todos os inputs
- [x] Verificação: se controlar_estoque AND quantidade_estoque <= 0 → ativo = false

### Work Unit 1.4: Server Actions — Imagens
- [x] `uploadImagemProduto(produto_id, file: File, index: 1|2)`
- [x] Validação: tipo MIME (image/jpeg, image/png, image/webp), tamanho ≤ 10MB
- [x] Processamento com `sharp`: gerar full (800px) e thumb (300px) em WebP
- [x] Upload para bucket `produto-imagens`
- [x] Atualizar `produtos.url_imagem` / `url_imagem_2` + thumbs
- [x] `removerImagemProduto(produto_id, index: 1|2)` — remove do bucket + limpa URL

### Work Unit 1.5: Lib — Verificação de Horário
- [x] Criar `src/lib/horarios/verificar.ts`
- [x] `verificarHorarioAtendimento()` — retorna `{ dentro, mensagem? }`
- [x] `gerarMensagemForaHorario(supabase)` — busca config, formata com horários
- [x] Formatação de dias: "sábado e domingo", "segunda a sexta", etc.

---

## 4. PR #2: UI Dashboard (~450 linhas)

### Work Unit 2.1: Componente BusinessHoursManager
- [x] Criar `src/components/operator/BusinessHoursManager.tsx`
- [x] 'use client' — estado local com 7 cards (Dom a Sáb)
- [x] Cada card: toggle ativo/inativo, input hora abertura, input hora fechamento
- [x] Ao alterar qualquer campo → salvar via server action
- [x] Indicador visual de salvamento (loading + check)
- [x] Textarea para `MENSAGEM_FORA_HORARIO`
- [x] Preview em tempo real com placeholders substituídos

### Work Unit 2.2: Componente InventoryManager
- [x] Criar `src/components/operator/InventoryManager.tsx`
- [x] 'use client' — estado local com lista de produtos
- [x] Tabela: nome, preço (formatado R$), estoque (com cor: verde/amarelo/vermelho), status badge, ações
- [x] Botão "+ Novo Produto" → abre modal de criação
- [x] Modal Criar/Editar com:
  - Campos: nome*, descrição, preço*, quantidade inicial, estoque mínimo
  - Upload de imagem: drag & drop, preview, validação, indicador de progresso
  - Toggle "Controlar estoque"
- [x] Botões +/- na coluna de estoque para ajuste rápido
- [x] Filtros: Todos / Ativos / Esgotados
- [x] Tabela de histórico de movimentações abaixo (com paginação simples)

### Work Unit 2.3: Integração no AdminDashboard
- [x] Adicionar `'horarios'` e `'estoque'` ao tipo `TabType`
- [x] Adicionar itens na sidebar: ícone Clock para Horários, Package para Estoque
- [x] Renderizar `<BusinessHoursManager>` na tab 'horarios'
- [x] Renderizar `<InventoryManager>` na tab 'estoque'
- [x] Ajustar layout para novos componentes (scroll, altura)

---

## 5. PR #3: Integração Sofía + Webhooks (~300 linhas)

### Work Unit 3.1: Verificação de Horário nos Webhooks
- [x] Modificar `src/app/api/webhooks/telegram/route.ts`:
  - Antes do processamento → `verificarHorarioAtendimento()`
  - Se fora do horário → enviar mensagem direta, retornar ok, NÃO disparar RAG
- [x] Modificar `src/app/api/webhooks/evolution/route.ts`:
  - Mesmo padrão do Telegram
- [x] Modificar `src/app/actions/chat.ts` (`processarIaChat`):
  - Mesmo padrão para o chat web

### Work Unit 3.2: Integração de Estoque nas Vendas
- [x] Modificar `src/app/actions/pedidos.ts` (`confirmarPedidoOperador`):
  - Após confirmar pedido, iterar itens e reduzir estoque
  - Registrar `movimentacoes_estoque` tipo 'saida' para cada produto
  - Se quantidade_estoque <= 0 → ativo = FALSE
- [x] Criar `cancelarPedido`:
  - Restaurar estoque, registrar tipo 'cancelamento'

### Work Unit 3.3: Sofía + Produtos (RAG Pipeline)
- [x] Modificar `src/lib/ai/openrouter.ts` (`processarRagPipeline`):
  - Adicionar chamada a `buscar_produtos_disponiveis()` ou `buscar_produto_por_nome()`
  - Injetar informações de produtos no CONTEXTO DE SUPORTE do system prompt
  - Detectar intenções de cardápio/produto/preço na mensagem do cliente
- [x] Adicionar regra no system prompt: "NUNCA confirme pedidos. Sempre pergunte ao operador."
- [x] Verificação de horário ANTES do RAG (se fora, não chama LLM)

### Work Unit 3.4: Mensagem Fora de Horário — Placeholders
- [x] `gerarMensagemForaHorario()` formata:
  - `{dias_semana}` → "sábado e domingo" (dias com ativo=true)
  - `{horario_inicio}` → menor hora_abertura entre os dias
  - `{horario_fim}` → maior hora_fechamento entre os dias
- [x] Testar formatação com 1 dia, 2 dias, 3+ dias, dias não consecutivos

---

## 6. Dependências entre PRs

```
PR #1 (migration + actions)
  └── PR #2 (UI) — depende das actions do PR #1
        └── PR #3 (integração) — depende da UI + lib de horário do PR #1
```

---

## 7. Riscos

| Risco | Mitigação |
|---|---|
| `sharp` não funcionar no Docker Alpine | Testar no ambiente de build; fallback para redimensionamento simples |
| Migração quebrar dados existentes de `produtos` | Usar DEFAULTs não-nulos; testar em staging primeiro |
| Performance do RAG com produtos | Limitar a 5 resultados na RPC; cache de produtos disponíveis |
| Exclusão em cascata de produtos com pedidos ativos | FK ON DELETE RESTRICT em itens_pedido; validar antes de excluir |
| Conflito de merge nos PRs encadeados | Manter cada PR focado; rebase antes de abrir o próximo |

---

## 8. Review Workload Forecast

| PR | Linhas estimadas | Risco budget |
|---|---|---|
| PR #1 | ~400 | ⚠️ No limite |
| PR #2 | ~450 | ⚠️ Excedido |
| PR #3 | ~300 | ✅ Dentro |
| **Total** | **~1150** | ❌ Requer PRs encadeados |
