# Design: Remediação Unificada de Produtos Administrativos

## Abordagem técnica

`InventoryManager` será a única implementação administrativa, em `/atendimento/admin?tab=estoque`; `ProductCRUD` e a página legada deixam de oferecer fluxo concorrente. A mudança preserva catálogo cliente e regras de `admin`/`supervisor` ativos, trocando confiança no cliente por sessão, RLS e operação atômica.

## Decisões de arquitetura

| Decisão | Alternativa descartada | Justificativa |
|---|---|---|
| RPC sem `p_usuario_id`; usar `auth.uid()` | Validar o UUID recebido | O argumento é forjável. A função oficial usa `SECURITY DEFINER`, `search_path` vazio, exige `auth.uid()`, valida `tem_funcoes(admin, supervisor)`, bloqueia a linha e grava o mesmo ator. |
| Cliente de sessão para RPCs de estoque/imagem | `createAdminClient` em toda action | Cookies propagam JWT e fazem RLS efetiva para as RPCs de inventário e imagem, inclusive limpeza a partir de paths lidos do registro. CRUD legado pré-existente permanece no service client; nenhum path de limpeza vem do cliente. |
| Novos paths versionados por tentativa | `upsert` nos paths estáveis | `produtos/{id}/{slot}/{uuid}/{full,thumb}.webp` permite compensar sem sobrescrever a imagem anterior. |
| DnD somente na coleção global | Reordenar o subconjunto visível | Evita corromper `ordem_exibicao`; busca ou status ativo desabilitam o controle. |

## Dados, autorização e migração

Uma nova migração cria a RPC oficial de quatro argumentos, `SECURITY DEFINER`, `search_path` vazio e `EXECUTE` somente para `authenticated`; ela deriva o ator de `auth.uid()`, checa perfil ativo/papel e mantém `FOR UPDATE`, update e insert na mesma transação. A assinatura antiga fica apenas como ponte de rollback temporária para `service_role`, sem grants para `PUBLIC`/`anon`/`authenticated`: como `service_role` não leva JWT de usuário, a ponte aplica `p_usuario_id` como claim local da transação e então chama a RPC oficial, mantendo um único caminho de escrita. A contração executável fica fora de `supabase/migrations/`, em `supabase/contractions/`, e só pode ser promovida depois de verificar o rollout do caller de quatro argumentos e a ausência de chamadas legadas durante a janela acordada; ela revoga e remove somente a assinatura de cinco argumentos. As políticas removem DML direto de inventário. Storage fica público só para leitura e dá INSERT/UPDATE/DELETE a admin/supervisor autenticado, incluindo semântica de upsert/retry, nunca vendedor.

`supabase/tests/admin_products_inventory_hardening.sql` passa a criar usuários/perfis de teste em transação, executar como `authenticated` com claims de cada ator e provar: sucesso, ator derivado apesar de UUID falso inexistente, anônimo/papel proibido sem mutação, rollback por erro e ausência de privilégio anon. O teste é local/descartável, sem credenciais de produção.

## Fluxos e contratos

```text
InventoryManager -> Server Action (validação + perfil) -> client com cookies -> RLS/RPC
arquivo -> sharp -> upload full/thumb versionados -> persistir URLs -> revalidar admin
                                      | falha DB: remover somente novos paths
                                      | sucesso: agendar/remover paths antigos
```

`uploadImagemProduto` busca URLs anteriores, gera os dois objetos e persiste ambos numa atualização. Estados: `validar -> processar -> upload-full -> upload-thumb -> persistir -> limpar-antigos -> concluído`. Falha antes de persistir remove assets novos; falha de persistência mantém URLs anteriores. Limpeza é idempotente (`remove` de paths imutáveis); erro cria registro `cleanup_pending` com paths/erro para retentativa administrativa e jamais desfaz o novo registro. Na criação, produto vem primeiro; cada imagem é compensável e falha exibida, sem excluir o produto. O cliente mantém preview anterior, bloqueia operações concorrentes por produto/slot e recarrega após sucesso ou rollback.

`InventoryManager` absorve helpers de ordenação de `ProductCRUD`, adiciona handle focável com teclado (Space/Enter para iniciar, setas para mover, Escape para cancelar, anúncios `aria-live`) e estado otimista com rollback. Sem busca/filtro, carrega e envia a lista inteira ordenada por `ordem_exibicao, nome`; a action valida IDs/sequência contra a coleção global e revalida `/atendimento/admin`. A página legada vira Server Component com `redirect('/atendimento/admin?tab=estoque')`; o dashboard já lê `tab=estoque`.

## Impacto por arquivo

| Arquivo | Alteração |
|---|---|
| `supabase/migrations/<nova>_admin_products_unified_remediation.sql` | RPC, RLS, grants, políticas Storage e registro de limpeza pendente. |
| `supabase/tests/admin_products_inventory_hardening.sql` | Regressão SQL autenticada e prova da ponte sem JWT como `service_role`. |
| `supabase/contractions/20260712_admin_products_inventory_rpc_bridge.sql` | Contração executável, deferida e promovida manualmente após o rollout confirmado. |
| `src/app/actions/estoque.ts` | Cliente de sessão, contrato RPC, lifecycle de imagens e ordenação global. |
| `src/components/operator/InventoryManager.tsx` | CRUD consolidado, DnD acessível, loading/erro/rollback. |
| `src/components/operator/ProductCRUD.tsx` | Remover após mover a lógica reutilizável. |
| `src/app/atendimento/produtos/page.tsx` | Redirect único. |
| `tests/unit/{estoque-action,inventory-rpc-migration,product-ordering}.test.ts` e `tests/components/operator/InventoryManager.test.tsx` | RED/GREEN de segurança, imagens e DnD. |
| `tests/e2e/admin-products.spec.ts`, fixture/setup Playwright | Sessão isolada, dados e Storage determinísticos. |

## Testes e TDD

Sequência estrita: RED SQL/RPC; migração até GREEN; RED de actions (sessão, compensação, cleanup); implementação; RED de componente (gating, teclado, rollback); integração; E2E. Fixture Playwright autentica usuário seedado/local, cria prefixo único e limpa DB/Storage por API local; intercepta persistência/Storage e verifica paths removidos/pendentes. E2E cobre CRUD, filtros, imagem sucesso/falha, DnD habilitado/bloqueado, recarga e cleanup. Rodar `npm run test:unit`, SQL local e `npm run test:e2e`.

## Rollout em quatro PRs empilhadas sobre main

1. **Dados e segurança**: migração + SQL/testes RPC. Dep.: nenhuma; a ponte temporária permite rollback do deploy do caller e deve ser removida somente pela contração deferida após a confirmação do rollout.
2. **Actions e Storage**: cliente de sessão, lifecycle e testes. Dep.: 1; rollback mantém migração compatível e não apaga assets referenciados.
3. **UI e rota oficial**: consolidar manager, DnD, redirect e testes de componente. Dep.: 2; rollback restaura somente UI/redirect.
4. **E2E autenticado**: fixture, setup e cenários. Dep.: 3; rollback remove exclusivamente harness de teste.

Cada slice inclui testes, migração forward-only, build e orçamento abaixo de 400 linhas quando possível. Não há perguntas bloqueantes.
