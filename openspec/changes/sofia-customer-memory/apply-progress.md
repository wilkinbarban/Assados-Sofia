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
