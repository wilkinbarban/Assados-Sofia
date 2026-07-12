# Proposta: Módulos Horário do Atendimento + Estoque

**ID da Mudança:** `estoque-horarios`  
**Status:** `Arquivado` | **Arquivado em:** 2026-07-07  
**Data:** 2026-07-08

---

## 1. Resumo

Dois novos módulos no dashboard do administrador: **Horário do Atendimento** (gestão de horários de trabalho) e **Estoque** (gestão de produtos, inventário e ofertas). Ambos integrados com a IA Sofía para resposta automática fora do horário e consulta de produtos/catálogo.

---

## 2. Módulo 1: Horário do Atendimento

### 2.1 Objetivo
Permitir ao admin definir os horários e dias de funcionamento do negócio. Sofía deve responder automaticamente (sem consumir tokens do LLM) fora do horário de atendimento com uma mensagem fixa informando o horário de trabalho.

### 2.2 Decisão de Design: Tabela `horarios_atendimento` (Opção A)

Estrutura da tabela:
```sql
CREATE TABLE horarios_atendimento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),  -- 0=Domingo, 6=Sábado
  hora_abertura TIME NOT NULL,
  hora_fechamento TIME NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  data_criacao TIMESTAMPTZ DEFAULT now(),
  data_atualizacao TIMESTAMPTZ DEFAULT now(),
  UNIQUE(dia_semana)  -- um registro por dia
);
```

Chave de config global para a mensagem fora de horário:
```
chave: MENSAGEM_FORA_HORARIO
valor: "Olá! No momento estamos fora do horário de atendimento. 
        Nosso horário é {horarios}. 
        Por favor, envie sua mensagem durante nosso horário de funcionamento 
        que teremos o maior prazer em atendê-lo! 🥩"
```

### 2.3 Fluxo de Verificação de Horário

```
Mensagem recebida (WhatsApp / Telegram / Chat Web)
  → Antes de disparar RAG:
    1. Consultar horarios_atendimento WHERE ativo = true
    2. Verificar se o dia atual (dia_semana) tem registro ativo
    3. Verificar se hora atual está entre hora_abertura e hora_fechamento
    4. Se FORA do horário:
       → Buscar MENSAGEM_FORA_HORARIO do config
       → Substituir {horarios} pela lista formatada dos horários
       → Enviar resposta diretamente (SEM consumir LLM)
       → NÃO disparar processarRagPipeline
    5. Se DENTRO do horário:
       → Fluxo normal (RAG pipeline)
```

### 2.4 UI no Dashboard Admin
- Nova aba "Horários" no `AdminDashboard.tsx`
- Grade de 7 cards (um por dia da semana) com toggle ativo/inativo
- Cada card: seletor de hora abertura, seletor de hora fechamento
- Campo de texto para editar `MENSAGEM_FORA_HORARIO`
- Preview em tempo real da mensagem com os horários atuais

---

## 3. Módulo 2: Estoque

### 3.1 Objetivo
Gerenciar produtos, estoque e ofertas. Sofía deve poder consultar produtos, informar disponibilidade e ajudar na gestão de vendas.

### 3.2 Decisão de Design: Extender `produtos` + tabela de movimentações (Opção A)

### 3.2.1 Alterações na tabela `produtos` existente:

Novas colunas:
```sql
ALTER TABLE produtos ADD COLUMN quantidade_estoque INTEGER NOT NULL DEFAULT 0 CHECK (quantidade_estoque >= 0);
ALTER TABLE produtos ADD COLUMN estoque_minimo INTEGER NOT NULL DEFAULT 5 CHECK (estoque_minimo >= 0);
ALTER TABLE produtos ADD COLUMN controlar_estoque BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE produtos ADD COLUMN url_imagem_thumb TEXT;  -- thumbnail para cards
ALTER TABLE produtos ADD COLUMN url_imagem_2 TEXT;      -- segunda foto
ALTER TABLE produtos ADD COLUMN url_imagem_2_thumb TEXT;
```

Lógica de `ativo`:
- `ativo = false` → produto não disponível (esgotado ou desabilitado manualmente)
- `ativo = true AND quantidade_estoque > 0` → disponível para venda
- `ativo = true AND quantidade_estoque = 0` → automaticamente desabilitado

### 3.2.2 Nova tabela `movimentacoes_estoque`:

```sql
CREATE TYPE tipo_movimentacao AS ENUM ('entrada', 'saida', 'ajuste', 'cancelamento');

CREATE TABLE movimentacoes_estoque (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  tipo tipo_movimentacao NOT NULL,
  quantidade INTEGER NOT NULL,
  quantidade_anterior INTEGER NOT NULL,
  quantidade_nova INTEGER NOT NULL,
  motivo TEXT,
  usuario_id UUID REFERENCES auth.users(id),
  pedido_id UUID REFERENCES pedidos(id),
  data_criacao TIMESTAMPTZ DEFAULT now()
);
```

### 3.2.3 Upload de Imagens (Opção A - sharp server-side)

Bucket novo: `produto-imagens` (privado)
- Validação: apenas imagens (JPEG, PNG, WebP), máximo 10MB
- Máximo 2 fotos por produto
- Processamento com `sharp`:
  - `prod_{id}_thumb.webp` — 300px largura, qualidade 80%
  - `prod_{id}_full.webp` — 800px largura, qualidade 85%
  - `prod_{id}_2_thumb.webp` / `prod_{id}_2_full.webp` para segunda foto
- Exclusão em cascata: ao deletar produto, remover arquivos do bucket

### 3.3 Lógica de Venda e Estoque

```
Pedido confirmado (status → 'confirmado')
  → Para cada item_pedido:
    → Buscar produto
    → Se controlar_estoque = TRUE:
      → nova_quantidade = quantidade_estoque - item.quantidade
      → Registrar movimentacao_estoque (tipo='saida', pedido_id)
      → Se nova_quantidade <= 0: ativo = FALSE
    → Atualizar produto.quantidade_estoque
```

### 3.4 Integração com Sofía

- Sofía consulta `produtos` via função RPC (não diretamente do RAG)
- Nova RPC: `buscar_produtos_disponiveis()` — retorna produtos ativos com estoque > 0
- Nova RPC: `buscar_produto_por_nome(nome TEXT)` — busca por nome
- Sofía pode:
  - Listar cardápio completo
  - Informar preço de um produto
  - Dizer se está disponível
  - Sugerir ofertas/complementos
  - NUNCA confirmar pedido sozinha — sempre pergunta ao operador

### 3.5 UI no Dashboard Admin
- Nova aba "Estoque" no `AdminDashboard.tsx`
- Tabela de produtos com colunas: nome, preço, estoque, status, ações
- Modal de criação/edição com:
  - Campos: nome, descrição, preço, quantidade inicial, estoque mínimo
  - Upload de imagem (drag & drop, preview, validação)
  - Toggle: controlar_estoque
- Contador de estoque com botões +/- para ajuste rápido
- Histórico de movimentações por produto (tabela abaixo)
- Filtro: mostrar só ativos / todos / esgotados

---

## 4. Impacto Técnico

### 4.1 Arquivos a Criar
| Arquivo | Propósito |
|---|---|
| `supabase/migrations/YYYYMMDD_estoque_horarios.sql` | Tabelas, colunas, tipos, RLS |
| `src/app/actions/horarios.ts` | Server actions CRUD horários |
| `src/app/actions/estoque.ts` | Server actions produtos+estoque+imagens |
| `src/components/operator/BusinessHoursManager.tsx` | UI gestão horários |
| `src/components/operator/InventoryManager.tsx` | UI gestão estoque |
| `src/lib/horarios/verificar.ts` | Lógica verificação horário + msg fora hora |

### 4.2 Arquivos a Modificar
| Arquivo | Mudança |
|---|---|
| `src/app/atendimento/admin/page.tsx` | +2 tabs ('horarios', 'estoque') |
| `src/lib/ai/openrouter.ts` | + verificação horário antes do RAG |
| `src/app/api/webhooks/telegram/route.ts` | + verificação horário |
| `src/app/api/webhooks/evolution/route.ts` | + verificação horário |
| `src/app/actions/pedidos.ts` | + atualização estoque ao confirmar |

### 4.3 Estimativa de Linhas
| Categoria | Linhas |
|---|---|
| Migração SQL | ~100 |
| Server actions | ~300 |
| UI components | ~500 |
| Lib utilities | ~100 |
| Modificações existentes | ~150 |
| **Total estimado** | **~1150** |

⚠️ **Ultrapassa o budget de 400 linhas.** Recomenda-se divisão em PRs encadeados.

---

## 5. Perguntas para Refinamento - RESPONDIDAS

1. **Horários**: O usuário pode escolher quaisquer dias da semana. A UI terá 7 cards (Dom-Sáb) com toggle individual. ✅
2. **Moeda**: Confirmado — Reais (BRL) armazenados em centavos (INTEGER). ✅
3. **Mensagem fora de horário**: Versão melhorada com tom caloroso da Sofía:

```
"Olá! 😊 Agora estamos fora do nosso horário de atendimento, 
mas não se preocupe — sua mensagem é muito importante para nós! 🥩

Nosso horário de funcionamento é:
📅 {dias_semana}
🕐 {horario_inicio} às {horario_fim}

Ficaremos felizes em atendê-lo(a) durante esse período. 
Envie sua mensagem quando estivermos abertos que será um prazer 
ajudar você com o melhor churrasco de Curitiba! 🍖

Atenciosamente,
Equipe Asados ❤️"
```

## 6. Status

✅ Proposta aprovada. Seguindo para fase de especificações (sdd-spec) e design (sdd-design).
