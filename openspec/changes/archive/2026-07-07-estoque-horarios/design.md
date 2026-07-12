# Desenho Técnico: Módulos Horário do Atendimento + Estoque

**ID da Mudança:** `estoque-horarios`  
**Status:** `Arquivado` | **Arquivado em:** 2026-07-07  

---

## 1. Migração SQL

### 1.1 Nova Tabela: `horarios_atendimento`

```sql
CREATE TABLE public.horarios_atendimento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_abertura TIME NOT NULL,
  hora_fechamento TIME NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  data_criacao TIMESTAMPTZ DEFAULT now(),
  data_atualizacao TIMESTAMPTZ DEFAULT now(),
  UNIQUE(dia_semana)
);

-- Trigger auto-update
CREATE TRIGGER tr_horarios_atendimento_atualizar_data
BEFORE UPDATE ON public.horarios_atendimento
FOR EACH ROW EXECUTE FUNCTION public.atualizar_data_atualizacao();

-- RLS: leitura pública, escrita admin/supervisor
ALTER TABLE public.horarios_atendimento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura pública de horários" ON public.horarios_atendimento
FOR SELECT USING (true);

CREATE POLICY "Escrita de horários por admin e supervisor" ON public.horarios_atendimento
FOR ALL TO authenticated
USING (public.tem_funcoes(ARRAY['admin', 'supervisor']))
WITH CHECK (public.tem_funcoes(ARRAY['admin', 'supervisor']));
```

### 1.2 Extensão de `produtos`

```sql
ALTER TABLE public.produtos ADD COLUMN quantidade_estoque INTEGER NOT NULL DEFAULT 0 CHECK (quantidade_estoque >= 0);
ALTER TABLE public.produtos ADD COLUMN estoque_minimo INTEGER NOT NULL DEFAULT 5 CHECK (estoque_minimo >= 0);
ALTER TABLE public.produtos ADD COLUMN controlar_estoque BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.produtos ADD COLUMN url_imagem_thumb TEXT;
ALTER TABLE public.produtos ADD COLUMN url_imagem_2 TEXT;
ALTER TABLE public.produtos ADD COLUMN url_imagem_2_thumb TEXT;
```

### 1.3 Nova Tabela: `movimentacoes_estoque`

```sql
CREATE TYPE public.tipo_movimentacao AS ENUM ('entrada', 'saida', 'ajuste', 'cancelamento');

CREATE TABLE public.movimentacoes_estoque (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  tipo public.tipo_movimentacao NOT NULL,
  quantidade INTEGER NOT NULL,
  quantidade_anterior INTEGER NOT NULL,
  quantidade_nova INTEGER NOT NULL,
  motivo TEXT,
  usuario_id UUID REFERENCES auth.users(id),
  pedido_id UUID REFERENCES public.pedidos(id) ON DELETE SET NULL,
  data_criacao TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.movimentacoes_estoque ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura de movimentações por operadores" ON public.movimentacoes_estoque
FOR SELECT TO authenticated
USING (public.tem_funcoes(ARRAY['admin', 'supervisor', 'vendedor']));

CREATE POLICY "Escrita de movimentações por operadores" ON public.movimentacoes_estoque
FOR INSERT TO authenticated
WITH CHECK (public.tem_funcoes(ARRAY['admin', 'supervisor', 'vendedor']));
```

### 1.4 Bucket `produto-imagens`

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('produto-imagens', 'produto-imagens', false, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- RLS para o bucket
CREATE POLICY "Leitura pública de imagens de produtos" ON storage.objects
FOR SELECT USING (bucket_id = 'produto-imagens');

CREATE POLICY "Upload de imagens por operadores" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'produto-imagens' AND public.tem_funcoes(ARRAY['admin', 'supervisor', 'vendedor']));

CREATE POLICY "Exclusão de imagens por operadores" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'produto-imagens' AND public.tem_funcoes(ARRAY['admin', 'supervisor', 'vendedor']));
```

### 1.5 RPCs para Sofía

```sql
-- Buscar produtos disponíveis para venda
CREATE OR REPLACE FUNCTION public.buscar_produtos_disponiveis()
RETURNS TABLE(id UUID, nome VARCHAR, descricao TEXT, preco_centavos INTEGER, url_imagem TEXT, url_imagem_thumb TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.nome, p.descricao, p.preco_centavos, p.url_imagem, p.url_imagem_thumb
  FROM public.produtos p
  WHERE p.ativo = TRUE AND (p.controlar_estoque = FALSE OR p.quantidade_estoque > 0)
  ORDER BY p.nome;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Buscar produto por nome (busca textual)
CREATE OR REPLACE FUNCTION public.buscar_produto_por_nome(p_nome TEXT)
RETURNS TABLE(id UUID, nome VARCHAR, descricao TEXT, preco_centavos INTEGER, url_imagem TEXT, url_imagem_thumb TEXT, quantidade_estoque INTEGER, ativo BOOLEAN) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.nome, p.descricao, p.preco_centavos, p.url_imagem, p.url_imagem_thumb, p.quantidade_estoque, p.ativo
  FROM public.produtos p
  WHERE p.nome ILIKE '%' || p_nome || '%'
  ORDER BY p.nome
  LIMIT 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 2. Arquitetura de Arquivos

### 2.1 Estrutura

```
src/
├── app/
│   ├── actions/
│   │   ├── horarios.ts          ← NOVO: CRUD horários
│   │   └── estoque.ts           ← NOVO: CRUD produtos+estoque+imagens
│   └── atendimento/
│       └── admin/
│           └── page.tsx          ← MODIFICAR: +2 tabs
├── components/
│   └── operator/
│       ├── BusinessHoursManager.tsx  ← NOVO
│       └── InventoryManager.tsx      ← NOVO
├── lib/
│   ├── horarios/
│   │   └── verificar.ts         ← NOVO: lógica verificação horário
│   └── imagens/
│       └── processar.ts         ← NOVO: sharp resize/upload
supabase/
└── migrations/
    └── YYYYMMDD_estoque_horarios.sql  ← NOVO
```

### 2.2 Fluxo: Verificação de Horário (todos os canais)

```typescript
// src/lib/horarios/verificar.ts
export async function verificarHorarioAtendimento(): Promise<{
  dentro: boolean;
  mensagem?: string;
}> {
  const supabase = createAdminClient()
  
  // 1. Buscar horários ativos para hoje
  const hoje = new Date()
  const diaSemana = hoje.getDay() // 0=Dom, 6=Sáb
  
  const { data: horario } = await supabase
    .from('horarios_atendimento')
    .select('hora_abertura, hora_fechamento')
    .eq('dia_semana', diaSemana)
    .eq('ativo', true)
    .single()
  
  if (!horario) {
    return { dentro: false, mensagem: await gerarMensagemForaHorario(supabase) }
  }
  
  const horaAtual = hoje.getHours() * 60 + hoje.getMinutes()
  const [ah, am] = horario.hora_abertura.split(':').map(Number)
  const [fh, fm] = horario.hora_fechamento.split(':').map(Number)
  const abertura = ah * 60 + am
  const fechamento = fh * 60 + fm
  
  if (horaAtual >= abertura && horaAtual <= fechamento) {
    return { dentro: true }
  }
  
  return { dentro: false, mensagem: await gerarMensagemForaHorario(supabase) }
}
```

### 2.3 Integração nos Webhooks (padrão)

```typescript
// Em cada webhook (Telegram, Evolution, Chat Web):
const horario = await verificarHorarioAtendimento()
if (!horario.dentro) {
  // Enviar mensagem diretamente, SEM chamar processarRagPipeline
  await enviarMensagemDireta(canal, chatId, horario.mensagem)
  return Response.json({ ok: true })
}
// Fluxo normal...
```

### 2.4 Fluxo: Upload de Imagem com Sharp

```typescript
// src/lib/imagens/processar.ts
import sharp from 'sharp'

export async function processarImagemProduto(
  file: File,
  produtoId: string,
  index: 1 | 2
): Promise<{ full: string; thumb: string }> {
  const buffer = Buffer.from(await file.arrayBuffer())
  
  const prefix = index === 1 ? `prod_${produtoId}` : `prod_${produtoId}_2`
  
  // Full (800px)
  const full = await sharp(buffer)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer()
  
  // Thumb (300px)
  const thumb = await sharp(buffer)
    .resize(300, 300, { fit: 'cover' })
    .webp({ quality: 80 })
    .toBuffer()
  
  // Upload para Supabase Storage
  const supabase = createAdminClient()
  
  await supabase.storage.from('produto-imagens').upload(
    `${prefix}_full.webp`, full, { contentType: 'image/webp', upsert: true }
  )
  await supabase.storage.from('produto-imagens').upload(
    `${prefix}_thumb.webp`, thumb, { contentType: 'image/webp', upsert: true }
  )
  
  return {
    full: `${prefix}_full.webp`,
    thumb: `${prefix}_thumb.webp`
  }
}
```

### 2.5 Fluxo: Atualização de Estoque ao Confirmar Pedido

```typescript
// Em src/app/actions/pedidos.ts — confirmarPedidoOperador()
// Após mudar status para 'confirmado':

for (const item of itens) {
  const { data: produto } = await supabase
    .from('produtos')
    .select('quantidade_estoque, controlar_estoque')
    .eq('id', item.produto_id)
    .single()
  
  if (produto.controlar_estoque) {
    const nova = produto.quantidade_estoque - item.quantidade
    
    await supabase.from('produtos').update({
      quantidade_estoque: nova,
      ativo: nova > 0
    }).eq('id', item.produto_id)
    
    await supabase.from('movimentacoes_estoque').insert({
      produto_id: item.produto_id,
      tipo: 'saida',
      quantidade: item.quantidade,
      quantidade_anterior: produto.quantidade_estoque,
      quantidade_nova: nova,
      motivo: 'Venda confirmada',
      usuario_id: user.id,
      pedido_id: pedidoId
    })
  }
}
```

---

## 3. UI Design

### 3.1 Aba "Horários" no AdminDashboard

```
┌──────────────────────────────────────────────────────────┐
│ ⏰ Horário do Atendimento                                 │
│                                                          │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │
│ │ Domingo │ │ Segunda │ │  Terça  │ │ Quarta  │  ...     │
│ │  ○ ativo│ │  ● ativo│ │  ● ativo│ │  ○ ativo│         │
│ │ Abertura│ │ Abertura│ │ Abertura│ │         │         │
│ │ [10:00] │ │ [10:00] │ │ [10:00] │ │         │         │
│ │   Fecho │ │   Fecho │ │   Fecho │ │         │         │
│ │ [14:00] │ │ [14:00] │ │ [14:00] │ │         │         │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘         │
│                                                          │
│ ─── Mensagem Fora de Horário ───                        │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ [Textarea editável com preview]                      │ │
│ └──────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Preview: "Olá! 😊 Agora estamos fora..." 🍖          │ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### 3.2 Aba "Estoque" no AdminDashboard

```
┌──────────────────────────────────────────────────────────┐
│ 📦 Estoque                              [+ Novo Produto] │
│                                                          │
│ Filtros: [Todos] [Ativos] [Esgotados]                    │
│                                                          │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Produto         │ Preço │ Estoque │ Status │ Ações   │ │
│ ├──────────────────────────────────────────────────────┤ │
│ │ Picanha         │ R$89,90│ 12     │ 🟢 Ativo│ ✏️ 🗑️  │ │
│ │ Costela Premium │ R$79,90│ 0      │ 🔴 Esgot│ ✏️ 🗑️  │ │
│ │ Alcatra         │ R$69,90│ 5      │ 🟢 Ativo│ ✏️ 🗑️  │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ ─── Histórico de Movimentações ───                      │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Data       │ Tipo  │ Qtd │ Anterior → Novo │ Usuário │ │
│ │ 08/07 14h  │ saída │ -2  │ 14 → 12        │ Wilkin  │ │
│ │ 08/07 10h  │ ajuste│ +10 │ 4 → 14         │ Admin   │ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### 3.3 Modal Criar/Editar Produto

```
┌──────────────────────────────────────────┐
│ Novo Produto                         ✕   │
│                                          │
│ Nome:   [________________]  *obrigatório │
│ Descrição: [________________]            │
│ Preço:  R$ [______,__]     *obrigatório  │
│                                          │
│ 📸 Fotos (máx 2):                        │
│ ┌──────┐ ┌──────┐                        │
│ │ Foto │ │ Foto │   Drag & drop ou click │
│ │  1   │ │  2   │   Máx 10MB cada        │
│ └──────┘ └──────┘                        │
│                                          │
│ Estoque inicial: [___]  Mínimo: [___]    │
│ ☑ Controlar estoque                     │
│                                          │
│ [Cancelar]  [💾 Salvar]                  │
└──────────────────────────────────────────┘
```

---

## 4. Server Actions

### 4.1 `src/app/actions/horarios.ts`

```typescript
'use server'
// Funções exportadas:
- salvarHorarioDia(dia_semana, hora_abertura, hora_fechamento, ativo)
- listarHorarios()
- salvarMensagemForaHorario(mensagem)
- obterMensagemForaHorario()
```

### 4.2 `src/app/actions/estoque.ts`

```typescript
'use server'
// Funções exportadas:
- criarProduto(data: CriarProdutoInput)
- atualizarProduto(id, data: AtualizarProdutoInput)
- alternarStatusProduto(id)
- excluirProduto(id)  // cascade: fotos + movimentações
- ajustarEstoque(produto_id, quantidade, tipo, motivo)
- listarMovimentacoes(produto_id)
- uploadImagemProduto(produto_id, file: File, index: 1|2)
- removerImagemProduto(produto_id, index: 1|2)
```

---

## 5. Dependências

- `sharp` — processamento de imagens (já presente como dependência transitiva do Next.js)
- Nenhuma nova dependência externa necessária
