# Relatório de Arquivamento: estoque-horarios

**ID da Mudança:** `estoque-horarios`  
**Arquivado em:** 2026-07-07  
**Modo:** OpenSpec + Engram (hybrid)

---

## 1. Resumo do que foi Construído

### Módulo Horário do Atendimento
- Tabela `horarios_atendimento` com RLS pública e trigger auto-update
- UI com 7 cards (Dom a Sáb), toggle ativo/inativo, seletores de hora
- Mensagem fora de horário configurável via `configuracoes_sistema` (chave `MENSAGEM_FORA_HORARIO`)
- Placeholders dinâmicos: `{dias_semana}`, `{horario_inicio}`, `{horario_fim}`
- Verificação automática em 3 canais (WhatsApp, Telegram, Chat Web)
- Resposta fora de horário sem consumir tokens do LLM

### Módulo Estoque
- Tabela `produtos` estendida com 6 novas colunas (quantidade_estoque, estoque_minimo, controlar_estoque, url_imagem_thumb, url_imagem_2, url_imagem_2_thumb)
- Tabela `movimentacoes_estoque` com ENUM `tipo_movimentacao` e auditoria completa
- Bucket `produto-imagens` com processamento sharp (300px thumb / 800px full em WebP)
- CRUD completo de produtos com validação zod
- Dedução automática de estoque ao confirmar pedido
- Restauração de estoque ao cancelar pedido
- Desabilitação automática quando `quantidade_estoque <= 0`

### Integração com Sofía
- RPCs `buscar_produtos_disponiveis()` e `buscar_produto_por_nome(nome TEXT)` no pipeline RAG
- Regra "NUNCA confirmar pedidos" no system prompt
- Consulta de cardápio, preços e disponibilidade via IA

---

## 2. Arquivos Criados

| Arquivo | Linhas (aprox.) |
|---|---|
| `supabase/migrations/20250708_estoque_horarios.sql` | ~100 |
| `src/app/actions/horarios.ts` | ~120 |
| `src/app/actions/estoque.ts` | ~300 |
| `src/components/operator/BusinessHoursManager.tsx` | ~200 |
| `src/components/operator/InventoryManager.tsx` | ~350 |
| `src/lib/horarios/verificar.ts` | ~80 |

## 3. Arquivos Modificados

| Arquivo | Mudança |
|---|---|
| `src/app/atendimento/admin/page.tsx` | +2 tabs ('horarios', 'estoque') + sidebar icons |
| `src/app/actions/pedidos.ts` | +lógica estoque ao confirmar/cancelar pedido |
| `src/app/api/webhooks/telegram/route.ts` | +verificação horário antes do RAG |
| `src/app/api/webhooks/evolution/route.ts` | +verificação horário antes do RAG |
| `src/app/actions/chat.ts` | +verificação horário no `processarIaChat` |
| `src/lib/ai/openrouter.ts` | +RPCs de produtos no RAG pipeline |

---

## 3. Estratégia de PRs

3 PRs encadeados (`stacked-to-main`), todos mergeados e deployed:

| PR | Escopo | Linhas | Budget |
|---|---|---|---|
| PR #1 | Migração SQL + Server Actions + Lib | ~400 | ⚠️ No limite |
| PR #2 | UI Dashboard (BusinessHoursManager + InventoryManager + AdminDashboard tabs) | ~450 | ⚠️ Excedido |
| PR #3 | Integração Sofía + Webhooks + Vendas | ~300 | ✅ Dentro |
| **Total** | | **~2700** | |

---

## 4. Verificação do Arquivamento

- [x] Task Completion Gate: todas as tasks marcadas `[x]`
- [x] Main specs criadas: `horario_atendimento/spec.md` e `estoque/spec.md`
- [x] 4 arquivos movidos para `openspec/changes/archive/2026-07-07-estoque-horarios/`
- [x] Status atualizado para `Arquivado` em todos os arquivos
- [x] Diretório ativo `estoque-horarios` removido
- [x] Config `openspec/config.yaml` verificado (OK, modo: `openspec`)

---

## 5. Specs Sincronizadas

| Domínio | Ação | Conteúdo |
|---|---|---|
| `horario_atendimento` | Criado | Specs H1-H4: definição de horários, mensagem fora de horário, verificação automática, resposta por canal |
| `estoque` | Criado | Specs E1-E7: extensão produtos, CRUD, upload imagens, movimentações, integração vendas, Sofía, UI dashboard |

---

## Ciclo SDD Completo

A mudança `estoque-horarios` foi planejada, especificada, desenhada, implementada em 3 PRs encadeados, verificada e agora arquivada.
