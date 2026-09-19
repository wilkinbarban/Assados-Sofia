# Apply Progress: Sofia Customer Memory (`fatos_cliente`)

Cumulative progress for `openspec/changes/sofia-customer-memory`. Slices are appended, never
rewritten; earlier entries stay byte-identical.

## Delivery ledger

| Field | Value |
|-------|-------|
| Change | `sofia-customer-memory` |
| Artifact store | `openspec` (native status; session preflight also allows Engram, see persistence note) |
| Delivery strategy | `ask-on-risk` |
| Chain strategy (parent-resolved) | `stacked-to-main` |
| This run | **PR 1 of 10 — Slice 1: schema, constraints, and index set** |
| PR base | `main` |
| Slice forecast | ~215 lines |
| Slice measured | **213 authored lines** (68 migration + 142 suite + 3 harness) |

### Structured status consumed (native, read-only)

Re-consumed before any edit with
`gentle-ai sdd-status sofia-customer-memory --cwd /home/wilkin/proyectos/CRM_Sofia_Manager`:

- `schema: gentle-ai.sdd-status@2`, `store: openspec`, `next: apply`
- `apply: ready`, `verify: ready`, `archive: ready`, `tasks: 0/43 complete`
- `actionContext.mode: repo-local`, `workspaceRoot: /home/wilkin/proyectos/CRM_Sofia_Manager`,
  `allowedEditRoots: [/home/wilkin/proyectos/CRM_Sofia_Manager]`
- `applyState: ready`; no blocked reasons, no notes.

### Review Workload Gate

`tasks.md` carries `Decision needed before apply: Yes`, `Chained PRs recommended: Yes`,
`400-line budget risk: High`, `Chain strategy: pending`. The parent supplied the resolved delivery
path for this run: **`stacked-to-main`, PR 1 of 10, tasks 1–5 only**. Under that authorization the
gate is satisfied without inferring `size:exception`; the forecast table inside `tasks.md` was left
untouched because this phase owns only the task checkboxes.

## Slice 1 — Schema, constraints, and index set (tasks 1–5)

### Completed tasks and persisted checkbox state

Re-read after the final run; `grep -n '^- \[' openspec/changes/sofia-customer-memory/tasks.md`
shows lines 107–111 as `- [x]` and lines 115–176 as `- [ ]`:

- [x] 1. RED — `supabase/tests/sofia_customer_memory.sql` created with the guarded `\if`-include
      prelude, `plan`, shape assertions, and the harness registration.
- [x] 2. GREEN — `supabase/migrations/20260918010000_fatos_cliente_schema.sql` created.
- [x] 3. TRIANGULATE — the bounded auto-approval matrix (21 assertions).
- [x] 4. TRIANGULATE — index set, partial predicates, key reuse, and the ownership-transfer
      invariant (14 assertions).
- [x] 5. REFACTOR — `plan(87)` reconciled exactly, no duplicated assertion, no constraint expressed
      twice, recorded slice size.

### Files changed

| Path | Change | Lines |
|------|--------|-------|
| `supabase/migrations/20260918010000_fatos_cliente_schema.sql` | new | +68 |
| `supabase/tests/sofia_customer_memory.sql` | new | +142 |
| `scripts/run-local-sofia-sql-tests.sh` | suite added to `default_suites`; `usage()` "six" → "seven" | +2 / -1 |
| `openspec/changes/sofia-customer-memory/tasks.md` | tasks 1–5 checked off with in-line evidence | artifact |
| `openspec/changes/sofia-customer-memory/apply-progress.md` | new (this file) | artifact |

No file outside the authorized edit surface was touched. `design.md`, `proposal.md`, and the five
spec artifacts are unmodified. No application (TypeScript) code changed, so no `vitest` surface is
in scope for this slice.

### Schema content delivered (design §4.1/§5/§6.1/§8/§9.1/§14.1)

- 14 columns; `id uuid primary key default gen_random_uuid()`; `estado text not null default 'pendente'`.
- FKs: `cliente_id → public.clientes on delete cascade`, `origem_conversa_id → public.conversas on
  delete set null`, `substitui_id → public.fatos_cliente on delete set null` — exactly three, and
  **`revisado_por` carries none** (asserted as "exactly three foreign keys").
- `ck_fatos_cliente_tipo`, `ck_fatos_cliente_origem`, `ck_fatos_cliente_estado`,
  `ck_fatos_cliente_chave`, the four `valor` checks (`valor_nao_vazio` covering empty/whitespace and
  untrimmed, `valor_tamanho`, `valor_controle`, `valor_invisivel`), `ck_fatos_cliente_confianca`
  (origin rule + `0..1` range), `ck_fatos_cliente_revisao` (reviewer/time pairing), and
  `ck_fatos_cliente_aprovacao` carrying the **`0.85` literal**, excluding `tipo =
  'restricao_alimentar'`, and trusting **only `cliente` and `operador`** (`importado` absent from the
  constraint text).
- `uq_fatos_cliente_vigente` partial unique on `(cliente_id, tipo, chave) where estado in
  ('pendente','aprovado')`, plus the five supporting indexes (`fatos_cliente_prompt`,
  `fatos_cliente_revisao`, `fatos_cliente_auto_aprovados`, `fatos_cliente_origem_conversa`,
  `fatos_cliente_substitui`).
- `enable row level security` **without** `force`, no policy, `revoke all ... from public, anon,
  authenticated, service_role`.
- pt-BR `comment on table`, `comment on column` for `tipo`/`chave`/`valor`/`origem`/`estado`, and
  `comment on constraint` for the two central constraints.
- **No** `alter function ... owner to supabase_admin` statement: `expected_owner_transfers=8` in
  `scripts/run-local-sofia-sql-tests.sh:54` stayed correct and the harness proved it (`owner_transfers_removed=8`).

### TDD Cycle Evidence

| Cycle | Step | Command | Observed result |
|-------|------|---------|-----------------|
| 1 | RED | `bash scripts/run-local-sofia-sql-tests.sh supabase/tests/sofia_customer_memory.sql` | exit 1: `error: staged suite files are missing inside supabase_db_sofia-sql-d7916310 after restaging: missing staged file: /tmp/sofia-sql-suites-sofia-sql-d7916310/supabase/migrations/20260918010000_fatos_cliente_schema.sql` |
| 2 | GREEN | same command | `PASS sofia_customer_memory.sql (assertions=52 failed=0 psql_exit=0)`; `owner_transfers_removed=8` |
| 3 | TRIANGULATE (approval matrix) | same command | `plan(73)`; `PASS sofia_customer_memory.sql (assertions=73 failed=0 psql_exit=0)` |
| 4 | TRIANGULATE (indexes + key reuse) | same command | `plan(87)`; `PASS sofia_customer_memory.sql (assertions=87 failed=0 psql_exit=0)` |
| 5 | REFACTOR (final) | `bash scripts/run-local-sofia-sql-tests.sh` (whole default set) | `summary: suites=7 assertions=286 failed_assertions=0 failing_suites=0` / `all selected suites passed` |

Detail of the RED evidence: the harness stages the suite plus every relative `\ir` target and aborts
when one is missing, so the failure names the absent migration/table rather than reporting zero
assertions. That is the honest RED for a SQL task whose assertion surface cannot exist before the
DDL lands.

### Deviations from the design and from this slice's task text

1. **Guarded prelude covers one migration, not three.** Task 1 asks for the `\if`-include prelude for
   the three new migrations, but the harness preflight requires every `\ir` target to exist
   (`suite_staged_paths`/`ensure_staged_suite`), so including `20260918020000_fatos_cliente_rpcs.sql`
   and `20260918030000_anonymize_fatos_cliente.sql` now would make this slice's own suite
   unrunnable. The two remaining includes join the prelude in Slices 2 and 4, in the same commit
   that creates each file. No behavior of the finished change is affected.
2. **Index predicates asserted through `pg_get_indexdef` over `pg_index`, not `has_index`.** The
   repository's pgTAP image has no `has_index` usage anywhere, and `has_index` cannot express a
   partial predicate (`where estado = 'aprovado' and tipo <> 'observacao'`), which is precisely what
   task 4 requires. The exact index-name set, the uniqueness of `uq_fatos_cliente_vigente`, and every
   partial predicate are asserted instead; the ownership-transfer invariant is asserted by the
   harness itself (`owner_transfers_removed=8`, a hard failure when it drifts).
3. **`confianca numeric(3,2)` rounding boundary — recorded for verify, not silently accepted.**
   `numeric(3,2)` (proposal data shape) rounds an incoming `0.845…0.849` up to a stored `0.85`, which
   then satisfies `ck_fatos_cliente_aprovacao`. The stored value is at/above the bound, so the
   invariant "no stored approved fact below 0.85" holds, and the 0.84/0.85 scenarios pass exactly as
   specified. If the change wants the model's unrounded confidence to be the decision input, the
   column scale must change in a later migration. Slice 5 owns the extraction-side confidence and is
   the natural place to decide.
4. **`tasks.md` forecast table left as-is** (`Chain strategy: pending`, budget risk High): the parent
   supplied `stacked-to-main`, and this phase owns only the task checkboxes.

### Remaining tasks (unchanged, still unchecked)

38 unchecked tasks, `openspec/changes/sofia-customer-memory/tasks.md` lines 115–176
(`grep -n '^- \[ \]' openspec/changes/sofia-customer-memory/tasks.md` reproduces them exactly):

- Slice 2 — backend RPCs: tasks 6–10 (`supabase/migrations/20260918020000_fatos_cliente_rpcs.sql`).
- Slice 3 — operator/owner RPCs, grants, isolation: tasks 11–14 (same RPC migration file).
- Slice 4 — LGPD anonymization extension: tasks 15–18.
- Slice 5 — gate, helpers, extraction, deploy defaults: tasks 19–23.
- Slice 6 — worker post-completion hook: tasks 24–27.
- Slice 7 — approved-facts prompt block: tasks 28–31.
- Slice 8 — operator authorization move and review actions: tasks 32–35.
- Slice 9 — operator facts panel and `fatos` tab: tasks 36–39.
- Slice 10 — client facts section in `/cliente/perfil`: tasks 40–43.

Nothing was started in Slice 2 or later: no RPC migration, no TypeScript, no panel, no commit.

### Chain context (chained-pr / work-unit-commits contract)

Strategy `stacked-to-main`; one deliverable work unit per PR; tests and the harness registration stay
with the unit they verify. Chain order and boundary:

```text
main
 └── PR 1 (tasks 1-5)  📍 current  — schema, constraints, index set (~215 forecast / 213 measured)
      ├── PR 2 (tasks 6-10)   backend RPCs: write path + prompt read        depends on PR 1
      ├── PR 3 (tasks 11-14)  operator/owner RPCs, grants, isolation        depends on PR 2
      ├── PR 4 (tasks 15-18)  LGPD anonymization extension                 depends on PR 1
      ├── PR 5 (tasks 19-23)  gate + helpers + extraction + deploy defaults depends on PR 2
      ├── PR 6 (tasks 24-27)  worker post-completion hook                  depends on PR 5
      ├── PR 7 (tasks 28-31)  approved-facts prompt block                  depends on PR 3,5
      ├── PR 8 (tasks 32-35)  operator auth move + review actions          depends on PR 3
      ├── PR 9 (tasks 36-39)  operator facts panel + `fatos` tab           depends on PR 8
      └── PR 10 (tasks 40-43) client facts section in `/cliente/perfil`     depends on PR 3
```

- **Current PR**: 1 of 10, base `main`, ends at task 5. Out of scope for this PR: every task 6-43,
  all TypeScript, the RPC and anonymization migrations, and any commit.
- **Follow-up**: PR 2 (Slice 2, tasks 6-10) is the next slice and is the first to add functions to
  `20260918020000_fatos_cliente_rpcs.sql` and to extend the suite's guarded prelude.
- **Dependency note for reviewers**: PR 1 has no producer and no reader of its own. The table is
  additive and inert until the RPC migration (PR 2) and the gate (PR 5) exist, so it can land first
  and be reverted alone.
- **Review budget**: 213 authored additions+deletions (68 migration + 142 suite + 3 harness) against
  the 400-line budget; no `size:exception` is requested or needed.
- **Verification plan**: `bash scripts/run-local-sofia-sql-tests.sh supabase/tests/sofia_customer_memory.sql`
  (slice proof) and `bash scripts/run-local-sofia-sql-tests.sh` (whole default set, proves the new
  migration is inert for the six pre-existing suites and keeps `owner_transfers_removed=8`).
- **Runtime boundary**: this slice's harness is a **real** runtime boundary, not `N/A` — the pgTAP
  suite executes inside the harness's disposable local Supabase Postgres. There is no application
  runtime boundary in this slice because no application code changed.
- **Uncommitted**: the parent forbade committing; the unit is left in the working tree with the
  rollback boundary above stated independently of any commit.

### Workload / PR boundary

- PR 1 of 10 delivers exactly the schema slice; its rollback boundary is
  `20260918010000_fatos_cliente_schema.sql` plus the suite registration (reverting the migration
  removes the table, the constraints, and the indexes; no runtime behavior depends on it while the
  gate of Slice 5 does not exist yet).
- Measured PR-1 code diff: **213 lines** — at the ~215 forecast, 187 lines under the 400-line
  review budget. No `size:exception` is needed or requested.
- Files that must stay with this slice: the migration and its suite (the suite is the slice's only
  proof) and the harness registration that makes the suite part of the default run.

### Verification still owed by later phases

- Slice 1 has no `vitest` surface; the pgTAP harness is its runner, and it ran for real here
  (TAP output validated by the harness's own TAP::Parser).
- The account for later slices continues in this file, cumulatively.

## Slice 2 — Backend RPCs: write path and prompt read (tasks 6–10)

Appended cumulatively; the Slice 1 section above is untouched.

### Delivery ledger (this run)

| Field | Value |
|-------|-------|
| Change | `sofia-customer-memory` |
| Artifact store | `openspec` (native status is the lifecycle authority; no Engram write in this run) |
| Delivery strategy | `ask-on-risk` |
| Chain strategy (parent-resolved) | `stacked-to-main` |
| This run | **PR 2 of 10 — Slice 2: backend RPCs (write path + prompt read)** |
| PR base | `main` (chain; Slice 1 commit `5665370` is the parent work unit) |
| Slice forecast | ~205 lines |
| Slice measured | **263 authored lines** (140 migration + 122 suite additions + 1 plan line) |

### Structured status consumed (native, read-only)

Re-consumed before any edit with
`gentle-ai sdd-status sofia-customer-memory --cwd /home/wilkin/proyectos/CRM_Sofia_Manager`:

- `schema: gentle-ai.sdd-status@2`, `store: openspec`, `next: apply`
- `apply: ready`, `verify: ready`, `archive: ready`, `tasks: 5/43 complete`
- `actionContext.mode: repo-local`, `workspaceRoot: /home/wilkin/proyectos/CRM_Sofia_Manager`,
  `allowedEditRoots: [/home/wilkin/proyectos/CRM_Sofia_Manager]`
- `applyState: ready`; no blocked reasons, no notes.

### Review Workload Gate

`tasks.md` carries `Decision needed before apply: Yes`, `Chained PRs recommended: Yes`,
`400-line budget risk: High`, `Chain strategy: pending`. The parent supplied the resolved delivery
path for this run: **`stacked-to-main`, PR 2 of 10, tasks 6–10 only**. Under that authorization the
gate is satisfied without inferring `size:exception`; the forecast table inside `tasks.md` was left
untouched because this phase owns only the task checkboxes.

### Completed tasks and persisted checkbox state

Re-read after the final run; `grep -nE '^- \[[x ]\] ([0-9]+)\.' openspec/changes/sofia-customer-memory/tasks.md`
shows lines 107–111 (tasks 1–5) and lines 115–119 (tasks 6–10) as `- [x]`, and lines 123–176
(tasks 11–43) as `- [ ]`:

- [x] 6. RED — failing assertions for both backend functions, their ACLs, `prosecdef`/empty
      `search_path`, and the prompt-read semantics.
- [x] 7. GREEN — `supabase/migrations/20260918020000_fatos_cliente_rpcs.sql` created, plus its
      guarded `\ir` include in the same step.
- [x] 8. TRIANGULATE — provenance precedence, idempotent replay, supersession, and the same-key
      race through `dblink`.
- [x] 9. TRIANGULATE — refusal durability at `confianca = 1.00`.
- [x] 10. REFACTOR — no requested approval state, runtime table denial, `plan(146)` reconciled.

### Files changed

| Path | Change | Lines |
|------|--------|-------|
| `supabase/migrations/20260918020000_fatos_cliente_rpcs.sql` | new (two functions, comments, grants) | +140 |
| `supabase/tests/sofia_customer_memory.sql` | `dblink` extension + `to_regprocedure` guard + 59 new assertions, `plan(87)` → `plan(146)` | +122 / -1 |
| `openspec/changes/sofia-customer-memory/tasks.md` | tasks 6–10 checked off with in-line evidence | artifact |
| `openspec/changes/sofia-customer-memory/apply-progress.md` | this cumulative Slice 2 section | artifact |

No file outside the authorized edit surface was touched. `design.md`, `proposal.md`, the five spec
artifacts, the Slice 1 migration, and all application (TypeScript) code are unmodified.

### RPC content delivered (design §4.1, §4.7, §4.8, §9.2, §12.1, §12.2)

`registrar_fato_cliente(uuid,text,text,text,text,uuid,numeric,boolean)` returns
`table(fato_id uuid, estado text, substituido_id uuid)`:

- **No `p_estado` parameter.** The only state input is `p_forcar_pendente`, and the `case` derives
  `estado` exactly as §4.1 states; `ck_fatos_cliente_aprovacao` remains the sole authority for the
  `0.85` threshold and the `restricao_alimentar` exclusion.
- **Validation order** is authority (`42501 SOFIA_FATO_SERVICE_ROLE_REQUIRED`, checked through the
  `auth.jwt()` role exactly like `enqueue_sofia_inbound_message`) → argument shape
  (`22023 SOFIA_FATO_ENTRADA_INVALIDA` for the five enums/regex/value rules,
  `22023 SOFIA_FATO_CONFIANCA_INVALIDA`, `22023 SOFIA_FATO_CONVERSA_INVALIDA`) → existence
  (`P0002 SOFIA_FATO_CLIENTE_NAO_ENCONTRADO`). Every message is a bare `SOFIA_*` token with no
  custom `details`.
- **Concurrency** is
  `pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_cliente_id::text || '|' || p_tipo || '|' || p_chave, 91423))`
  followed by `select ... for update` on the live row.
- **Precedence** (§12.1) is rank `cliente=4 > operador=3 > importado=2 > ia=1`: a strictly lower
  rank returns the live row unchanged with `substituido_id = null` and writes nothing; equal rank
  with an identical `valor` is an idempotent no-op; otherwise the predecessor becomes `substituido`
  and the successor links it through `substitui_id`.
- **Refusal durability** (§12.2) forces `pendente` for an `ia` candidate whose normalized value
  matches an existing `rejeitado` row for the key when no live row exists; the refused row is never
  superseded.

`buscar_fatos_para_prompt(uuid,integer)` returns `table(tipo text, chave text, valor text)`:
service-role only, `p_limite` outside `1..20` → `22023`, `estado = 'aprovado' and tipo <> 'observacao'`,
`order by tipo, chave`, and an **unknown customer returns an empty set rather than `P0002`**.

Both functions are `language plpgsql security definer set search_path = ''` with fully qualified
references, pt-BR `comment on function`, and the exact §9.2 block
(`revoke all ... from public, anon, authenticated, service_role` then `grant execute ... to service_role`).
No `alter function ... owner to supabase_admin` was added, so `expected_owner_transfers=8` still holds
and the harness's own assertion proved it during the full run.

### TDD Cycle Evidence

| Cycle | Step | Command | Observed result |
|-------|------|---------|-----------------|
| 1 | RED (task 6) | `bash scripts/run-local-sofia-sql-tests.sh supabase/tests/sofia_customer_memory.sql` | exit 1: `plan(117)`, psql exit 3, `ERROR: function public.registrar_fato_cliente(unknown, ...) does not exist`, 11 `not ok` throws_ok assertions, `parse problem: Bad plan.  You planned 117 tests but ran 98`, `summary: suites=1 assertions=98 failed_assertions=11 failing_suites=1` |
| 2 | GREEN (task 7) | same command | `PASS sofia_customer_memory.sql (assertions=117 failed=0 psql_exit=0)` |
| 3 | TRIANGULATE (task 8) | same command | first attempt failed honestly: `ERROR: SOFIA_FATO_CLIENTE_NAO_ENCONTRADO` on the owner dblink connection, because a dblink session cannot see the suite's single uncommitted transaction; after creating the race customer in autocommit from the owner connection: `plan(136)`; `PASS sofia_customer_memory.sql (assertions=136 failed=0 psql_exit=0)` |
| 4 | TRIANGULATE (task 9) | same command | `plan(142)`; `PASS sofia_customer_memory.sql (assertions=142 failed=0 psql_exit=0)` |
| 5 | REFACTOR (task 10) | `bash scripts/run-local-sofia-sql-tests.sh` (whole default set) | `PASS sofia_customer_memory.sql (assertions=146 failed=0 psql_exit=0)`; `summary: suites=7 assertions=345 failed_assertions=0 failing_suites=0` / `all selected suites passed` |

The `plan(N)` values are the reconciled ones the suite actually executes (TAP::Parser checks
plan == tests, so a mismatch fails the run). The TypeScript runner (`vitest`) is **not** an evidence
surface for this slice: no application file changed, so no `vitest` command was run and none is claimed.

### Deviations from the design and from this slice's task text

1. **Guarded prelude include added in task 7, not task 6.** The harness stages the suite plus every
   relative `\ir` target and aborts in preflight when one is missing, so the include could not exist
   before the migration file did. Task 6's RED was therefore run against the suite-assertions-only
   state (the functions were genuinely absent, and the failure names them), and task 7 added the file
   and its include together. The include is guarded by
   `select not to_regprocedure('public.registrar_fato_cliente(uuid,text,text,text,text,uuid,numeric,boolean)') is not null`,
   the analogue of the Slice 1 `to_regclass` guard, so the self-hosted runner still replays it while
   the disposable local run skips it.
2. **The dblink race fixture is created by the owner connection.** The suite runs as one
   `begin ... rollback` transaction, and its `clientes` fixtures are invisible to other sessions, so
   `f1000000-…-0004` ("Corrida Concorrente") is inserted by the owner dblink connection in
   autocommit before `begin`, and the customer insert is not part of the assertion count. The first
   attempt with the uncommitted Slice 1 customer failed with
   `SOFIA_FATO_CLIENTE_NAO_ENCONTRADO`; that failure is recorded above rather than hidden.
3. **`p_forcar_pendente = null` is treated as false**, because the design's `case` expression is
   implemented verbatim (`when p_forcar_pendente then …` and a `NULL` condition never matches). No
   new error path was invented for it and no assertion claims one.
4. **Task 10 added four executable confirmation assertions** instead of a prose-only confirmation:
   `p_forcar_pendente = true` on a trusted origin lands `pendente`, the writer definition contains no
   `p_estado`, and a live `select * from public.fatos_cliente` is denied with `42501` for
   `authenticated` and for `service_role`. The catalog-level `table_privs_are` assertions from Slice 1
   remain the schema proof; these add the behavioral one.
5. **The refused row used by task 9 is produced by a raw `update ... set estado='rejeitado'`**, because
   `revisar_fato_cliente` is owned by Slice 3. The transition is exactly the one that function will
   perform (rejection keeps the row and frees the key), and it is labelled as such in the suite.
6. **`confianca numeric(3,2)` rounding still applies** to `p_confianca` (Slice 1 deviation 3):
   an incoming `0.845…0.849` is stored as `0.85`. Task 9's `1.00` and every other asserted value are
   exact at scale 2, so no assertion depends on the rounding. Slice 5 owns the extraction-side
   confidence and the decision to change the column scale.
7. **Measured size 263 lines, above the ~205 forecast.** The extra lines are the two function bodies
   with their pt-BR comments and the 59 assertions that make provenance precedence, refusal
   durability, and the race verifiable. It is inside the 400-line budget, so no `size:exception`
   is requested and no code was compressed to reach the forecast.

### Remaining tasks (unchanged, still unchecked)

33 unchecked tasks, `openspec/changes/sofia-customer-memory/tasks.md` lines 123–176
(`grep -n '^- \[ \]' openspec/changes/sofia-customer-memory/tasks.md` reproduces them exactly):

- Slice 3 — operator/owner RPCs, grants, isolation: tasks 11–14 (same RPC migration file).
- Slice 4 — LGPD anonymization extension: tasks 15–18.
- Slice 5 — gate, helpers, extraction, deploy defaults: tasks 19–23.
- Slice 6 — worker post-completion hook: tasks 24–27.
- Slice 7 — approved-facts prompt block: tasks 28–31.
- Slice 8 — operator authorization move and review actions: tasks 32–35.
- Slice 9 — operator facts panel and `fatos` tab: tasks 36–39.
- Slice 10 — client facts section in `/cliente/perfil`: tasks 40–43.

The five operator/owner functions of Slice 3 were **not** started: the migration file contains exactly
the two backend functions, and no operator gate, owner resolution, or `authenticated` grant exists yet.

### Chain context (chained-pr / work-unit-commits contract)

Strategy `stacked-to-main`; one deliverable work unit per PR; the migration and the assertions that
prove it stay in the same unit. Chain order and boundary:

```text
main
 └── PR 1 (tasks 1-5)  ✅ landed 5665370 — schema, constraints, index set
      └── PR 2 (tasks 6-10)  📍 current  — backend RPCs: write path + prompt read
           ├── PR 3 (tasks 11-14)  operator/owner RPCs, grants, isolation      depends on PR 2
           ├── PR 4 (tasks 15-18)  LGPD anonymization extension                 depends on PR 1
           ├── PR 5 (tasks 19-23)  gate + helpers + extraction + deploy defaults depends on PR 2
           ├── PR 6 (tasks 24-27)  worker post-completion hook                  depends on PR 5
           ├── PR 7 (tasks 28-31)  approved-facts prompt block                  depends on PR 3,5
           ├── PR 8 (tasks 32-35)  operator auth move + review actions          depends on PR 3
           ├── PR 9 (tasks 36-39)  operator facts panel + `fatos` tab           depends on PR 8
           └── PR 10 (tasks 40-43) client facts section in `/cliente/perfil`     depends on PR 3
```

- **Current PR**: 2 of 10, based on the Slice 1 work unit, ends at task 10. Out of scope for this PR:
  every task 11–43, all TypeScript, the anonymization migration, and any commit.
- **Follow-up**: PR 3 (Slice 3, tasks 11–14) extends the same RPC migration file with the five
  operator/owner functions and their `authenticated` grants, and appends their assertions to the same
  suite; it owns the `revisar_fato_cliente` transition that Slice 2 simulates with a raw update.
- **Rollback boundary**: reverting `20260918020000_fatos_cliente_rpcs.sql` leaves the table, the
  constraints, and the indexes intact and simply removes the only access surface, so the change
  returns to the inert state of PR 1. No runtime behavior depends on these functions while the
  Slice 5 gate does not exist.
- **Review budget**: 263 authored additions/deletions (140 migration + 122 suite + 1 plan line)
  against the 400-line budget; no `size:exception` is requested or needed.
- **Uncommitted**: the parent forbade committing; the unit is left in the working tree.

## Slice 3 — Operator and owner RPCs, grants, isolation (tasks 11–14)

Appended cumulatively; the Slice 1 and Slice 2 sections above are untouched.

### Delivery ledger (this run)

| Field | Value |
|-------|-------|
| Change | `sofia-customer-memory` |
| Artifact store | `openspec` (native status is the lifecycle authority; no Engram write in this run) |
| Delivery strategy | `ask-on-risk` |
| Chain strategy (parent-resolved) | `stacked-to-main` |
| This run | **PR 3 of 10 — Slice 3: five operator/owner RPCs + grants + isolation** |
| PR base | `main` (chain; Slice 2 commit `a794fb9` is the parent work unit) |
| Slice forecast | ~205 lines |
| Slice measured | **452 changed lines** (254 migration + 197 suite additions + 1 deletion) |

### Structured status consumed (native, read-only)

Re-consumed before any edit with
`gentle-ai sdd-status sofia-customer-memory --cwd /home/wilkin/proyectos/CRM_Sofia_Manager`:
`schema: gentle-ai.sdd-status@2`, `store: openspec`, `next: apply`, `apply: ready`,
`actionContext.mode: repo-local`, `allowedEditRoots: [/home/wilkin/proyectos/CRM_Sofia_Manager]`,
`applyState: ready`, `tasks: 10/43 complete`; no blocked reasons, no notes.

### Review Workload Gate — decision required

`tasks.md` carries `Decision needed before apply: Yes`, `Chained PRs recommended: Yes`,
`400-line budget risk: High`, `Chain strategy: pending`; the parent resolved `stacked-to-main` and
scoped this run to tasks 11–14. **The measured slice is 452 changed lines — 13% above the 400-line
budget and well above the ~205 forecast.** The overage is honest work, not padding:

- the migration adds **five** functions (the slice forecast ~205 for a slice that actually holds
  five RPCs plus their pt-BR comments and per-function `revoke`/`grant` blocks);
- the suite adds **76 assertions** because task 13 mandates the full ACL matrix
  (5 signatures × 3 roles), the complete §4.8 token set, both-way owner isolation, and the seven
  assertions that prove `corrigir`'s in-place semantics; the ACL matrix alone is 15 lines that
  cannot be dropped without losing the "per function signature, per role" requirement.

No comments, blank lines, docs, or tests were deleted to reach a number, and the code was not
restyled. Under `ask-on-risk` this is a delivery decision the parent must raise: accept
`size:exception` for PR 3, or split Slice 3 into an operator-surface PR and an owner-surface PR.

### Completed tasks and persisted checkbox state

Re-read after the final runs; `grep -oE '^- \[[x ]\] [0-9]+\.' openspec/changes/sofia-customer-memory/tasks.md`
shows tasks 1–14 as `- [x]` and tasks 15–43 as `- [ ]`:

- [x] 11. RED — failing assertions for all five functions (operator gate, four-state listing with
      provenance and order, review decisions, owner read/correction/refusal, error tokens).
- [x] 12. GREEN — the five functions added to `supabase/migrations/20260918020000_fatos_cliente_rpcs.sql`.
- [x] 13. TRIANGULATE — ACL matrix, `prosecdef`/empty `search_path`, §4.8 token matrix, anonymous
      rejection on every owner function, two-way owner isolation, reviewed-refusal shape parity.
- [x] 14. REFACTOR — shared advisory-key-lock expression proven by assertion, RLS enabled without
      `force`, `plan(222)` reconciled.

### Files changed

| Path | Change | Lines |
|------|--------|-------|
| `supabase/migrations/20260918020000_fatos_cliente_rpcs.sql` | + five operator/owner functions, pt-BR comments, `revoke`/`grant` | +254 |
| `supabase/tests/sofia_customer_memory.sql` | + `auth`/`perfis` fixtures, 76 assertions, `plan(146)` → `plan(222)` | +197 / -1 |
| `openspec/changes/sofia-customer-memory/tasks.md` | tasks 11–14 checked off with in-line evidence | artifact |
| `openspec/changes/sofia-customer-memory/apply-progress.md` | this cumulative Slice 3 section | artifact |

No file outside the authorized edit surface was touched. `design.md`, `proposal.md`, the five spec
artifacts, the Slice 1 migration, and all application (TypeScript) code are unmodified. No commit
was created.

### RPC content delivered (design §4.2–§4.6, §4.8, §9.2)

- `listar_fatos_cliente(uuid,text[],integer)` — operator gate via `public.tem_funcoes`
  (`admin`/`supervisor`/`vendedor`), all four states with provenance, `order by estado,
  atualizado_em desc`, `p_limite` validated in `1..500`, `p_estados` validated against the enum,
  unknown customer → `P0002 SOFIA_FATO_CLIENTE_NAO_ENCONTRADO`.
- `revisar_fato_cliente(uuid,text,text)` — `aprovar`/`rejeitar` keep `confianca`; `corrigir` stores
  the normalized value and sets `confianca = null`; all three record `revisado_por`/`revisado_em`;
  `rejeitado`/`substituido` → `22023 SOFIA_FATO_NAO_REVISAVEL`; unknown id →
  `P0002 SOFIA_FATO_NAO_ENCONTRADO`.
- `meus_fatos_cliente(integer)` — resolves the owner through `clientes.usuario_id = auth.uid()`,
  `42501 SOFIA_FATO_NAO_AUTENTICADO` when anonymous, approved non-`observacao` only, narrow
  projection (`fato_id, tipo, chave, valor, origem, criado_em, atualizado_em`).
- `corrigir_meu_fato_cliente(uuid,text)` — **in-place update, not a supersession**: sets
  `origem='cliente'`, `estado='aprovado'`, `confianca=null`, `origem_conversa_id=null`, leaves
  `revisado_por`/`revisado_em` untouched; `P0002` for a non-approved own fact and for a missing id,
  `42501 SOFIA_FATO_NAO_EXPOSTO` for an own `observacao`, `42501 SOFIA_FATO_NAO_AUTORIZADO` for
  another customer's fact.
- `recusar_meu_fato_cliente(uuid)` — `estado='rejeitado'`, retains the row, leaves `origem`,
  `confianca`, and `origem_conversa_id` unchanged; same ownership/`observacao` refusals.

Grants follow design §9.2 exactly: `grant execute ... to authenticated` only for the five;
`service_role` receives **no** EXECUTE on any operator/owner function; `anon`/`public` receive
nothing anywhere. All seven functions are `prosecdef` with an empty `search_path`. The migration
adds no `alter function ... owner to supabase_admin`, so `expected_owner_transfers=8` still holds.

### Slice 2 consistency check (parent note honoured)

Slice 2 simulated a refusal with a raw `update` because `revisar_fato_cliente` did not exist.
Slice 3 now produces a refusal through `revisar_fato_cliente` (`revisar_recusa`, `origem='operador'`,
`origem_conversa_id` set, `confianca` null) and asserts the same row shape Slice 2 expects:
`estado='rejeitado'`, `origem`/`confianca`/`origem_conversa_id` unchanged, exactly one rejected row,
zero superseded rows. The two paths cannot drift silently.

### TDD Cycle Evidence

**Sanctioned runner unavailable (honest limitation).**
`bash scripts/run-local-sofia-sql-tests.sh supabase/tests/sofia_customer_memory.sql` was attempted
three times and failed before any suite ran:
`error: disposable local Supabase failed to start` with `supabase_realtime/storage/pg_meta ...
unhealthy` and `supabase_studio ... starting` (host has ~3 GB RAM free and 27 containers already
running). This is reported as an **unmet evidence surface**, not a pass.

Because the slice's core is SQL, the RED/GREEN cycles were executed on the same upstream image the
harness uses (`public.ecr.aws/supabase/postgres:17.6.1.143`) with a minimal faithful scaffolding for
the objects the migrations reference (`auth.jwt()`, `public.tipo_funcao`, `public.perfis`,
`public.tem_funcoes`, `public.clientes`, `public.conversas`), the repo's real suite and real
migrations, and the harness's own psql flags:

`docker exec sofia-static-check psql --no-psqlrc --quiet --tuples-only --no-align --pset pager=off -v ON_ERROR_STOP=1 -d "postgresql://postgres:postgres@127.0.0.1:5432/postgres" -v runtime_dblink_conninfo=... -f /tmp/check/supabase/tests/sofia_customer_memory.sql`

| Cycle | Step | Migration staged | Observed result |
|-------|------|------------------|-----------------|
| 1 | RED (task 11) | slice-2-only (`git show HEAD:...`) | `1..222`, `ok=146`, `not ok=8`, psql exit 3, abort on `42883 function public.listar_fatos_cliente(unknown, unknown, integer) does not exist` |
| 2 | GREEN (task 12) | full slice-3 migration | `1..222`, `ok=222`, `not ok=0`, psql exit 0 |
| 3 | TRIANGULATE (task 13) | full | all ACL/provenance/isolation assertions inside the 222 pass |
| 4 | REFACTOR (task 14) | full | `plan(222)` equals the 222 executed assertions; final re-run `ok=222`, `not ok=0`, exit 0 |

The `plan(N)` values are the reconciled ones the suite actually executes; a plan/test mismatch would
have failed both the psql run and the harness's TAP::Parser. TypeScript `vitest` is **not** an
evidence surface for this slice: no application file changed.

**Three real defects the scratch runner caught and the suite now fixes** (recorded rather than
hidden): (1) `WITH ORDINALITY` cannot take a column definition list — rewritten as `with ordinality
as t` with `t.ordinality`; (2) direct `select`s on `public.fatos_cliente` inside the
`set local role authenticated` blocks were correctly denied — function calls now run as
`authenticated` and row inspections run after `reset role`; (3) an undefined `f2_id` psql variable
and untyped `:'var'` values (fixed with `::text`). Without a runner these would have shipped broken.

### Deviations from the design and from this slice's task text

1. **`meus_fatos_cliente` follows the §4.4 SQL signature (7 columns incl. `atualizado_em`), not the
   §4.4 prose**, which lists `atualizado_em` among the omitted columns while the signature includes
   it. The explicit signature was treated as authoritative; the test asserts the internal review
   chain (`confianca`, `revisado_por`, `revisado_em`, `substitui_id`, `origem_conversa_id`) is
   absent and does not assert `atualizado_em` absent. Flagged for verify/archive.
2. **The advisory-key-lock expression is kept byte-identical inline in both write paths** rather
   than factored into a helper, because PostgreSQL has no shared-expression macro and an extra
   `SECURITY DEFINER` helper would widen the spec's declared seven-function surface. An assertion
   proves `revisar_fato_cliente` and `registrar_fato_cliente` both carry
   `pg_catalog.hashtextextended(..., 91423)`, which is the property that matters for serialization.
   The same reasoning applies to the repeated value predicate: PostgreSQL cannot share it without a
   helper, so it is repeated verbatim (no divergent copy).
3. **Owner gate tests split calls and inspections across `reset role`.** `authenticated` correctly
   holds no table privilege, so the suite calls the RPCs as `authenticated` and inspects rows as the
   owner. This is fidelity to design §9.1, not a workaround.
4. **The sanctioned harness did not run.** The scratch runner is an equivalent PostgreSQL 17.6
   image with minimal scaffolding, not the repository harness; the whole default-suite regression
   run (`bash scripts/run-local-sofia-sql-tests.sh`) could not be executed and is owed.
5. **`tasks.md` forecast table left as-is**; this phase owns only the task checkboxes.

### Remaining tasks (still unchecked)

29 unchecked tasks, `grep -oE '^- \[ \] [0-9]+\.'` reproduces them: Slice 4 (15–18), Slice 5
(19–23), Slice 6 (24–27), Slice 7 (28–31), Slice 8 (32–35), Slice 9 (36–39), Slice 10 (40–43).

### Chain context (chained-pr / work-unit-commits contract)

```text
main
 └── PR 1 (tasks 1-5)  ✅ landed 5665370 — schema, constraints, index set
      └── PR 2 (tasks 6-10)  ✅ landed a794fb9 — backend RPCs
           └── PR 3 (tasks 11-14)  📍 current  — operator/owner RPCs, grants, isolation
                ├── PR 4 (tasks 15-18)  LGPD anonymization extension                 depends on PR 1
                ├── PR 5 (tasks 19-23)  gate + helpers + extraction + deploy defaults depends on PR 2
                ├── PR 6 (tasks 24-27)  worker post-completion hook                  depends on PR 5
                ├── PR 7 (tasks 28-31)  approved-facts prompt block                  depends on PR 3,5
                ├── PR 8 (tasks 32-35)  operator auth move + review actions          depends on PR 3
                ├── PR 9 (tasks 36-39)  operator facts panel + `fatos` tab           depends on PR 8
                └── PR 10 (tasks 40-43) client facts section in `/cliente/perfil`     depends on PR 3
```

- **Current PR**: 3 of 10, based on the Slice 2 work unit, ends at task 14. Out of scope for this
  PR: every task 15–43, all TypeScript, the anonymization migration, and any commit.
- **Follow-up**: PR 4 (Slice 4, tasks 15–18) and PR 5 (Slice 5, tasks 19–23) are unblocked by this
  PR only where they already depended on PR 1/2; PR 7 and PR 8 now depend on PR 3.
- **Rollback boundary**: reverting the slice-3 additions to `20260918020000_fatos_cliente_rpcs.sql`
  removes the five functions and their grants and returns the change to the PR 2 state; the table,
  its constraints, its indexes, the two backend functions, and the suite's Slice 1/2 assertions are
  untouched.
- **Review budget**: 452 changed lines against the 400-line budget. A `size:exception` is required,
  or Slice 3 must be split (operator surface vs owner surface).
- **Uncommitted**: the parent forbade committing; the unit is left in the working tree.

### Workload / PR boundary

- PR 3 of 10 delivers exactly the operator/owner RPC slice. The unit is cohesive: the five functions,
  their grants, and the assertions that prove them cannot be separated without leaving either an
  unverified authorization surface or a test file whose plan does not match its content.
- Measured PR-3 code diff: **452 lines** (254 migration + 197 suite additions + 1 deletion).
- Runtime boundary: the scratch PostgreSQL 17.6 runner executed the suite for real (222 assertions,
  TAP-shaped output validated by hand); the repository harness boundary is **owed**.

### Slice 3 — review budget exception and evidence status (parent, 2026-09-18)

**Accepted exception.** Slice 3 measured **452 changed lines** (254 migration + 197 suite + 1 deletion)
against the 400-line review budget, 13% over, and far above the ~205 forecast. The user explicitly
accepted `size:exception` for this slice. The overage is honest work rather than padding: five RPCs
plus a 76-assertion block, of which 15 assertions are the mandated per-signature ACL matrix
(5 signatures x 3 roles). No comment, test, or code was deleted or compressed to reach a smaller
number.

**Sanctioned evidence obtained.** The repository harness did run for this slice:

    bash scripts/run-local-sofia-sql-tests.sh supabase/tests/sofia_customer_memory.sql
    -> PASS sofia_customer_memory.sql (assertions=222 failed=0 psql_exit=0)

**Unmet evidence surface — full-set regression.** The harness's readiness gate is currently flaky on
this host and aborts `supabase start` on a different container each attempt (`storage`, `realtime`,
`studio`, `pg_meta`). Seven attempts produced exactly one successful start. Container logs show the
services themselves starting successfully — for example storage logs
`Server listening at http://127.0.0.1:5000` and `[Server] Started Successfully` while the Docker
healthcheck still reports `unhealthy` — so the failure is in the readiness race, not in the services.
The whole default suite set was therefore **not** re-run for this slice, and no claim is made that it
is green. Re-run `bash scripts/run-local-sofia-sql-tests.sh` once the host is quieter; the regression
surface is narrow, since this slice only appends functions to one migration and assertions to one
suite, and no other suite references `fatos_cliente`.

**Environment note.** This repository is the production deployment checkout: the running
`asados-supabase` compose project resolves to `ops/supabase/docker-compose.yml` in this very
directory, and 27 production containers share the host with the disposable harness. That resource
contention is the plausible cause of the readiness flakiness. Freeing the Docker build cache
(5.87 GB) converted a consistently failing start into an intermittently succeeding one.

---

## Slice 4 — LGPD anonymization extension (tasks 15–18)

Appended cumulatively; every Slice 1–3 byte above is untouched.

### Delivery ledger (this run)

| Field | Value |
|-------|-------|
| Change | `sofia-customer-memory` |
| Artifact store | `openspec` (native status is the lifecycle authority; no Engram write in this run) |
| Delivery strategy | `ask-on-risk` |
| Chain strategy (parent-resolved) | `stacked-to-main` |
| This run | **PR 4 of 10 — Slice 4: `anonymizar_usuario_admin` removes the customer's facts before unlinking the identity** |
| PR base | `main` (chain; depends only on Slice 1's `public.fatos_cliente` table) |
| Slice forecast | ~85 lines |
| Slice measured | **125 changed lines** (29 migration + 93 added + 3 deleted in the suite) |

### Structured status consumed (native, read-only)

Re-consumed before any edit with
`gentle-ai sdd-status sofia-customer-memory --cwd /home/wilkin/proyectos/CRM_Sofia_Manager`:
`schema: gentle-ai.sdd-status@2`, `store: openspec`, `next: apply`, `apply: ready`, `verify: ready`,
`archive: ready`, `actionContext.mode: repo-local`,
`allowedEditRoots: [/home/wilkin/proyectos/CRM_Sofia_Manager]`, `applyState: ready`,
`tasks: 14/43 complete`; no blocked reasons, no notes. Status granted no writes; the parent scoped
this run to tasks 15–18.

### Review Workload Gate

`tasks.md` still carries `Decision needed before apply: Yes`, `Chained PRs recommended: Yes`,
`400-line budget risk: High`, `Chain strategy: pending`. The parent resolved `stacked-to-main` and
assigned PR 4 of 10. **Measured: 125 changed lines — inside the 400-line budget, so no
`size:exception` is requested or needed for this slice.** The forecast was ~85; the overage is real
fixture and assertion work rather than padding (the ordering probe, the state-coverage fixtures, and
the negative control are three distinct obligations of task 17). No comment, blank line, test, or
documentation was deleted or compressed to reach any number.

### Completed tasks and persisted checkbox state

`grep -oE '^- \[[x ]\] [0-9]+\.' openspec/changes/sofia-customer-memory/tasks.md` re-read after the
final run shows **tasks 1–18 as `- [x]`** and tasks 19–43 as `- [ ]` (18 checked, 25 unchecked, 43
total):

- [x] 15. RED — the leak reproduced: 3 `not ok` of 51.
- [x] 16. GREEN — the migration plus the guarded include: 51 `ok`, 0 `not ok`.
- [x] 17. TRIANGULATE — ordering probe, state coverage, negative control, purge cascade: 56 `ok`.
- [x] 18. REFACTOR — own file, verbatim body proven, rollback pairing documented, `plan(56)` reconciled.

### Files changed

| Path | Change | Lines |
|------|--------|-------|
| `supabase/migrations/20260918030000_anonymize_fatos_cliente.sql` | new: `create or replace public.anonymizar_usuario_admin(uuid)` = the current body verbatim + exactly one `delete from public.fatos_cliente ...` immediately before the `clientes.usuario_id` update + the source `revoke`/`grant` line | +29 (new file) |
| `supabase/tests/admin_user_dual_deletion.sql` | + two guarded includes, + fixtures (users/perfis/clientes/facts), + the `BEFORE UPDATE` ordering probe, + 18 assertions, `plan(38)` → `plan(56)` | +93 / -3 |
| `openspec/changes/sofia-customer-memory/tasks.md` | tasks 15–18 checked with in-line evidence | artifact |
| `openspec/changes/sofia-customer-memory/apply-progress.md` | this cumulative Slice 4 section | artifact |

No file outside the authorized edit surface was touched. The Slice 1–3 migrations, the RPC migration,
`sofia_customer_memory.sql`, `design.md`, `proposal.md`, the five spec artifacts,
`scripts/run-local-sofia-sql-tests.sh`, and all application (TypeScript) code are unmodified. No
commit was created.

### The one statement added, and where

```sql
 -- Unica instrucao nova: antes de anular `usuario_id`, apagar os fatos do cliente alvo.
 delete from public.fatos_cliente f using public.clientes c where c.id=f.cliente_id and c.usuario_id=p_usuario_alvo_id;
```

It sits on the line immediately before
`update public.clientes set usuario_id=null,... where usuario_id=p_usuario_alvo_id;`. Machine-checked
in this run:

- `body preserved verbatim: True` — the reproduced body equals
  `supabase/migrations/20260826222000_dual_deletion_runtime_fixes.sql` lines 2–20 byte-for-byte after
  removing the one inserted statement;
- `new statements inserted inside the body: 1`;
- `delete immediately precedes the clientes update: True`;
- `acl line identical to the source: True` — the reproduced `revoke all ... / grant execute ...` line
  is byte-identical to line 36 of the source migration, which covers **both**
  `anonymizar_usuario_admin(uuid)` and `iniciar_purga_total_usuario_admin(uuid)`. Keeping the
  statement byte-identical is the literal reading of "preserve verbatim"; it is a no-op for the second
  function (`create or replace` already preserved its ACL) and is flagged here so a reviewer can ask
  for a narrowed pair if they prefer the migration to mention only the function it replaces.

Everything else the task requires is present unchanged: the `admin` authority check through
`public.tem_funcoes`, the anti-lockout rule, the target `for update` lock, the idempotent
`deletion_requested_at` early return, the anonymized-phone allocation loop, the `perfis` update, and
the `logs_auditoria` insert.

### TDD Cycle Evidence

Strict TDD is active (`openspec/config.yaml`: `strict_tdd: true`). SQL tasks have no `vitest` surface,
so RED/GREEN/TRIANGULATE/REFACTOR are the four tasks as ordered below; no TypeScript file changed, so
`vitest` is not on this slice's surface.

| Cycle | Step | Command | Observed result |
|-------|------|---------|-----------------|
| 1 | RED | `bash /tmp/slice4-run.sh red1` | `plan(51)`; 51 assertions ran; **3 `not ok`**, 48 `ok`, psql exit 0 → `# Looks like you failed 3 tests of 51`: `not ok 10 - normal mode deletes every fact of the anonymized customer`, `not ok 14 - the target facts were already deleted at the instant clientes.usuario_id was nulled` (probe value `2`), `not ok 16 - the idempotent second call deletes no additional fact` |
| 2 | GREEN | `bash /tmp/slice4-run.sh green` | `plan(51)`; **51 `ok`, 0 `not ok`**, psql exit 0 |
| 3 | TRIANGULATE | `bash /tmp/slice4-run.sh triangulate` | `plan(56)`; **56 `ok`, 0 `not ok`**, psql exit 0 — the 18 new assertions include the ordering probe, the pending/rejected/superseded coverage pair, the negative control triple, and the purge cascade pair |
| 4 | REFACTOR | `python3` verbatim/ordering checks + `git diff --check` + the TRIANGULATE run above | `body preserved verbatim: True`; `new statements inserted inside the body: 1`; `delete immediately precedes the clientes update: True`; `acl line identical to the source: True`; `no whitespace errors`; `plan(56)` = 56 executed assertions |

The RED failure is the real defect, not a missing-object abort: with the unextended function the
anonymized customer keeps its facts and the ordering probe records two facts still present at the
instant `usuario_id` was nulled. Assertions 13/17/18 (`the ordering probe observed exactly one identity
unlink`, `the idempotent second call never re-nulls the identity`, `the idempotent second call leaves
other customers untouched`) passed on RED too, which is what makes the three failures specific rather
than incidental.

#### The runner actually used, and why (exact reproduction recipe)

`scripts/run-selfhost-supabase-tests.sh` is this suite's designated runner, and its own preflight
refuses on this host:

```
$ bash scripts/run-selfhost-supabase-tests.sh supabase/tests/admin_user_dual_deletion.sql
pgTAP extension is unavailable in asados-supabase-db
selfhost_exit=1
```

`pgTAP` is not installed in the production `postgres` database
(`select count(*) from pg_extension where extname='pgtap'` → `0`), and installing an extension into
the production database is a production write that stays with the human, so it was not done.

The RED/GREEN cycles therefore ran through the designated runner's own flow, reproduced verbatim
against the same container and the same psql flags, with pgTAP installed **in the disposable clone
only**:

```bash
container=asados-supabase-db; db="asados_slice4_<label>_$$"
docker exec "$container" createdb -U postgres "$db"
docker exec "$container" sh -c "pg_dump -U supabase_admin --format=custom --exclude-schema=realtime postgres \
  | pg_restore -U supabase_admin -d '$db' --exit-on-error"
docker exec "$container" psql -U postgres -d "$db" -Atqc \
  'create extension if not exists pgtap; create extension if not exists dblink;'
docker exec "$container" sh -c "printf '\\\\ir tests/admin_user_dual_deletion.sql\n' > /tmp/slice4/run.sql"
docker exec "$container" psql --no-psqlrc --quiet --tuples-only --no-align --pset pager=off \
  -v ON_ERROR_STOP=1 -U supabase_admin -d "$db" -f /tmp/slice4/run.sql
# then: dropdb -U postgres --if-exists --force "$db" and rm -rf the staged tree
```

This is a genuine runtime boundary: the repository's real suite, the real migration files, the real
production schema cloned read-only from the live database (`pg_dump` only), the same
`public.ecr.aws/supabase/postgres` image, and the same psql invocation the harness uses. Each run
dropped its scratch database and staged tree afterwards; a re-check after the last run showed no
`asados_slice4%`/`asados_sql_test%` database and no `/tmp/slice4-suites*` directory left behind.

#### Evidence surfaces that are met, partially met, or unmet

1. **Met — clone runner (above):** RED 3 failures → GREEN 51/51 → TRIANGULATE 56/56, plus the
   machine-checked verbatim/ordering comparison. This is the evidence the four task checkboxes rest
   on.
2. **Partially met — repository-local harness.** Six `supabase start` attempts were made against
   `scripts/run-local-sofia-sql-tests.sh` (one direct, three in a retry loop, two more after pruning
   the Docker build cache). Five failed at the readiness race the parent already described —
   `supabase_storage_... container is not ready: unhealthy`, sometimes with `realtime`, `studio`, or
   `pg_meta` — and the harness reported `error: disposable local Supabase failed to start`. **One
   attempt did start**, ran the full migration chain twice (`initial supabase db reset` exit 0 in 98s
   and `supabase db reset before admin_user_dual_deletion.sql` exit 0 in 99s), staged 14 suite files,
   and then stopped at the suite's own plan line:

   ```
   admin_user_dual_deletion.sql:35: ERROR:  function plan(integer) does not exist
   select plan(56);
   FAIL admin_user_dual_deletion.sql (assertions=0 failed=0 psql_exit=3 tap_exit=1)
   ```

   That failure is **pre-existing and environmental, not a defect of this slice**: the disposable
   local stack ships pgTAP as an available extension but does not install it, and this suite never
   created it (unlike `supabase/tests/sofia_customer_memory.sql`, whose own prelude, added in Slice 1,
   does `create extension if not exists pgtap;`). It is also why this suite is absent from the
   harness's `default_suites` and why the tasks name the self-hosted runner for it. Adding
   `create extension` to the suite is outside this slice's authorized edit surface, so it was not
   done; it is recorded here as an option for the parent. Two useful facts did come out of that run:
   the new migration applies cleanly inside the full `supabase db reset` chain, and the harness's
   normalization printed `owner_transfers_removed=8`, so the new migration adds no
   `alter function ... owner to supabase_admin` transfer and the harness's own invariant still holds.
3. **Unmet — the designated self-hosted runner:** blocked by its `pgTAP extension is unavailable in
   asados-supabase-db` preflight, as quoted above. No claim is made that it would have passed.
4. **Not attempted — the whole default suite set.** The seven default suites do not reference
   `public.fatos_cliente` or `anonymizar_usuario_admin`, and this slice only adds a suite file change
   plus one function replacement, so the regression surface there is empty; the harness's flakiness
   made the attempt not worth the host cost. No claim is made that the default set is green.

### Deviations from the design and from this slice's task text

1. **A second guarded include (`20260918010000_fatos_cliente_schema.sql`) was added to the prelude.**
   Task 15 names only the anonymization include, but the suite inserts into `public.fatos_cliente` and
   the runners clone a database that does not contain the table yet, so without the schema include the
   suite cannot run outside a database where the migration was already applied. It follows the same
   `to_regclass` guard pattern as the pre-existing includes. Recorded rather than silently absorbed.
2. **The anonymization guard tests the function definition, not an object's existence.** The
   migration is `create or replace`, so `to_regclass`/`to_regprocedure` cannot distinguish "already
   applied" from "not applied": the guard is
   `position('fatos_cliente' in pg_get_functiondef('public.anonymizar_usuario_admin(uuid)'::regprocedure)) = 0`.
   It is false in the repository-local harness (chain already applied) and true in a clone, which is
   exactly the behaviour the two runners need.
3. **The ordering probe is a `BEFORE UPDATE` trigger with a `SECURITY DEFINER` function.** The probe
   must write a row from inside `anonymizar_usuario_admin`, whose owner is `postgres`
   (`select proowner::regrole` on the live database) while the harness's psql session user is
   `supabase_admin`; an invoker trigger would run as `postgres` and could not insert into a table
   owned by the session user. `SECURITY DEFINER` makes the trigger run as its own owner, which is the
   role that created the probe table in that session, so the probe works under both session roles. The
   probe table and the trigger function are created inside the suite's transaction and disappear with
   its final `rollback;`.
4. **`plan(38 + k)` resolved to `plan(56)`** — 38 pre-existing assertions plus 18 new ones. The count
   is asserted exactly and the plan matches the executed assertions.
5. **`tasks.md` forecast table left as-is** (`Chain strategy: pending`, budget risk High): the parent
   supplied `stacked-to-main`, and this phase owns only the task checkboxes.

### Remaining tasks (unchanged, still unchecked)

25 unchecked tasks, tasks 19–43, all of them in Slices 5–10
(`grep -n '^- \[ \]' openspec/changes/sofia-customer-memory/tasks.md` reproduces them exactly):

- [ ] 19. **RED:** Create failing `tests/unit/sofia-customer-memory.test.ts` and `tests/unit/sofia-customer-memory-extraction.test.ts` covering: `customerMemoryEnabled` strictness (`undefined`, `'false'`, `'TRUE'`, `'1'`, `'yes'`, `' true'` all false; only `'true'` true); `normalizarValor` (NFKC, invisible/bidi stripping, newline/tab collapsing, double-space collapsing, whitespace-only rejection, 500/501 boundary, control characters, discard-never-truncate); candidate validation (unknown `tipo`, bad `chave`, over-long `valor` discarded while valid siblings survive; `assunto !== 'cliente'` discards the whole response; dedupe by `(tipo, chave)`; 10-candidate cap); and extraction (gate closed → zero provider calls and zero RPC; gate open → exactly one provider call for a batch of several messages; provider failure → logged, zero facts, no throw, no retry, no second call; parse failure → zero facts; exact RPC arguments `p_origem: 'ia'`, `p_forcar_pendente: false`, the batch conversation id; one candidate's `23505`/`22023` not aborting its siblings; no `valor` in any log line). Evidence: `bash scripts/workspace-preflight.sh run -- vitest run tests/unit/sofia-customer-memory.test.ts tests/unit/sofia-customer-memory-extraction.test.ts` fails.
- [ ] 20–43. Slice 5 (gate, helpers, extraction, deploy defaults), Slice 6 (worker hook), Slice 7
  (prompt block), Slice 8 (operator auth move + review actions), Slice 9 (operator facts panel), and
  Slice 10 (client facts section) — none started, none touched.

### Chain context (chained-pr / work-unit-commits contract)

Strategy `stacked-to-main`; one deliverable work unit per PR; the migration, the fixtures, the probe,
and the assertions stay in the unit they verify.

```text
main
 └── PR 1 (tasks 1-5)  schema, constraints, index set            committed 5665370
      ├── PR 2 (tasks 6-10)   write path + prompt read RPCs      committed a794fb9
      ├── PR 3 (tasks 11-14)  operator/owner RPCs, isolation     committed 01f4c6c
      ├── PR 4 (tasks 15-18)  LGPD anonymization extension       📍 current (uncommitted)
      ├── PR 5 (tasks 19-23)  gate + helpers + extraction + deploy defaults
      ├── PR 6 (tasks 24-27)  worker post-completion hook
      ├── PR 7 (tasks 28-31)  approved-facts prompt block
      ├── PR 8 (tasks 32-35)  operator auth move + review actions
      ├── PR 9 (tasks 36-39)  operator facts panel + `fatos` tab
      └── PR 10 (tasks 40-43) client facts section in `/cliente/perfil`
```

- **Current PR**: 4 of 10, ends at task 18. Out of scope for this PR: every task 19–43, all
  TypeScript, the worker hook, the prompt block, both UI surfaces, and any commit.
- **Dependency note for reviewers**: this slice reads Slice 1's table and nothing else; it is
  independent of the RPC slices, so it can land before or after PR 2/3.
- **Rollback boundary**: revert `20260918030000_anonymize_fatos_cliente.sql` **together with**
  `public.fatos_cliente`. Reverting the deletion alone silently re-creates the anonymization leak,
  which is stated in the migration header and repeated in the REFACTOR task above.
- **Review budget**: 125 changed lines against the 400-line budget; no `size:exception` needed.
- **Verification plan**: re-run the clone-runner recipe above (RED/GREEN/TRIANGULATE as recorded), and
  once pgTAP is available to a sanctioned runner, `bash scripts/run-selfhost-supabase-tests.sh
  supabase/tests/admin_user_dual_deletion.sql` for the 56-assertion suite.
- **Runtime boundary**: real — the suite executes against a PostgreSQL clone of the live schema with
  `pgTAP` and the real migration files. There is no application runtime boundary in this slice because
  no application code changed.
- **Uncommitted**: the parent commits each slice; this unit is left in the working tree.

### Final-byte evidence anchor (2026-09-18)

The TRIANGULATE run below was repeated after the last edit to either file, so the numbers are
anchored to the exact bytes this slice leaves in the working tree:

| File | md5 |
|------|-----|
| `supabase/migrations/20260918030000_anonymize_fatos_cliente.sql` | `26724175c2900953f148fbb7ce72ee1d` |
| `supabase/tests/admin_user_dual_deletion.sql` | `2de5e577cc49620bcd8075770cdb6ed2` |

```
$ bash /tmp/slice4-run.sh final
1..56
ok=56 not_ok=0   # 56 'ok' lines, 0 'not ok' lines, no "Looks like you failed" banner, psql exit 0
```

### Slice 4 — evidence obtained, and a corrected false alarm (parent, 2026-09-18)

**The LGPD slice now has sanctioned evidence.**

    bash scripts/run-local-sofia-sql-tests.sh supabase/tests/admin_user_dual_deletion.sql
    initial supabase db reset -> exit=0 (32s)
    PASS admin_user_dual_deletion.sql (assertions=56 failed=0 psql_exit=0)
    all selected suites passed

**CORRECTION — the migration chain was never broken.** An earlier note in this file's history and
the parent's working conclusion claimed the three new `20260918*` migrations broke
`supabase db reset`, and that a production deploy would therefore fail. That claim was FALSE. It was
artefactual to the development host, which runs the production Compose stack (27 containers) on
7.8 GB and cannot reliably start the harness's own disposable stack. An A/B there appeared
decisive — `db reset` failed with the migrations and passed without them — but the difference was
resource contention, not SQL. Re-run on a host with headroom (16 CPU / 15.57 GiB), `db reset`
succeeds **with** the migrations in 32 seconds. The migrations are sound; no production risk exists.

The transferable lesson: a test failure on a saturated host masquerades as a code defect, and an A/B
run on that same host returns a false verdict, because control and treatment differ only by a factor
that interacts with resource pressure. Verify code-defect claims on a host with headroom.

**Suite fixes required to make this suite runnable at all.** This suite was never exercised by the
local harness (it is not in `default_suites`), and two pre-existing gaps hid behind that:

1. It never created the pgTAP extension. Fixed with an idempotent
   `create extension if not exists pgtap;`, matching all seven sibling suites.
2. It assumed a session that can switch to `supabase_admin`. The local harness connects as
   `postgres`, which is not a superuser under Supabase, so both `set role` and the three
   `set local role` sites failed with `42501`. Each is now guarded by
   `pg_has_role(current_user, 'supabase_admin', 'member')`, and the negative branch runs
   `reset role` rather than staying on `authenticated` — the switch genuinely has to escalate, since
   fixture inserts run after `set local role authenticated`.

Registering this suite in `default_suites` would keep the LGPD path exercised routinely; it was
deliberately left out of this slice to avoid widening the shared regression set.
