## Exploration: Nine-Migration Historical Closure for Legacy Inventory RPC

### Current State
The prior eight-file transaction correctly rolled back at `20260712164546...:4`: that migration unconditionally revokes the five-argument signature before dropping it. Repository-wide migration inspection found its sole historical creator in `20260711144706_admin_products_inventory_hardening.sql` (`CREATE OR REPLACE`), followed by its grants to `authenticated, service_role`. No other migration creates, replaces, drops, grants, or revokes that signature.

The new minimal disposable Slice 2 closure is the original eight ordered files plus `20260711144706...` between `20260708160000...` and `20260712164546...`. The predecessor requires `produtos`, `tipo_movimentacao`, and `movimentacoes_estoque`; their containing historical migrations in turn require the existing six-file prefix. It supplies `tem_funcoes`, `produtos`, `tipo_movimentacao`, `movimentacoes_estoque`, `produto-imagens`, the legacy signature, Slice 1 RPC/policies, and Slice 2 lifecycle RPCs.

The previous `supabase db push --include-all` attempt was correctly stopped: remote history contained 13 unreviewed versions. CLI v2.109.1 offers `db push --dry-run`, but its documented operation pushes all local migrations and records history; a dry run can inspect its plan but cannot prove the prior execution path will preserve this boundary. It is therefore evidence-only, not the execution mechanism.

### Hosted Realtime Baseline Decision
`supabase_realtime` is a PostgreSQL **publication**, not a managed schema. The only selected-migration use is in `20260704140000_epica2_client_chat.sql`: a guarded `CREATE PUBLICATION supabase_realtime` when absent, followed by `ALTER PUBLICATION ... ADD TABLE public.conversas` and `public.mensagens`.

Current Supabase Postgres Changes documentation supports creating the `supabase_realtime` publication and adding selected tables; the Dashboard Publications setting is an alternative for adding tables to that publication. The current CLI has no Realtime/publication bootstrap command. The 2025 managed-schema restriction applies to the `realtime` schema, not to a user-issued `CREATE PUBLICATION`.

Therefore a fresh hosted project does not require manually invented system-schema DDL, a platform-feature toggle, or a separate pre-bootstrap mutation. The approved historical migration already contains the supported, idempotent publication creation needed by its own table-registration statements. The current `missing_supabase_realtime` preflight is an incorrect blocker: it prevents the migration from performing its explicit supported initialization.

### Affected Areas
- `supabase/migrations/20260703210000_epica1_auth_otp.sql` — creates identities, role helpers, and `tem_funcoes`.
- `supabase/migrations/20260704140000_epica2_client_chat.sql` — prerequisite `conversas` for CRM; also adds Realtime/chat artifacts.
- `supabase/migrations/20260704170000_epica6_crm_sales.sql` — creates `produtos`.
- `supabase/migrations/20260705010000_epica8_dashboard_improvements.sql` — creates `configuracoes_sistema` used by stock baseline.
- `supabase/migrations/20260708000000_estoque_horarios.sql` — creates stock type/table, image columns, and `produto-imagens`.
- `supabase/migrations/20260708160000_produto_imagens_public.sql` — makes the image bucket public.
- `supabase/migrations/20260711144706_admin_products_inventory_hardening.sql` — the sole historical creation of the five-argument function required by the later unconditional `REVOKE`; it also adds `ordem_exibicao`.
- `supabase/migrations/20260712164546_admin_products_authenticated_inventory_rpc.sql` — Slice 1 inventory and Storage boundary.
- `supabase/migrations/20260713110019_admin_product_image_lifecycle.sql` — Slice 2 cleanup table and lifecycle RPCs.

### Approaches
1. **Direct, manifest-pinned ordered SQL through `psql`** — source only the nine historical absolute paths in one owner-session transaction; do not invoke the Supabase migration facility.
   - Pros: the client input is a closed, reviewable nine-file list; it restores the required legacy signature before the unconditional `REVOKE`, and no CLI migration discovery, `--include-all`, or migration-history reconciliation can add a tenth file. `psql` 16.14 is available. One transaction rolls back every SQL statement on error.
   - Cons: it deliberately creates no `supabase_migrations.schema_migrations` entries; the signed manifest and command receipt, not CLI history, are the provenance record.
   - Effort: Medium.

2. **Synthetic legacy function or temporary workspace plus `supabase db push`** — invent a precursor function, or hash-check a copy and push it.
   - Pros: uses standard migration history and has a dry-run flag.
   - Cons: synthetic SQL is not a historical closure; the prior `db push` attempt disproved the required scope guarantee, and the CLI documents that it pushes all local migrations.
   - Effort: Medium.

### Recommendation
Use approach 1 only after a separate mutation authorization, with a revised read-only preflight. It is the only evaluated mechanism whose executable input is intrinsically limited to the exact nine-file historical closure. Do not invent a baseline function and do not create `supabase_realtime` separately: let the hash-pinned historical migration create it when absent, then verify the publication and its two registered tables postflight.

#### Command-level execution plan (not run during this investigation)

1. Create a uniquely named disposable project with the `asados-readonly-validation` profile. Record `DISPOSABLE_REF`; abort unless it is non-empty and differs from protected production `xvzdxoktwnzmxsfizkxo`. Retain the generated database password only in the invoking shell and construct an unprinted `DISPOSABLE_DATABASE_URL` for the disposable project's owner/postgres connection.
2. Before any mutation, verify exact source content. The following pinned SHA-256 manifest must pass; any changed, missing, or substituted file aborts:

```bash
sha256sum --check --strict <<'SHA256'
c37baf515ebc9259339248761921c5e9119cb483ec5bcccd64f33a4090bd5d95  supabase/migrations/20260703210000_epica1_auth_otp.sql
01b102cd0b7843907b8a01da81f190b53cd6aeadbb12a9945a234d01a7701027  supabase/migrations/20260704140000_epica2_client_chat.sql
4cad9cf6a7d9e2fc9eae1cc21c4b21ab0316faa13d063c7c76e100536269c9eb  supabase/migrations/20260704170000_epica6_crm_sales.sql
ba2d71421ec33ef46d552f13b52462fdf13a98b67043a354e7a5170798d3d26a  supabase/migrations/20260705010000_epica8_dashboard_improvements.sql
2775145fff276684787b102e7db1f742358686511dcea668bc58133b5422cad6  supabase/migrations/20260708000000_estoque_horarios.sql
19a2a3dfd95c71efc91fa1fdde3cd282f26f862ad681e8debfb4fd1a8213ec82  supabase/migrations/20260708160000_produto_imagens_public.sql
1fe499c72301b2201b7ea1056a8919c9b3b8f6b265603e6639fa15fe1fff8a84  supabase/migrations/20260711144706_admin_products_inventory_hardening.sql
0085ad2e58a55f187dfee098021742887f7e6fcbc6430aaed4c27f09d01ec6b4  supabase/migrations/20260712164546_admin_products_authenticated_inventory_rpc.sql
e46153ceb070ea8124ce57eb28759bf65124cde1ab65d12b19d0cb918a9a5a4c  supabase/migrations/20260713110019_admin_product_image_lifecycle.sql
SHA256
```

3. Use a read-only preflight connection to abort unless the target is a newly created disposable database whose reference is non-empty and differs from protected production `xvzdxoktwnzmxsfizkxo`; `auth` and `storage` schemas exist; `gen_random_uuid()` exists; and `to_regclass('supabase_migrations.schema_migrations')` is null. Inspect (but do not require) `pg_publication.pubname = 'supabase_realtime'`: it may be absent on a fresh hosted project. If present, record its tables and continue; if absent, the selected hash-pinned chat migration will create it. Do not issue separate publication or `realtime`-schema SQL.
4. Execute this fixed input exactly once, capturing stdout/stderr as the receipt. `-X` prevents user startup files; `ON_ERROR_STOP` and `--single-transaction` make any SQL error roll back the full closure:

```bash
psql "$DISPOSABLE_DATABASE_URL" -X --set=ON_ERROR_STOP=1 --single-transaction <<'SQL'
\i /home/wilkin/proyectos/Asados/supabase/migrations/20260703210000_epica1_auth_otp.sql
\i /home/wilkin/proyectos/Asados/supabase/migrations/20260704140000_epica2_client_chat.sql
\i /home/wilkin/proyectos/Asados/supabase/migrations/20260704170000_epica6_crm_sales.sql
\i /home/wilkin/proyectos/Asados/supabase/migrations/20260705010000_epica8_dashboard_improvements.sql
\i /home/wilkin/proyectos/Asados/supabase/migrations/20260708000000_estoque_horarios.sql
\i /home/wilkin/proyectos/Asados/supabase/migrations/20260708160000_produto_imagens_public.sql
\i /home/wilkin/proyectos/Asados/supabase/migrations/20260711144706_admin_products_inventory_hardening.sql
\i /home/wilkin/proyectos/Asados/supabase/migrations/20260712164546_admin_products_authenticated_inventory_rpc.sql
\i /home/wilkin/proyectos/Asados/supabase/migrations/20260713110019_admin_product_image_lifecycle.sql
SQL
```

5. Immediately read back the expected objects, grants, RLS policies, bucket attributes, and `supabase_migrations.schema_migrations` (which must still be absent). Also assert that `pg_publication` contains `supabase_realtime` and `pg_publication_tables` contains exactly the expected chat registrations (`public.conversas`, `public.mensagens`) from the selected migration. Only then run the separately approved lifecycle fixtures. On any failure, delete the disposable project with `supabase projects delete "$DISPOSABLE_REF" --profile asados-readonly-validation --yes`; deletion is also mandatory after successful validation. Never link, query, or delete the production reference.

This proves scope before mutation because the hashed manifest and the here-document contain exactly nine static `\i` commands. Repository search found no nested `\i` or `\ir` meta-command in any selected file. `psql` has no migration discovery mode and is never given the migration directory, `supabase db push`, or `--include-all`; unrelated repository SQL therefore has no execution path. The sole database permission is the disposable project's owner/postgres connection needed for DDL and `auth`/`storage` changes. The CLI profile is used only for disposable project create/list/delete, never as a production connection.

### Risks
- The closure intentionally includes bundled chat, CRM, configuration, schedule, and Realtime effects; it is an approved dependency closure, not a product-only schema.
- Direct application leaves no Supabase migration history. The hash manifest, command receipt, postflight object checks, and deletion receipt must be retained as validation evidence.
- A pre-existing `supabase_realtime` publication could carry registrations outside this selected closure; record its table set before execution and do not drop, recreate, or alter unrelated registrations.
- The lifecycle scenarios do not depend on chat Realtime delivery. Omitting the historical registration would change the approved eight-file manifest and is not recommended unless separately approved as a new scope.
- The added migration also adds `produtos.ordem_exibicao` and an index. This is required to preserve the exact historical migration byte stream; do not substitute a hand-written function-only baseline.
- If the connection fails after commit status is uncertain, do not retry; delete the disposable project and inspect only a new project after renewed approval.
- This investigation ran no remote query, project operation, migration, fixture, source edit, Git command, stage, commit, or reset.

### Ready for Proposal
Yes — revise the disposable validation preflight as above, use the nine-file manifest and direct `psql` approach, and require postflight publication and RPC-signature verification. No synthetic baseline SQL or separate platform enablement is justified. The current work is read-only analysis only.

---

## Exploration: Disposable Supabase Project Provisioning Delay

### Current State
Read-only CLI inspection with profile `asados-readonly-validation` (Supabase CLI `2.109.1`) lists exactly one accessible project: protected production `xvzdxoktwnzmxsfizkxo` (`Asados`), in organization `jhbbteibaxcvwnjlkfvf`, with status `ACTIVE_HEALTHY`. No disposable project, including one in `COMING_UP`, `INIT_FAILED`, or another transitional status, is returned. The profile lists one organization: `wilkinbarban's Org`.

The current CLI exposes read-only `projects list` and `orgs list` commands, but no command for organization quota/plan/usage, provisioning jobs, pending create requests, or a project-status lookup for a ref that was never returned. Therefore the CLI cannot distinguish a server-side create request that is pending but invisible from a create request that did not persist.

### Affected Areas
- `openspec/changes/admin-products-unified-remediation/exploration.md` — records the disposable-validation provisioning blocker and safe escalation path.
- Supabase organization `jhbbteibaxcvwnjlkfvf` — account/platform state to inspect; production project data was not accessed.

### Approaches
1. **Wait/retry through the CLI** — submit another `projects create` request and await output.
   - Pros: potentially obtains a disposable target without dashboard access.
   - Cons: cannot identify the original request, may create additional projects or hit a rate/anti-abuse control, and is outside this read-only diagnosis.
   - Effort: Low, but not recommended.

2. **Inspect organization state in Dashboard and escalate to Support if no pending project is visible** — use the organization’s Projects and Billing/Usage views to check for a provisioning card, free-project entitlement, and account restrictions; then provide Supabase Support the org ID, time window, CLI version, region, and no-ref outcome.
   - Pros: the only route likely to expose quota, billing, anti-abuse, and asynchronous provisioning-job state; preserves production and avoids more create attempts.
   - Cons: requires an authenticated human dashboard/support action.
   - Effort: Low.

### Recommendation
Do not retry creation automatically. In the Supabase Dashboard, select `wilkinbarban's Org` (`jhbbteibaxcvwnjlkfvf`), inspect the organization Projects page for a project in provisioning/failed state, then inspect Billing/Usage for the current project entitlement or restriction. If neither view exposes a pending project or actionable limit, open a Supabase Support request: “`supabase projects create` with CLI 2.109.1 and profile `asados-readonly-validation` remained non-returning for over 20 minutes and returned no project ref; current `projects list` shows only production `xvzdxoktwnzmxsfizkxo`; please inspect asynchronous provisioning, quota, and anti-abuse state for organization `jhbbteibaxcvwnjlkfvf`.” Include the approximate UTC time, requested region/size, and command stderr/request ID if available, but never the database password or access token.

### Risks
- A missing project from `projects list` is evidence against a visible pending project, not proof that the platform did not accept the request; only Supabase can inspect an unlisted provisioning job.
- Repeating create requests can obscure diagnosis, consume a newly released quota, or leave another disposable project to clean up.
- The CLI listing does not expose organization quota, billing, anti-abuse, or create-job state, so no account-limit conclusion is justified from CLI evidence alone.

### Ready for Proposal
No — hosted Slice 2 validation remains blocked until the organization dashboard or Supabase Support resolves the provisioning state and a disposable project ref is returned. Production `xvzdxoktwnzmxsfizkxo` remains protected.

### Result Contract
- **Status**: blocked
- **Evidence**: `supabase projects list --profile asados-readonly-validation --output-format json` returned only `xvzdxoktwnzmxsfizkxo` with `ACTIVE_HEALTHY`; `supabase orgs list` returned only `jhbbteibaxcvwnjlkfvf`; CLI `projects` help exposes only `list`, `create`, `api-keys`, and `delete`, with no provisioning/quota/status command for an unknown ref.
- **Next recommended action**: dashboard organization Projects and Billing/Usage inspection, then Supabase Support escalation using the provided sanitized facts if the state remains absent.
- **Risks**: do not retry creates before that inspection; do not include secrets in any support request.
- **Skill resolution**: paths-injected — `sdd-explore` and `supabase`; shared SDD/OpenSpec conventions were read as required by the exploration skill.

---

## Exploration: Disposable Supabase Provisioning Re-diagnosis

### Current State
At this re-check, `npx --yes supabase` is version `2.109.1`. With profile `asados-readonly-validation`, `projects list --output-format json` returns exactly one project: protected production `Asados` (`xvzdxoktwnzmxsfizkxo`) in `us-west-2`, status `ACTIVE_HEALTHY`. `orgs list --output-format json` returns exactly one organization, `wilkinbarban's Org` (`jhbbteibaxcvwnjlkfvf`). Thus the active project count is one and no visible pending or failed disposable project exists in this CLI account context.

This matches the prior non-returning create attempt's observable result after more than 20 minutes: no project ref was returned and no additional project appears now. It is also consistent with the user's Dashboard inspection reporting no failed/pending project and available quota/usage. The CLI organization identity is explicit; an account-context mismatch is not indicated if that Dashboard inspection was performed in `wilkinbarban's Org` (`jhbbteibaxcvwnjlkfvf`).

CLI help was discovered before use. `projects` exposes only `list`, `create`, `api-keys`, and `delete`; `orgs` exposes only `list` and `create`. `projects api-keys`, `branches list`, and `functions list` require a project ref; `inspect db` is database inspection; and `status` reports local containers. None can reveal an unknown project's asynchronous provisioning state. Current CLI documentation likewise describes `projects list` as listing accessible projects and `status` as local-stack status; no organization usage/quota or create-job endpoint is exposed.

### Affected Areas
- `openspec/changes/admin-products-unified-remediation/exploration.md` — records the refreshed, read-only provisioning diagnosis.
- Supabase organization `jhbbteibaxcvwnjlkfvf` — sole CLI-visible organization; no production project operation was performed.

### Approaches
1. **Escalate the invisible create request to Supabase Support** — provide the organization ID, prior 20+ minute no-ref timeout, current CLI version, and confirmed absence from both CLI and Dashboard.
   - Pros: Supabase alone can inspect server-side create-job, billing, anti-abuse, and request-trace state not surfaced by the CLI.
   - Cons: requires a support response.
   - Effort: Low.

2. **Retry project creation** — submit another create request.
   - Pros: might provision a disposable environment.
   - Cons: is a prohibited mutation for this diagnostic and could obscure the missing request or consume quota.
   - Effort: Low, but not recommended.

### Recommendation
Do not retry creation. Treat this as a CLI visibility limitation, not an evidenced organization mismatch or quota exhaustion. Escalate to Supabase Support with the sanitized evidence and ask it to inspect the original asynchronous create request for organization `jhbbteibaxcvwnjlkfvf`.

### Risks
- The CLI cannot prove that its organization is the Dashboard-selected organization without the Dashboard's organization ID; it can only identify its own context as `jhbbteibaxcvwnjlkfvf`.
- Absence from both visible project lists does not prove that the original platform request was never accepted; it proves that CLI v2.109.1 has no no-ref job-visibility path.

### Ready for Proposal
No — hosted disposable validation remains blocked until Supabase returns a disposable project ref or explains the invisible provisioning request. Production `xvzdxoktwnzmxsfizkxo` remains untouched.

### Result Contract
- **Status**: blocked
- **Evidence**: CLI `2.109.1`; one active project (`xvzdxoktwnzmxsfizkxo`, `ACTIVE_HEALTHY`); one organization (`jhbbteibaxcvwnjlkfvf`, `wilkinbarban's Org`); no projects/orgs CLI subcommand or eligible no-ref status/log/query endpoint discovered through `--help`.
- **Comparison**: unchanged from the prior 20+ minute no-ref timeout: neither a pending/failed disposable project nor a CLI-visible provisioning record exists.
- **Conclusion**: no evidence of a CLI/Dashboard organization-context mismatch, conditional on the Dashboard inspection being in `jhbbteibaxcvwnjlkfvf`; the CLI lacks visibility into unknown-ref provisioning jobs and organization quota/usage.
- **Next recommended action**: ask Supabase Support to inspect the original project-create request using organization `jhbbteibaxcvwnjlkfvf`, the approximate request time, CLI `2.109.1`, requested region/size, and any sanitized request ID/stderr. Do not include tokens or database passwords.
- **Mutation statement**: no project was created/deleted, no SQL was applied, no remote project was queried, and no production mutation was performed.
- **Skill resolution**: paths-injected — `/home/wilkin/.config/opencode/skills/sdd-explore/SKILL.md` and `/home/wilkin/.agents/skills/supabase/SKILL.md`; shared SDD/OpenSpec conventions were read.

---

## Exploration: Disposable Hosted Auth Rate-Limit Remediation for Slice 2

### Current State
The last disposable-only nine-file closure completed and its Auth/Storage schemas, lifecycle RPC, bucket, policies, and Realtime postflight passed. The missing receipt is entirely after authentication: authorized Storage retrieval/delete/absence, cleanup retry/completion, and unauthorized denial. Normal signup and password sign-in each returned HTTP 400 with a sanitized email-rate-limit classification, so no session was established. The disposable project was deleted; production `xvzdxoktwnzmxsfizkxo` is not an eligible target.

Current Supabase documentation distinguishes the built-in email-sender limit (two emails/hour, project-wide; configurable only by supplying custom SMTP) from the Management API's configurable Auth rate-limit settings. It documents `PATCH /v1/projects/{ref}/config/auth` for rate-limit and `mailer_autoconfirm` configuration, but these are project-level Auth mutations and are unnecessary for the supported Admin API route below. The documented generic rate-limit response is HTTP 429, so the prior HTTP 400 classification is useful evidence but is not sufficient to prove that waiting alone will restore password sign-in.

`public.ao_criar_usuario` automatically creates `public.perfis` as active `cliente`. Therefore an Admin-created user can prove an authenticated non-operator Storage request, but cannot invoke the role-protected lifecycle RPC as an admin/supervisor without a separately authorized application-profile fixture mutation. `app_metadata` does not change this table-driven role check.

### Affected Areas
- `openspec/changes/admin-products-unified-remediation/exploration.md` — records the disposable-only remediation plan.
- `openspec/changes/admin-products-unified-remediation/apply-progress.md` — current evidence and precise missing receipt.
- `openspec/changes/admin-products-unified-remediation/tasks.md` — Slice 2 is implemented; no source task is reopened.
- `supabase/migrations/20260703210000_epica1_auth_otp.sql` — confirms the automatic `cliente` profile and role constraint for the fixture.

### Approaches
1. **Admin-created confirmed disposable user, then normal password sign-in** — use the documented server-only `auth.admin.createUser({ email, password, email_confirm: true })` with the disposable project's service credential; create a separate publishable-key client only for `signInWithPassword` and the authenticated Storage calls.
   - Pros: avoids signup and confirmation-email delivery entirely; uses supported Auth APIs; `email_confirm: true` does not require changing `mailer_autoconfirm`; user and session cleanup are explicit.
   - Cons: `createUser` does not itself produce an end-user session; an authenticated operator lifecycle scenario additionally needs separately approved profile-role fixture setup; a failed password sign-in remains a diagnostic stop, not a reason to retry.
   - Effort: Low.

2. **Temporarily alter disposable Auth configuration** — use a Management API personal access token to read and, if explicitly approved, PATCH only the disposable project's Auth configuration (for example `mailer_autoconfirm` or configurable rate-limit fields), record the prior value, restore it before deletion, and delete the project.
   - Pros: supported platform API; can make normal signup flows testable when confirmation is the only blocker.
   - Cons: it does not raise the built-in email-sender quota without custom SMTP; it is broader and riskier than Admin user creation; it requires a platform PAT and configuration rollback evidence.
   - Effort: Medium.

3. **Wait and retry the original signup flow** — wait at least one full built-in email quota window after the last email-sending request, then issue at most one new signup probe.
   - Pros: no configuration mutation.
   - Cons: weak diagnosis: password sign-in is not documented as an email-sending operation and the observed HTTP 400 differs from the documented generic 429; it can consume the limited email budget again.
   - Effort: Low, not recommended as the primary path.

4. **Mint or inject an access-token fixture** — attempt to bypass Auth with an invented JWT, an `auth` schema insert, or a service credential substituted as a user token.
   - Pros: none.
   - Cons: unsupported and prohibited. Supabase documents sessions as created by sign-in/token-exchange flows; Admin user APIs create/manage users but do not provide a supported arbitrary-user token-minting fixture. `generateLink`/invite paths are email-oriented and reintroduce the email limit.
   - Effort: N/A; reject.

### Recommendation
Authorize only Approach 1 for a newly created, explicitly named disposable ref that is checked against the protected ref before every remote call. Do not disable rate limits or change Auth configuration.

Minimum remote mutation scope:
1. Create one unique confirmed Auth user through `auth.admin.createUser`, with credentials held only in the invoking process.
2. Sign in once with its password using the disposable publishable-key client; retain the returned access token only in memory.
3. For the authorized lifecycle branch, obtain separate approval for the minimum application-profile role fixture because the repository trigger makes the new user a `cliente`; use a supported service-side application API/REST mutation, never `auth`-schema or invented bootstrap SQL. Without that approval, limit the run to authenticated non-operator and anonymous-denial evidence and report the lifecycle branch blocked.
4. Run the missing scenarios with unique object prefixes: retrieval before delete; delete; list/download/HEAD-style object absence using the Storage API's documented semantics; cleanup-pending/retry/completion; and an anonymous/publishable-key denial probe. Preserve only sanitized status/error categories and object IDs in the receipt.
5. In `finally`, sign out/revoke the session if available, remove test objects, delete the Auth user through `auth.admin.deleteUser`, verify the user/object prefixes are absent, then delete the disposable project. Project deletion is the final containment backstop.

Preflight proof of production isolation: abort unless the target ref is non-empty, differs from `xvzdxoktwnzmxsfizkxo`, is labeled as the current disposable fixture target, and the CLI profile inventory shows production was neither linked nor selected. Never load production URL, key, database connection, or Management API ref into the harness. The service credential and any PAT must be acquired only for the disposable ref and never be printed, written, or retained in an artifact.

### Risks
- The documented built-in email limit cannot be raised with generic rate-limit settings; custom SMTP would broaden the mutation scope and is not justified.
- The observed 400 may indicate an additional Auth issue, so a password-sign-in failure after Admin creation must stop with sanitized response evidence rather than trigger retries or configuration changes.
- The automatic profile is `cliente`; changing it to an operator role is an application-data fixture mutation requiring explicit approval independent of Auth remediation.
- `service_role` is server-only and must never be sent to the browser or logged. Deleting a user alone does not invalidate an already-issued access token, so session revocation/sign-out precedes deletion where available.

### Ready for Proposal
Yes — propose the Admin-created confirmed-user path as the default disposable-only remediation, with an explicit decision gate for the separate profile-role fixture. Do not propose Auth configuration changes, custom SMTP, direct `auth` SQL, token fabrication, production access, source edits, or Git changes.

### Result Contract
- **Status**: success
- **Evidence**: current OpenSpec exploration/tasks/apply-progress were read; `ao_criar_usuario` creates an active `cliente` profile; current Supabase Auth docs support Admin `createUser` with `email_confirm: true`, server-only service credentials, Management API Auth configuration, and document the built-in email limit; no supported arbitrary-user token fixture was found.
- **Recommended remediation**: new disposable ref only; Admin-create one confirmed user, normal password sign-in once, then run missing Storage receipt scenarios. Require separate explicit approval before promoting the auto-created `cliente` profile for role-protected lifecycle RPC coverage.
- **Minimum credentials**: disposable project URL and publishable key for user/anonymous requests; disposable service credential for Admin create/delete and any separately approved service-side profile fixture; Management API PAT only if a configuration-mutation approach is explicitly selected (not recommended).
- **Cleanup**: sign out/revoke if available, remove fixture objects, delete the Auth user, verify absence, then delete the disposable project; retain sanitized receipt only.
- **Production isolation**: hard ref equality guard against `xvzdxoktwnzmxsfizkxo`, disposable-only credentials, no production link/query/configuration path, and final disposable deletion.
- **Mutation statement**: this exploration was read-only; no project, SQL, Auth configuration, user, fixture, source, or Git state was changed.
- **Skill resolution**: paths-injected — `sdd-explore` and `supabase`; shared SDD/OpenSpec conventions and current Supabase documentation were read.
