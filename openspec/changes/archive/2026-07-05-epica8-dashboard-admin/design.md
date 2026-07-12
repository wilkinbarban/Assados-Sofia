# Desenho Técnico: Dashboard Administrativo, Gestão de Operadores e Auditoria (Épica 8)

**ID da Mudança:** `epica8-dashboard-admin`  
**Status:** `Aprovado`

---

## 1. Estratégia Técnica e Fluxo

O dashboard administrativo centraliza o controle do sistema de atendimento, garantindo a governança sobre permissões, integrações e logs de auditoria.

```text
                     +---------------------------------------+
                     |           Next.js Middleware          |
                     | (Filtra /atendimento/admin & subrotas)|
                     +-------------------+-------------------+
                                         |
                                         v [Permitido: Admin/Supervisor]
                     +-------------------+-------------------+
                     |         /atendimento/admin/page       |
                     +-------------------+-------------------+
                                         |
                                         v
                     +-------------------+-------------------+
                     |              Tabs UI                  |
                     +-------+---+----+----+-------+---------+
                             |   |    |    |       |
      +----------------------+   |    |    +------------------+              |
      |                          |    |                       v              v
      v                          v    v                  [Auditoria]      [Prompt IA]
[Operadores]              [Integrações] [Métricas]       - Logs imutáveis - Persona (R)
- CRUD/Status             - Status Calendar - Mensagens   - RLS Read-only
- Lockout/Min Admin check - Test Event     - IA vs Humano
```

---

## 2. Banco de Dados e Migrações (PostgreSQL)

Arquivo: `supabase/migrations/20260705000000_epica8_dashboard_admin.sql`

```sql
-- 1. Criação da Tabela de Logs de Auditoria
CREATE TABLE public.logs_auditoria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
    acao VARCHAR(100) NOT NULL,
    detalhes JSONB NOT NULL,
    data_criacao TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comentários da tabela e colunas para documentação
COMMENT ON TABLE public.logs_auditoria IS 'Registros imutáveis de ações administrativas e de auditoria.';
COMMENT ON COLUMN public.logs_auditoria.usuario_id IS 'ID do operador (admin ou supervisor) que realizou a ação.';
COMMENT ON COLUMN public.logs_auditoria.acao IS 'Identificador técnico da ação (ex: alteracao_status, alteracao_funcao, teste_calendario).';

-- 2. Habilitar Row Level Security (RLS)
ALTER TABLE public.logs_auditoria ENABLE ROW LEVEL SECURITY;

-- 3. Políticas RLS
-- Permite leitura de logs apenas por administradores ou supervisores
CREATE POLICY "Leitura de logs por admin e supervisor" ON public.logs_auditoria
FOR SELECT
USING (
    public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao])
);

-- Permite inserção de logs apenas por administradores ou supervisores
CREATE POLICY "Insercao de logs por admin e supervisor" ON public.logs_auditoria
FOR INSERT
WITH CHECK (
    public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao])
);

-- NOTA: Nenhuma política para UPDATE ou DELETE é criada, tornando a tabela imutável via API REST do Supabase.
```

---

## 3. Next.js Middleware Protection

Modificação no arquivo `middleware.ts` para proteger rotas administrativas.

### Alterações propostas:
Identificar requisições para `/atendimento/admin` ou `/atendimento/admin/*` antes da verificação geral de rotas de atendimento.

```typescript
// No escopo de validação do middleware (dentro de if (user)):
const isAtendimentoAdminRoute = pathname === '/atendimento/admin' || pathname.startsWith('/atendimento/admin/');

if (isAtendimentoAdminRoute) {
  const adminRoles = ['admin', 'supervisor'];
  if (!perfil || !adminRoles.includes(perfil.funcao)) {
    return NextResponse.redirect(new URL('/403', request.url));
  }
}
```

---

## 4. Server Actions (`src/app/actions/admin.ts`)

Todas as Server Actions de administração implementam validações estritas de sessão e de permissão no backend antes de qualquer consulta.

| Ação | Parâmetros | Lógica / Comportamento |
|---|---|---|
| `listarUsuariosAdmin()` | Nenhum | 1. Valida se o chamador é `admin` ou `supervisor`. <br>2. Instancia o `createAdminClient()` (Service Role) para buscar e-mails via `supabase.auth.admin.listUsers()`. <br>3. Faz select na tabela `public.perfis` ordenada por `data_criacao` desc. <br>4. Retorna a lista unificada. |
| `atualizarPerfilUsuario()` | `usuarioAlvoId: string, funcao: string, ativo: boolean` | 1. Valida se o chamador é `admin` ou `supervisor`. <br>2. **Anti-Lockout:** Rejeita se `usuarioAlvoId === callerId`. <br>3. **Admin Mínimo:** Se a função está deixando de ser `'admin'` ou o status `ativo` vira `false`, verifica se há pelo menos um outro admin ativo no banco (`funcao = 'admin' AND ativo = true`). <br>4. Atualiza `public.perfis` e insere registro em `public.logs_auditoria`. |
| `testarGoogleCalendar()` | Nenhum | 1. Valida se o chamador é `admin` ou `supervisor`. <br>2. Tenta agendar evento de 15 min `[TESTE] Conexão Asados - [Timestamp]`. <br>3. Insere registro com status (sucesso/falha) em `public.logs_auditoria`. |
| `obterEstatisticasMensagens()` | Nenhum | 1. Valida se o chamador é `admin` ou `supervisor`. <br>2. Executa contagens separadas de mensagens com `head: true` para `'cliente'`, `'operador'` e `'ia'`. <br>3. Retorna objeto compilado e a taxa percentual de respostas automáticas da IA. |

---

## 5. Estrutura de Componentes da Interface (UI)

### 5.1 Rota `/atendimento/admin/page.tsx` (RSC)
Carrega a sessão do usuário ativo no servidor e valida se ele é `admin` ou `supervisor`. Renders:
`<AdminDashboard />` passando dados iniciais.

### 5.2 Componente `src/components/operator/AdminDashboard.tsx`
Interface baseada em abas (`Tabs` do shadcn/ui):

*   **Aba "Operadores":**
    *   Exibe tabela com Nome, E-mail (unificado), Função (Dropdown Select) e Status (Switch toggle).
    *   Implementa confirmação modal para alterações críticas.
    *   Desabilita botões para o operador logado (auto-lockout protection).
*   **Aba "Integrações":**
    *   Valores de ambiente mostrados como: `GOOGLE_CALENDAR_ID` (Mascarado), `GOOGLE_CLIENT_EMAIL` (Mascarado) e status de `GOOGLE_PRIVATE_KEY` (Configurada / Não Configurada).
    *   Botão "Testar Calendário" com estados de carregamento e toasts de feedback de sucesso ou erro técnico.
*   **Aba "Métricas":**
    *   Cards com indicadores: Total de mensagens, Mensagens de clientes, Mensagens de operadores, Mensagens da IA Sofía.
    *   Gráfico simples ou barra de proporção ilustrando a taxa de automatização: `IA / (IA + Operador) * 100`.
*   **Aba "Auditoria":**
    *   Tabela paginada exibindo registros da tabela `public.logs_auditoria` em ordem cronológica reversa.
    *   Visualizador JSON amigável para a coluna `detalhes`.
*   **Aba "Prompt da IA":**
    *   Visualizador em modo somente leitura (`read-only`) com o Master System Prompt estruturado (Persona, Cardápio, Regras de Funcionamento e Transbordo Humano).

---

## 6. Riscos e Mitigações

*   **Risco de Lockout Administrativo:** O último administrador ativo desativar a si mesmo ou mudar sua própria função.
    *   *Mitigação:* Validado no frontend (controles desabilitados para o usuário logado) e enforced no backend (Server Action rejeita explicitamente atualizações do próprio ID ou se o count de administradores ativos for a 0).
*   **Vazamento de Variáveis do Calendário:** Enviar a chave privada do calendário ao navegador.
    *   *Mitigação:* A verificação das variáveis e o disparo do evento acontecem exclusivamente no servidor (Server Action / API). O frontend recebe apenas uma flag booleana e um texto mascarado.
*   **Vazamento de PII nos Logs de Auditoria:** Gravar telefones ou dados de clientes em `logs_auditoria.detalhes`.
    *   *Mitigação:* A especificação de auditoria restringe os payloads aos IDs de usuários internos (operadores/perfis), status e códigos técnicos de teste, garantindo total conformidade com a LGPD.
