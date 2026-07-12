# Desenho Técnico: Melhorias no Dashboard (Épica 8)

Este documento descreve as especificações técnicas detalhadas para a implementação das melhorias no painel administrativo e de atendimento (Console do Operador). O objetivo destas mudanças é permitir a exclusão segura de usuários/clientes (com deleção em cascata), controle dinâmico de chaves de API, unificação do módulo de base de conhecimento no dashboard e facilitação da navegação entre os painéis.

---

## 1. Arquitetura do Banco de Dados e Migração

Para viabilizar a gestão dinâmica de credenciais e chaves de API sem exigir reinicializações de contêineres, será criada a tabela `public.configuracoes_sistema`. Esta tabela armazenará chaves de integração e permitirá a indicação de campos sensíveis para controle de mascaramento na interface.

### Schema: `public.configuracoes_sistema`

| Nome da Coluna | Tipo SQL | Restrições | Descrição (pt-BR) |
| :--- | :--- | :--- | :--- |
| `chave` | `VARCHAR(100)` | `PRIMARY KEY` | Nome único da chave de configuração (ex: `OPENROUTER_API_KEY`). |
| `valor` | `TEXT` | `NOT NULL` | Valor configurado. |
| `eh_segredo` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` | Indica se o valor é sensível (segredo) e deve ser mascarado na UI. |
| `data_criacao` | `TIMESTAMP WITH TIME ZONE` | `DEFAULT CURRENT_TIMESTAMP` | Data/hora do registro de criação da configuração. |
| `data_atualizacao` | `TIMESTAMP WITH TIME ZONE` | `DEFAULT CURRENT_TIMESTAMP` | Data/hora da última atualização. |

### Script da Migração SQL (`supabase/migrations/20260705010000_epica8_dashboard_improvements.sql`)

```sql
-- 1. Criação da Tabela de Configurações do Sistema
CREATE TABLE public.configuracoes_sistema (
    chave VARCHAR(100) PRIMARY KEY,
    valor TEXT NOT NULL,
    eh_segredo BOOLEAN NOT NULL DEFAULT FALSE,
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Trigger de atualização automática da data_atualizacao
CREATE TRIGGER tr_configuracoes_sistema_atualizar_data
BEFORE UPDATE ON public.configuracoes_sistema
FOR EACH ROW EXECUTE FUNCTION public.atualizar_data_atualizacao();

-- 3. Documentação das colunas e tabela (pt-BR)
COMMENT ON TABLE public.configuracoes_sistema IS 'Armazena chaves de configuração e credenciais de integração dinâmicas do sistema.';
COMMENT ON COLUMN public.configuracoes_sistema.chave IS 'Nome identificador único da chave de configuração.';
COMMENT ON COLUMN public.configuracoes_sistema.valor IS 'Valor da respectiva chave de configuração.';
COMMENT ON COLUMN public.configuracoes_sistema.eh_segredo IS 'Sinalizador booleano que indica se o campo é uma credencial sensível que requer mascaramento.';
COMMENT ON COLUMN public.configuracoes_sistema.data_criacao IS 'Data de inserção da chave.';
COMMENT ON COLUMN public.configuracoes_sistema.data_atualizacao IS 'Data da última alteração do valor.';

-- 4. Habilitar Row Level Security (RLS)
ALTER TABLE public.configuracoes_sistema ENABLE ROW LEVEL SECURITY;

-- 5. Definição das Políticas RLS
-- Somente administradores e supervisores ativos podem gerenciar e ler as chaves
CREATE POLICY "Leitura de configuracoes por admin e supervisor" ON public.configuracoes_sistema
    FOR SELECT TO authenticated
    USING (public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao]));

CREATE POLICY "Escrita de configuracoes por admin e supervisor" ON public.configuracoes_sistema
    FOR ALL TO authenticated
    USING (public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao]))
    WITH CHECK (public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao]));

-- 6. Concessão de Privilégios às Roles
GRANT ALL ON public.configuracoes_sistema TO postgres, service_role, authenticated, anon;
```

---

## 2. Server Actions (`src/app/actions/admin.ts`)

Duas novas Server Actions serão adicionadas ao arquivo [src/app/actions/admin.ts](file:///home/wilkin/proyectos/Asados/src/app/actions/admin.ts):

### `deletarUsuarioAdmin(usuarioAlvoId: string)`

Esta ação realiza a remoção lógica e física completa de todos os dados gerados por um usuário (cliente ou operador), operando com privilégios de `service_role` para contornar restrições padrão de RLS, enquanto garante que o sistema não perca o último administrador.

**Fluxo de Execução**:
1. **Validação de Permissão**: Verifica se o chamador possui sessão ativa e papel de `'admin'` ou `'supervisor'`.
2. **Anti-Lockout (Auto-exclusão)**: Impede que o próprio usuário autenticado chame a remoção sobre si mesmo.
3. **Validação de Admin Mínimo**:
   - Caso o perfil do `usuarioAlvoId` seja `'admin'` e esteja `'ativo'`, realiza um count na tabela `public.perfis` para verificar se existem outros administradores ativos.
   - Se houver `count <= 1`, aborta e retorna erro `'MINIMO_UM_ADMIN_ATIVO'`.
4. **Instanciação do Cliente de Serviço**: Cria uma instância do Supabase com a role de serviço (`createAdminClient()`).
5. **Deleção em Cascata Segura**:
   - Consulta a tabela `public.clientes` para verificar se o `usuarioAlvoId` possui cadastro de cliente associado (`SELECT id FROM public.clientes WHERE usuario_id = usuarioAlvoId`).
   - Se um `clienteId` for encontrado:
     1. Obtém todos os IDs de pedidos associados (`SELECT id FROM public.pedidos WHERE cliente_id = clienteId`).
     2. Remove todos os registros em `public.itens_pedido` pertencentes aos pedidos obtidos.
     3. Remove todos os registros em `public.pedidos` associados a `clienteId`.
     4. Obtém todos os IDs de conversas do cliente (`SELECT id FROM public.conversas WHERE cliente_id = clienteId`).
     5. Remove todas as mensagens relacionadas em `public.mensagens`.
     6. Remove todas as conversas em `public.conversas`.
     7. Remove o perfil de cliente em `public.clientes`.
   - Se nenhum registro de cliente existir (ex: o usuário alvo é apenas um atendente/operador do sistema), pula as deleções acima.
6. **Remoção de Autenticação**:
   - Executa `await adminSupabase.auth.admin.deleteUser(usuarioAlvoId)`.
   - O Supabase propagará a deleção para `public.perfis` e `public.codigos_verificacao` em virtude da chave estrangeira com `ON DELETE CASCADE`.
7. **Registro de Auditoria**:
   - Grava um log na tabela `public.logs_auditoria` indicando a ação de remoção, com o payload: `{ usuario_alvo_id: usuarioAlvoId, nome: nomePerfil, funcao: funcaoPerfil }`.

```typescript
export async function deletarUsuarioAdmin(usuarioAlvoId: string) {
  try {
    const check = await verificarPermissaoOperador()
    if (!check.authorized || !check.user) {
      return { success: false, error: check.error || 'ACESSO_NEGADO_NAO_AUTENTICADO' }
    }

    const { user } = check
    const callerId = user.id

    // 1. Impedir auto-exclusão
    if (usuarioAlvoId === callerId) {
      return { success: false, error: 'ANTI_LOCKOUT_AUTO_EXCLUSAO' }
    }

    const adminSupabase = createAdminClient()

    // 2. Buscar dados do perfil alvo
    const { data: perfilAlvo, error: errorPerfil } = await adminSupabase
      .from('perfis')
      .select('nome, funcao, ativo')
      .eq('id', usuarioAlvoId)
      .single()

    if (errorPerfil || !perfilAlvo) {
      return { success: false, error: 'PERFIL_ALVO_NAO_ENCONTRADO' }
    }

    // 3. Garantir mínimo de um admin ativo
    if (perfilAlvo.funcao === 'admin' && perfilAlvo.ativo) {
      const { count, error: countError } = await adminSupabase
        .from('perfis')
        .select('*', { count: 'exact', head: true })
        .eq('funcao', 'admin')
        .eq('ativo', true)
        .neq('id', usuarioAlvoId)

      if (countError) {
        return { success: false, error: `ERRO_VALIDACAO_ADMIN: ${countError.message}` }
      }

      if (!count || count < 1) {
        return { success: false, error: 'MINIMO_UM_ADMIN_ATIVO' }
      }
    }

    // 4. Deleção manual em cascata para burlar restrições ON DELETE RESTRICT
    const { data: cliente, error: errCliente } = await adminSupabase
      .from('clientes')
      .select('id')
      .eq('usuario_id', usuarioAlvoId)
      .maybeSingle()

    if (cliente) {
      const clienteId = cliente.id

      // 4.1. Buscar pedidos do cliente
      const { data: pedidos } = await adminSupabase
        .from('pedidos')
        .select('id')
        .eq('cliente_id', clienteId)

      const pedidoIds = (pedidos || []).map(p => p.id)

      if (pedidoIds.length > 0) {
        // Excluir itens dos pedidos
        await adminSupabase.from('itens_pedido').delete().in('pedido_id', pedidoIds)
        // Excluir pedidos
        await adminSupabase.from('pedidos').delete().eq('cliente_id', clienteId)
      }

      // 4.2. Buscar conversas
      const { data: conversas } = await adminSupabase
        .from('conversas')
        .select('id')
        .eq('cliente_id', clienteId)

      const conversaIds = (conversas || []).map(c => c.id)

      if (conversaIds.length > 0) {
        // Excluir mensagens das conversas
        await adminSupabase.from('mensagens').delete().in('conversa_id', conversaIds)
        // Excluir conversas
        await adminSupabase.from('conversas').delete().eq('cliente_id', clienteId)
      }

      // 4.3. Excluir perfil de cliente
      await adminSupabase.from('clientes').delete().eq('id', clienteId)
    }

    // 5. Excluir do Supabase Auth (limpará perfis e codigos_verificacao em cascata no banco)
    const { error: authDeleteError } = await adminSupabase.auth.admin.deleteUser(usuarioAlvoId)
    if (authDeleteError) {
      return { success: false, error: `ERRO_AUTH_DELETE: ${authDeleteError.message}` }
    }

    // 6. Inserir log de auditoria da exclusão
    await adminSupabase.from('logs_auditoria').insert({
      usuario_id: callerId,
      acao: 'deletar_usuario',
      detalhes: {
        usuario_alvo_id: usuarioAlvoId,
        nome: perfilAlvo.nome,
        funcao: perfilAlvo.funcao
      }
    })

    revalidatePath('/atendimento/admin')
    return { success: true }
  } catch (error: any) {
    console.error('Erro na Server Action deletarUsuarioAdmin:', error)
    return { success: false, error: error.message || 'ERRO_INTERNO' }
  }
}
```

### `salvarConfiguracaoAdmin(chave: string, valor: string)`

Esta ação realiza a persistência/atualização (upsert) das chaves de API na tabela `public.configuracoes_sistema`.

**Fluxo de Execução**:
1. Valida se o usuário chamador tem permissão administrativa (`admin` ou `supervisor`).
2. Identifica se a chave sendo salva é sensível (por exemplo, contendo `_KEY` ou `_TOKEN` no nome). Define `eh_segredo = true` nesses casos.
3. Executa um upsert no banco usando o cliente admin/service_role.
4. Escreve no log de auditoria. Para segredos, mascara o valor utilizando `valor.substring(0, 4) + '***'` antes de gravar o log de auditoria, protegendo dados confidenciais de vazamentos acidentais em relatórios.

---

## 3. Mecanismo de Fallback de Configurações (`System Config Fallback Helper`)

Os módulos do sistema que exigem credenciais externas (como OpenRouter e Meta API) lerão as variáveis dinâmicas através do utilitário `obterConfiguracaoSistema(chave: string)`.

A lógica consultará primeiro a tabela `public.configuracoes_sistema` e, caso o registro não exista, retornará a variável correspondente do `process.env`.

A função será implementada utilizando o cliente de serviço (`service_role`) para que possa ser executada livremente de qualquer contexto (como webhooks assíncronos ou rotas de API anônimas).

### Implementação da Função Auxiliar (`src/lib/config/sistema.ts`)

```typescript
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Recupera uma chave de configuração do sistema.
 * Consulta prioritariamente a tabela public.configuracoes_sistema do banco de dados.
 * Se ausente, recorre a process.env como contingência (fallback).
 * 
 * @param chave Nome da chave de configuração
 */
export async function obterConfiguracaoSistema(chave: string): Promise<string | null> {
  try {
    const supabase = createAdminClient()
    
    // Consulta direta à tabela configuracoes_sistema ignorando RLS via service_role
    const { data, error } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', chave)
      .maybeSingle()
      
    if (error) {
      console.warn(`[Config Fallback] Erro ao ler a chave ${chave} do banco de dados:`, error.message)
    }

    if (data && data.valor) {
      return data.valor
    }
  } catch (err) {
    console.error(`[Config Fallback] Falha técnica ao consultar chave ${chave}:`, err)
  }

  // Fallback para variáveis de ambiente locais do servidor
  return process.env[chave] || null
}
```

### Chaves Mapeadas no Código de Integrações

1. **OpenRouter**:
   - Substituir `process.env.OPENROUTER_API_KEY` por `await obterConfiguracaoSistema('OPENROUTER_API_KEY')` em [src/lib/ai/openrouter.ts](file:///home/wilkin/proyectos/Asados/src/lib/ai/openrouter.ts).
   - Substituir `process.env.OPENROUTER_MODEL` por `await obterConfiguracaoSistema('OPENROUTER_MODEL')` em [src/lib/ai/openrouter.ts](file:///home/wilkin/proyectos/Asados/src/lib/ai/openrouter.ts).
2. **WhatsApp API**:
   - Substituir `process.env.WHATSAPP_ACCESS_TOKEN` por `await obterConfiguracaoSistema('WHATSAPP_ACCESS_TOKEN')` em [src/lib/whatsapp/send.ts](file:///home/wilkin/proyectos/Asados/src/lib/whatsapp/send.ts).
   - Substituir `process.env.WHATSAPP_PHONE_NUMBER_ID` por `await obterConfiguracaoSistema('WHATSAPP_PHONE_NUMBER_ID')` em [src/lib/whatsapp/send.ts](file:///home/wilkin/proyectos/Asados/src/lib/whatsapp/send.ts).

---

## 4. Alterações na Interface do Usuário (UI)

### 4.1. Botão de Logout no `AdminDashboard.tsx`

Adição de uma ação de logout nativa na barra lateral (Sidebar) do Dashboard Administrativo.

**Especificação técnica**:
- Um botão com ícone de `LogOut` (da biblioteca `lucide-react`) rotulado como "Sair".
- Ao ser clicado, chama a função de encerramento de sessão assíncrona do cliente:
  ```typescript
  const supabase = createClient()
  await supabase.auth.signOut()
  window.location.href = '/login'
  ```
- O botão deve ser colocado no rodapé da Sidebar, logo acima ou ao lado das informações do usuário logado.

---

### 4.2. Gerenciamento das Integrações na Aba "Integrações"

Expansão da aba "Integrações" do componente [src/components/operator/AdminDashboard.tsx](file:///home/wilkin/proyectos/Asados/src/components/operator/AdminDashboard.tsx) para acomodar a visualização e edição das chaves.

**Funcionalidades**:
- **Formulário de Entrada**:
  - `WHATSAPP_ACCESS_TOKEN` (Textarea / Input oculto para senhas).
  - `WHATSAPP_PHONE_NUMBER_ID` (Input simples).
  - `OPENROUTER_API_KEY` (Input oculto para chaves de API).
  - `OPENROUTER_MODEL` (Input simples ou select pré-definido contendo as opções `google/gemini-2.5-flash` e `deepseek-chat`).
- **Mascaramento Visual**:
  - Exibir apenas os 4 primeiros caracteres da chave seguidos por asteriscos (`sk-or-***` ou `EAA***`) quando a chave estiver gravada e o campo inativo.
  - Disponibilizar um botão para revelar/ocultar os caracteres ou um botão para "Editar/Alterar" o segredo.
- **Persistência**:
  - Botão "Salvar Integrações" que invoca a Server Action `salvarConfiguracaoAdmin` sequencialmente para cada chave.

---

### 4.3. Incorporação do Módulo de Base de Conhecimento RAG

O componente de gerenciamento de conhecimento [src/components/operator/KnowledgeCRUD.tsx](file:///home/wilkin/proyectos/Asados/src/components/operator/KnowledgeCRUD.tsx) (atualmente standalone sob `/atendimento/conhecimento`) será unificado como uma aba integrante do Dashboard Administrativo principal.

**Especificações técnicas**:
- Ampliar o tipo `TabType` em `AdminDashboard.tsx`:
  ```typescript
  type TabType = 'operadores' | 'integracoes' | 'conhecimento' | 'metricas' | 'auditoria' | 'prompt'
  ```
- Adicionar no menu de navegação da Sidebar o botão "Base de Conhecimento", utilizando o ícone `BookOpen`.
- **Alterações de SSR** em [src/app/atendimento/admin/page.tsx](file:///home/wilkin/proyectos/Asados/src/app/atendimento/admin/page.tsx):
  - Importar e consultar a base de conhecimento no carregamento do servidor:
    ```typescript
    const { data: artigos } = await supabase
      .from('base_conhecimento')
      .select('id, titulo, conteudo, tags, ativo, data_criacao, data_atualizacao')
      .order('data_criacao', { ascending: false })
    ```
  - Passar a lista de artigos formatada como prop `artigosIniciais` para o componente `<AdminDashboard>`.
- No renderizador de conteúdo da tab em `AdminDashboard.tsx`, renderizar o módulo do CRUD:
  ```typescript
  {activeTab === 'conhecimento' && (
    <KnowledgeCRUD artigosIniciais={artigosIniciais} perfilFuncao={usuarioLogado.funcao} />
  )}
  ```

---

### 4.4. Link de Atalho no Header do Operador (`/atendimento`)

Facilitar a navegação do operador adicionando um botão de acesso rápido à administração.

**Especificações técnicas**:
- Modificar o arquivo [src/app/atendimento/page.tsx](file:///home/wilkin/proyectos/Asados/src/app/atendimento/page.tsx) no cabeçalho.
- O link existente para "Base de Conhecimento" (`/atendimento/conhecimento`) pode ser mantido ou atualizado para apontar diretamente para `/atendimento/admin` com a tab correspondente pré-selecionada, ou renderizar de forma explícita dois botões para usuários de cargo `admin` ou `supervisor`:
  - Botão "Painel Administrativo" (`/atendimento/admin`) com estilo de botão em destaque.
  - Botão "Base de Conhecimento" (`/atendimento/admin?tab=conhecimento` ou mantendo o link existente, porém o ideal é unificar para centralizar no novo painel).
- Garantir de forma rígida a validação condicional:
  ```typescript
  {['admin', 'supervisor'].includes(perfil.funcao) && (
    <Link
      href="/atendimento/admin"
      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-zinc-950 rounded-lg text-xs font-bold transition-all cursor-pointer select-none"
    >
      Painel Administrativo
    </Link>
  )}
  ```
