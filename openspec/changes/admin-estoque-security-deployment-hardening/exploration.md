## Exploration: admin-estoque-security-deployment-hardening

### Current State
The requested change spans incident response, database authorization, inventory invariants, catalog ordering, Storage reconciliation, browser coverage, and deployment. The repository is highly dirty, so implementation and deployment must preserve unrelated work and use clean, reviewable stacked-to-main slices.

**Credential exposure.** `scripts/run_migration.mjs` is tracked and unchanged from baseline commit `e542648` (`chore: establish project baseline`). It embeds **two distinct production `service_role` JWT values** for project `xvzdxoktwnzmxsfizkxo`; literals are reused in client/header construction and target an `exec_sql` RPC. The file is reachable from `main` and two local review branches. There are no configured Git remotes or tags, but external clones, backups, copied credentials, and previously configured remotes cannot be disproved. The current repository has one commit touching the file, two reflog tips, two temporary review worktrees, and hundreds of unreachable objects, so deleting the file in a new commit does not remove the credentials from object storage or existing clones. Current Supabase guidance recommends replacing legacy `service_role` JWTs with independently revocable secret API keys after migrating signing/API-key configuration; legacy rotation mechanics depend on the project's signing-key state. Rotation/revocation must occur before history cleanup because rewriting Git does not invalidate credentials.

**Profile authorization.** Migration `20260703210000_epica1_auth_otp.sql` allows a user to update their own `perfis` row with no column restriction, so an authenticated user can submit `funcao` and `ativo` changes. `atualizarPerfilProprio()` only sends `nome`, but that application convention is not a security boundary. Admin/supervisor changes use `atualizarPerfilUsuario()` and a service-role client after session, role, anti-lockout, and minimum-admin checks. RLS controls rows, not changed columns; a compatible fix therefore needs column privileges (self-service can update `nome`, not `funcao`/`ativo`) plus application input narrowing and SQL/API negative tests. The admin service-role path remains compatible, although centralizing it in a narrow audited RPC would provide stronger transactional guarantees.

**Stock invariants.** The authenticated four-argument `ajustar_estoque_atomico` RPC derives the actor from `auth.uid()`, locks the product, updates stock, and inserts the movement in one transaction. Authenticated callers have read-only table grants. However, `src/app/actions/estoque.ts::atualizarProduto()` uses a service-role client and accepts/writes `quantidade_estoque`, bypassing those protections; the edit form always submits the current quantity. `criarProduto()` also inserts initial quantity directly and creates no initial movement. Separately, order confirmation/cancellation in `src/app/actions/pedidos.ts` directly updates stock and inserts movements in application steps, so those flows are auditable on success but not transactionally indivisible. The narrow requested fix can remove stock from generic edits, but the broader “single stock writer” invariant requires deciding whether order flows join this change.

**Ordering.** Admin inventory already orders by `ordem_exibicao ASC NULLS LAST, nome ASC`, and an index exists on `(ordem_exibicao, nome)`. Client catalog (`src/app/cliente/chat/page.tsx`) and Sofía/RAG (`src/lib/ai/openrouter.ts`) consume `buscar_produtos_disponiveis()` / `buscar_produto_por_nome()`, whose latest SQL definitions still use `ORDER BY nome`. `CreateOrderModal` directly queries active products and orders by name. These are the confirmed display consumers requiring change; product lookups by explicit IDs in order actions do not need display ordering. The current main `estoque` spec explicitly says client ordering does not change, so the proposal must modify that existing requirement rather than silently contradict it.

**Image lifecycle.** Versioned upload and compensating cleanup exist. `produto_imagem_cleanup_pendentes` records known failed cleanup paths and retry metadata, and RPCs re-check whether paths are still referenced before deletion. There is no scanner for pre-existing/unknown Storage objects, no queue list/admin execution surface, and no scheduled executor. Product deletion currently attempts Storage deletion first, logs a warning on failure, and still deletes the database row, guaranteeing an unreferenced object on failure. Existing E2E covers session/vendor denial, legacy redirect, CRUD/search/reorder/reload, mobile action reachability, and image persistence compensation. It does not prove Esgotados filtering, movement history, actual six-column desktop geometry, stock/status badge semantics, supervisor access, remove/delete failure behavior, pending retry failure, or general orphan reconciliation.

**Deployment.** `asados-web` is running with restart policy `always`, no container healthcheck, `RestartCount=0`, and an image/container created on July 13. Current source is newer. Compose maps host `3020` to container `3000`; Nginx proxies HTTPS traffic to `127.0.0.1:3020`. There is no application health endpoint. A production build from the dirty working tree would be non-reproducible and unsafe. Local Playwright builds a standalone app against local Supabase; hosted verification must be separated into non-mutating smoke checks unless an isolated production test identity/data namespace and cleanup contract are explicitly approved.

### Affected Areas
- `scripts/run_migration.mjs` — tracked production service-role exposure and ad hoc privileged SQL execution.
- Git refs, reflogs, temporary worktrees, external clones/backups — history-rewrite and credential-reach coordination boundary.
- `supabase/migrations/20260703210000_epica1_auth_otp.sql` plus a new migration — permissive self-update policy and column privileges.
- `src/app/actions/perfil.ts`, `src/app/actions/admin.ts` — safe self-profile input and privileged role/status mutation boundary.
- `src/app/actions/estoque.ts`, `src/components/operator/InventoryManager.tsx` — generic stock bypass, initial quantity behavior, image delete/remove behavior, and cleanup administration.
- `supabase/migrations/20260712164546_admin_products_authenticated_inventory_rpc.sql` plus a new migration — stock RPC/grants and any create-product or protected metadata RPC.
- `src/app/actions/pedidos.ts` — adjacent direct stock writers requiring an explicit scope decision.
- `supabase/migrations/20260712210000_judgment_day_auth_horarios_fixes.sql` plus a new migration — latest product RPC ordering definitions.
- `src/app/cliente/chat/page.tsx`, `src/lib/ai/openrouter.ts` — client catalog and Sofía consumers of product RPC order.
- `src/components/operator/CreateOrderModal.tsx` — direct selector query currently ordered by name.
- `supabase/migrations/20260713110019_admin_product_image_lifecycle.sql` plus a new migration — pending queue extension, claim/retry/report semantics, and scanner support.
- `tests/e2e/admin-products.spec.ts`, `tests/e2e/fixtures/admin-products.ts` — missing roles, states, geometry, history, and cleanup failure paths.
- `tests/unit/estoque-action.test.ts`, profile/action tests, SQL tests — application and database negative-path proof.
- `Dockerfile`, `docker-compose.yml`, a health route, and deployment runbook/scripts — immutable build, healthcheck, recreate, rollback, and smoke gates.
- `openspec/specs/estoque/spec.md`, `openspec/specs/dashboard_admin/spec.md` — current requirements conflict with the new official client order and need security/deployment deltas.

### Approaches
1. **Defense-in-depth transactional boundaries** — use column privileges for safe self-profile fields; narrow authenticated RPCs for privileged profile/product writes; remove quantity from generic edits; create initial stock and its movement atomically; make all display consumers use `ordem_exibicao`; add a dry-run orphan scanner feeding the durable cleanup queue; deploy immutable images with health/rollback gates.
   - Pros: Enforces invariants in PostgreSQL even if UI/actions regress; preserves auditability; gives safe retry and rollback boundaries; supports autonomous PR slices.
   - Cons: Requires several migrations and coordinated expand/contract rollout; order stock writers need a scope decision; more SQL tests are required.
   - Effort: High

2. **Application-only hardening** — remove sensitive fields from TypeScript inputs, change client sort calls, add E2E, and add an admin cleanup action without changing grants/RLS beyond the minimum.
   - Pros: Smaller and faster; fewer migration compatibility concerns.
   - Cons: Does not prevent crafted Data API calls or future service-role regressions; generic stock/profile invariants remain conventions; cleanup concurrency is fragile.
   - Effort: Medium

3. **Automatic scheduled deletion first** — add a scanner and immediately schedule orphan deletion with pg_cron/server automation.
   - Pros: Lowest ongoing operator effort and bounded Storage growth.
   - Cons: Highest destructive-risk profile before false-positive behavior is understood; Storage listing is external to the database; rollback cannot restore deleted objects.
   - Effort: Medium/High

### Recommendation
Use Approach 1, with manual/dry-run cleanup before scheduling. The key contracts should be:

- **Credential incident work unit (not a code PR):** inventory both exposed key fingerprints and every consumer without revealing values; migrate to a new independently revocable Supabase secret key where supported; inject it only through a protected environment/process secret source; revoke both exposed legacy values; validate consumers; then coordinate history rewrite. For this repository, rewrite all three local branches and reflogs, remove/recreate the two temporary worktrees, expire old objects after backups are quarantined, and require any external clone to re-clone. Because no remote is configured, force-push scope is currently unknown and must be established with the owner. Never make history rewrite the mechanism of revocation.
- **Migration execution:** remove the ad hoc `exec_sql` script rather than preserving a generic remote SQL endpoint. Use the repository migration chain through an authenticated Supabase CLI/CI process with secrets supplied by the process environment or secret manager, no command-line literal, no logs, and no committed `.env`. If a wrapper remains, it must fail closed when the environment variable is absent and spawn the supported migration command without printing inherited secrets.
- **Profiles:** revoke table-level `UPDATE` from `authenticated`, grant only the safe self-service columns (currently `nome`, optionally `data_atualizacao` only through the timestamp trigger), retain row ownership RLS, and prove `funcao`/`ativo` updates fail through authenticated Data API calls. Keep admin/supervisor role/status changes behind the existing authorized server boundary or replace it with a narrow audited RPC; application schemas must never accept role/status in self-service payloads.
- **Stock:** remove `quantidade_estoque` from generic update types, schema, payload, and edit UX. Prefer a create-product RPC that inserts the product and, when initial controlled stock is positive, inserts an `entrada` movement with the session actor in the same transaction. Keep later adjustments exclusively through `ajustar_estoque_atomico`. If order confirmation/cancellation are included, introduce dedicated transactional order-stock RPCs rather than pretending the administrative RPC's semantics fit order fulfillment.
- **Ordering:** redefine both product RPCs with `ORDER BY ordem_exibicao ASC NULLS LAST, nome ASC`; change `CreateOrderModal` to the same order; retain the name fallback for deterministic ties and legacy nulls; update SQL/unit/component tests. Client catalog and Sofía inherit the SQL order without additional client sorting.
- **Orphans:** extend the pending queue into a reconciliation model. A scanner lists only `produto-imagens/produtos/`, computes `Storage objects - current four product references - in-flight/recent uploads`, applies an age grace period, and emits a report or queues candidates. Execution must re-check all references immediately before delete, claim rows to prevent concurrent workers, use Storage API `remove` in bounded chunks (maximum 1000), be idempotent, retain failures with attempt/error timestamps, and audit actor/result. Never delete `storage.objects` with SQL. Start with admin-triggered dry-run/report and explicit execution; add scheduling only after production reports are reviewed.
- **E2E boundary:** local authenticated E2E may mutate local Supabase and must cover admin plus supervisor, Esgotados, movement history after `+/-`, distinct status-vs-stock badges (`Ativo/Inativo` versus `OK/Baixo/Esgotado`), six columns at a viewport that actually activates `2xl`, remove/delete compensation failures, pending retry failure/success, scanner dry-run, and fixture cleanup aggregation. Hosted post-deploy checks should be read-only by default: health, login, admin and supervisor inventory access, vendor denial, catalog/Sofía/selector ordering, responsive grid presence, and no console/network errors. Hosted mutation requires a separately approved isolated namespace and guaranteed cleanup.
- **Deployment:** merge the stack in order, create a clean checkout of final `main`, run migration preflight/advisors and local test gates, build an image tagged with commit SHA (never mutable source state), retain the previous image ID/tag, and recreate only `web` with `--no-deps --force-recreate`. Add a lightweight health endpoint and Compose healthcheck. Gate traffic on container health plus direct `:3020` and HTTPS smoke checks. Roll back by recreating `web` from the retained prior image; database migrations must be expand/contract compatible because app rollback cannot safely undo destructive schema changes. Do not auto-run migrations in container startup.

**Stacked-to-main delivery plan (authored additions + deletions, each target <=400):**

1. **PR 1 — Remove privileged migration runner and define secret-safe migration contract** (depends on operational key rotation plan; verification: secret scanner, unit/static assertions, supported CLI dry-run; rollback: restore wrapper code only with environment injection, never old values).
2. **PR 2 — Lock self-profile sensitive columns** (new migration, action schemas, SQL/API tests; verification: own-name update succeeds, self-role/self-active updates fail, admin/supervisor managed update succeeds; rollback: migration restoring prior grants/policy only after accepting the security regression).
3. **PR 3 — Close generic stock edit bypass** (action/UI/unit tests; verification: edit cannot submit/change stock and `+/-` still creates movement; rollback: revert action/UI together).
4. **PR 4 — Make initial stock auditable** (transactional create RPC/migration/action tests; verification: zero initial stock produces defined behavior, positive initial stock and movement share actor/transaction; rollback: retain old create RPC during expand phase until caller is deployed, contract later).
5. **PR 5 — Make `ordem_exibicao` official everywhere** (product RPC migration, selector/client/RAG tests; verification: all three consumers show persisted order with name fallback; rollback: restore prior RPC definitions and selector order).
6. **PR 6 — Add orphan report and safe cleanup queue execution** (scanner/queue SQL and focused tests; verification: referenced/recent objects never queue/delete, stale orphan does, retries are idempotent; rollback: disable executor while retaining records/reporting).
7. **PR 7 — Complete inventory E2E semantics** (admin/supervisor, Esgotados, history, six-column geometry, badges, cleanup failure tests; verification: local Chromium suite and deterministic fixture cleanup; rollback: tests/fixtures only).
8. **PR 8 — Add immutable web deployment health and rollback tooling** (health endpoint, Compose healthcheck, runbook/smoke automation; verification: image build, unhealthy rejection, direct/HTTPS smoke in non-production first; rollback: previous image tag and prior Compose definition).

PR 4 can be omitted only if the business explicitly declares initial quantity to be seed state rather than a stock movement. If order confirmation/cancellation join the invariant, add a separate <=400-line stock-RPC PR between PR 4 and PR 5. Every child targets `main` in order; after each parent merges, rebase/retarget the next so GitHub displays only that autonomous slice.

**Questions that must be answered before proposal:**

1. Must positive initial stock create an `entrada` movement, and what required/default reason should it use?
2. Are order confirmation and cancellation included in the “single transactional stock writer” invariant, or explicitly deferred?
3. Should `buscar_produto_por_nome()` preserve official catalog order among matches, or rank textual relevance first and use official order only as a tie-breaker?
4. What grace period makes an unreferenced image eligible, and must deletion require a second human approval after dry-run?
5. May hosted E2E create temporary production users/products/images, or must production verification remain read-only?
6. Who owns Supabase signing/API-key migration and confirms that both exposed service-role values are revoked?
7. Which external repository copies/remotes/backups exist, who coordinates force-updates/re-clones, and what maintenance window is acceptable for history rewrite?
8. What downtime/rollback objective applies to the web recreate, and which public dependency checks belong in health versus smoke tests?

### Risks
- Two distinct production service-role credentials are present, not one; rotating only one leaves privileged access exposed.
- Git history rewrite is disruptive, cannot recall secrets from unknown clones/backups, and can destroy dirty/untracked work if coordinated poorly.
- The repository has extensive unrelated modifications and untracked files; building or rebasing in place risks contamination and data loss.
- Column RLS alone cannot protect `funcao`/`ativo`; omitting grants/column tests leaves escalation possible.
- Service-role application clients bypass RLS, so database invariants need narrow RPC/privilege boundaries rather than policy-only confidence.
- Product create and order flows expose semantic gaps in the claimed single-writer stock model.
- Automatic orphan deletion can irreversibly delete valid assets if reference checks, grace periods, or concurrent upload handling are wrong.
- A UI class containing `2xl:grid-cols-6` is not proof of six rendered columns; geometry must be asserted at runtime.
- App rollback after an incompatible migration can fail; schema changes must use expand/contract sequencing.
- There is currently no web healthcheck, and hosted mutable E2E could damage production data without an isolated namespace.

### Ready for Proposal
No — the architecture is sufficiently mapped, but the eight product/operational questions above require owner answers. The orchestrator should tell the user that the immediate incident response is independent of proposal work: rotate/revoke both exposed service-role values first, preserve the dirty worktree, and coordinate history cleanup only after reach and ownership are known. Once those decisions are recorded, proceed to `sdd-propose` with forced stacked-to-main delivery and the separate operational incident work unit.
