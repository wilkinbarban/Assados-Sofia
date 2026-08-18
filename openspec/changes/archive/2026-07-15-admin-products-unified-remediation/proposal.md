# Proposta: Remediação Unificada de Produtos Administrativos

## Problema

Produtos/Estoque está duplicado: `/atendimento/admin` concentra a experiência moderna, enquanto `/atendimento/produtos` mantém CRUD e reordenação legados. Há autoria forjável no RPC, imagens órfãs após falha e E2E insuficiente.

## Objetivos

- Consolidar o módulo oficial em `/atendimento/admin?tab=estoque`.
- Garantir autoria via `auth.uid()`, RLS e operações de estoque verificáveis.
- Tornar o ciclo de vida de imagens compensável e preservar a imagem anterior em falhas.
- Cobrir o fluxo administrativo autenticado ponta a ponta.

## Não objetivos

- Alterar o catálogo público, regras de venda ou UX fora do módulo administrativo.
- Migrar imagens existentes em massa ou redesenhar o modelo de produtos.

## Escopo

- Redirecionar/remover `/atendimento/produtos`; manter apenas `/atendimento/admin` como entrada oficial.
- Integrar CRUD, filtros, imagens, estoque e ordenação no painel oficial, com até seis colunas no desktop.
- Desabilitar drag-and-drop quando houver busca ou filtro de status; sem filtros, persistir e recarregar a ordem.
- Substituir RPC que aceita `p_usuario_id` por identidade derivada da sessão autenticada.
- Usar caminhos de imagem versionados e limpeza compensatória quando a persistência falhar.

## Capacidades afetadas

### Novas capacidades
- Nenhuma.

### Capacidades modificadas
- `dashboard_admin`: consolidação da interface e rota oficial de Produtos/Estoque.
- `estoque`: identidade/RLS da RPC, ordenação global não filtrada, ciclo de vida de imagens e validação automatizada.

## Abordagem

Estratégia de entrega interativa, com quatro PRs empilhadas sobre `main`:

1. **Dados e segurança** — identidade por `auth.uid()`, RLS e testes SQL.
2. **Fronteira e Storage** — chamada autenticada ao servidor e ciclo de imagens versionado/compensável.
3. **Módulo oficial** — integração da UI administrativa, ordenação e redirecionamento da rota legada.
4. **E2E autenticado** — cobertura Playwright de CRUD, filtros, imagens, ordenação e recarga.

Cada fatia inclui testes, é revertível isoladamente e respeita o orçamento de revisão.

## Riscos

| Risco | Mitigação |
|---|---|
| RPC sem sessão não resolve `auth.uid()` | Chamar via cliente vinculado à sessão e testar RLS. |
| Falha após upload gera imagem órfã | Excluir a nova imagem e manter produto/imagem anterior. |
| Reordenação parcial corrompe ordem global | Bloquear drag-and-drop com busca/filtros ativos. |

## Dependências

- Supabase Auth/RLS, Storage `produto-imagens` e suíte SQL local.
- Ambiente Playwright com credenciais administrativas de teste.

## Resumo de aceitação

- [ ] `/atendimento/admin` é a única experiência oficial; a rota legada redireciona ou inexiste.
- [ ] A RPC ignora identidade fornecida pelo cliente e deriva o ator de `auth.uid()`.
- [ ] Falhas de persistência após upload removem somente a nova imagem.
- [ ] Ordenação só funciona sem busca/filtros e persiste após recarga.
- [ ] Playwright autenticado cobre CRUD, filtros, imagens, ordenação e recarga.

## Plano de rollback

Reverter cada PR empilhada na ordem inversa. Preservar a rota oficial e os dados existentes; a fatia de Storage só remove imagens novas confirmadamente não referenciadas.
