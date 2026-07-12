# Desenho Técnico: Autenticação e Validação de Telefone (Épica 1)

**ID da Mudança:** `epica1-auth-otp`  
**Status:** `Aprovado`  

---

## 1. Estratégia Técnica

* **Next.js 16 (App Router)**: Renderização híbrida. Páginas do portal em Server Components por padrão.
* **@supabase/ssr**: Sincronização automática do JWT do Supabase via cookies seguros (`HttpOnly`, `Secure`, `SameSite=Lax`) para compartilhar sessão com Middleware, API Routes e Server Actions.
* **Supabase CLI**: Controle de versão do banco em `supabase/migrations/`.

---

## 2. Diagramas de Fluxo

### A. Registro & Criação de Perfil
```text
[Cliente Web] -> Cadastro (E-mail/Senha) -> Supabase Auth -> Trigger -> [perfis] (cliente, ativo=true)
```

### B. Validação OTP & Fusão de Contas
```text
[Cliente Logado] -> Insere Telefone -> POST /api/auth/otp -> Salva DB & Envia WhatsApp
[Cliente Logado] -> Digita OTP -> POST /api/auth/verify-otp -> RPC mesclar_contas() -> Acesso Liberado
```

---

## 3. Banco de Dados e Migrações

### 3.1 Tabelas e Triggers (PostgreSQL)

```sql
-- Enums e Extensões
CREATE TYPE tipo_funcao AS ENUM ('admin', 'supervisor', 'vendedor', 'cliente');

-- Tabela Perfis (Estende auth.users)
CREATE TABLE perfis (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    funcao tipo_funcao NOT NULL DEFAULT 'cliente',
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Trigger: Criar Perfil ao Cadastrar Usuário
CREATE OR REPLACE FUNCTION public.ao_criar_usuario()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.perfis (id, nome, funcao, ativo)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'nome', 'Novo Cliente'),
        'cliente',
        TRUE
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_ao_criar_usuario
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.ao_criar_usuario();

-- Tabela Clientes
CREATE TABLE clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
    nome VARCHAR(100) NOT NULL,
    telefone VARCHAR(20) UNIQUE NOT NULL,
    endereco TEXT,
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_telefone_curitiba CHECK (telefone ~ '^55419[0-9]{8}$')
);

-- Tabela Códigos de Verificação (OTP)
CREATE TABLE codigos_verificacao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    telefone VARCHAR(20) NOT NULL,
    codigo VARCHAR(6) NOT NULL,
    expira_em TIMESTAMP WITH TIME ZONE NOT NULL,
    verificado BOOLEAN NOT NULL DEFAULT FALSE,
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_otp_telefone_curitiba CHECK (telefone ~ '^55419[0-9]{8}$')
);
```

### 3.2 RPC: Fusão de Contas (`mesclar_contas`)
Executada em transação única. Une o usuário web ao histórico existente de WhatsApp.

```sql
CREATE OR REPLACE FUNCTION mesclar_contas(
    p_usuario_id UUID,
    p_telefone VARCHAR,
    p_endereco TEXT
) RETURNS VOID AS $$
DECLARE
    v_cliente_existente_id UUID;
    v_cliente_rascunho_id UUID;
BEGIN
    -- 1. Buscar registro prévio do WhatsApp (usuario_id nulo)
    SELECT id INTO v_cliente_existente_id
    FROM clientes WHERE telefone = p_telefone AND usuario_id IS NULL;

    -- 2. Buscar rascunho criado no fluxo web (se houver)
    SELECT id INTO v_cliente_rascunho_id
    FROM clientes WHERE usuario_id = p_usuario_id;

    IF v_cliente_existente_id IS NOT NULL THEN
        -- Remove rascunho se duplicado
        IF v_cliente_rascunho_id IS NOT NULL AND v_cliente_rascunho_id <> v_cliente_existente_id THEN
            DELETE FROM clientes WHERE id = v_cliente_rascunho_id;
        END IF;
        -- Associa conta web e atualiza endereço
        UPDATE clientes
        SET usuario_id = p_usuario_id,
            endereco = COALESCE(p_endereco, endereco),
            data_atualizacao = NOW()
        WHERE id = v_cliente_existente_id;
    ELSE
        -- Sem WhatsApp prévio: atualiza rascunho ou cria novo
        IF v_cliente_rascunho_id IS NOT NULL THEN
            UPDATE clientes
            SET telefone = p_telefone,
                endereco = COALESCE(p_endereco, endereco),
                data_atualizacao = NOW()
            WHERE id = v_cliente_rascunho_id;
        ELSE
            INSERT INTO clientes (usuario_id, nome, telefone, endereco)
            VALUES (
                p_usuario_id,
                (SELECT nome FROM perfis WHERE id = p_usuario_id),
                p_telefone,
                p_endereco
            );
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 4. Middleware & Proteção de Rotas

O `middleware.ts` interceptará requisições, lerá o cookie de sessão e validará as permissões na tabela `perfis`.

| Rota | Acesso Permitido | Ação se Negado |
| :--- | :--- | :--- |
| `/admin/*` | `funcao == 'admin'` | Redireciona para `/403` ou `/login` |
| `/atendimento/*` | `admin`, `supervisor`, `vendedor` | Redireciona para `/login` |
| `/cliente/*` | `cliente` (com telefone verificado) | Redireciona para `/cliente/verificar-telefone` |

* **Bloqueio Inativo**: Se o perfil possuir `ativo == false`, o middleware destrói a sessão e redireciona para `/login?erro=inativo`.

---

## 5. Rotas de API (Handlers)

### 5.1 `POST /api/auth/otp`
* **Input**: `{ telefone: string }`
* **Lógica**:
  1. Sanitiza e valida `telefone` contra regex Curitiba.
  2. Rate limit: Consulta `codigos_verificacao` para o mesmo número nos últimos 60s. Se houver, retorna `429 Too Many Requests`.
  3. Gera código aleatório de 6 dígitos.
  4. Insere em `codigos_verificacao` com expiração de 10 minutos.
  5. Envia mensagem via Meta WhatsApp API (Outbound call). Retorna `200 OK`.

### 5.2 `POST /api/auth/verify-otp`
* **Input**: `{ telefone: string, codigo: string, endereco?: string }`
* **Lógica**:
  1. Busca o código ativo na tabela.
  2. Valida expiração e se já foi usado. Se inválido, retorna `400 Bad Request`.
  3. Atualiza `codigos_verificacao` para `verificado = true`.
  4. Executa RPC `mesclar_contas(auth.uid(), telefone, endereco)`.
  5. Retorna `200 OK`.

---

## 6. Mapeamento de UI (Telas)

* **`/cadastro`**: Input de Nome, E-mail e Senha. Zod schema valida complexidade da senha.
* **`/login`**: Credenciais básicas. Middleware trata redirecionamento por função.
* **`/cliente/verificar-telefone`**: Tela de bloqueio obrigatória. Input de telefone com máscara Curitiba. Após envio, exibe formulário OTP com contador de reenvio (60s).
* **`/cliente/configuracoes`**: Atualização de Nome, Endereço e Senha. Alteração de telefone abre modal de validação OTP antes de persistir.

---

## 7. Estratégia de Testes

* **Testes RLS**: Scripts pgTAP validando que:
  * Clientes só leem seus próprios dados em `perfis` e `clientes`.
  * Usuários anônimos e clientes não acessam dados de outros perfis.
* **Mock do WhatsApp**: No ambiente local/testes, o envio da Meta API é interceptado por um mock que loga o código OTP no terminal, dispensando conexões externas.
