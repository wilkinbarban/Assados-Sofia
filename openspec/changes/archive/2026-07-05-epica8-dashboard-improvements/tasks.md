# Tasks: Melhorias no Dashboard (Épica 8)

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~450-500 lines |
| 400-line budget risk | Medium-High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (Migration & Config Schema) → PR 2 (Deletion & Logout) → PR 3 (UI & KnowledgeCRUD) → PR 4 (Tests) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium-High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | DB Migration & API Configuration Schema | PR 1 | SQL migration, helper function `obterConfiguracaoSistema` and key saving action. |
| 2 | Cascading Deletion & Logout Logic | PR 2 | Server Action `deletarUsuarioAdmin` with lockout rules, and sidebar logout button handler. |
| 3 | Dashboard Interface & Modules integration | PR 3 | Tabs expansion, API Key inputs UI, embedding KnowledgeCRUD, and return-to-admin link in operator console. |
| 4 | Diagnostics & Integration Tests | PR 4 | Verification scripts testing cascading delete database blocks, lockouts, dynamic key fallback, and RLS. |

## Phase 1: Foundation / Infrastructure
- [x] 1.1 Create migration file `supabase/migrations/20260705010000_epica8_dashboard_improvements.sql` with table `public.configuracoes_sistema` and RLS policies.
- [x] 1.2 Implement helper `obterConfiguracaoSistema` in `src/lib/config/sistema.ts` to query DB with fallback to `process.env`.
- [x] 1.3 Implement Server Action `salvarConfiguracaoAdmin` in `src/app/actions/admin.ts` with credentials validation and secret masking.
- [x] 1.4 Integrate `obterConfiguracaoSistema` in `src/lib/ai/openrouter.ts` and `src/lib/whatsapp/send.ts`.

## Phase 2: Core Implementation
- [x] 2.1 Implement Server Action `deletarUsuarioAdmin` in `src/app/actions/admin.ts` with anti-lockout (active admin check) and cascading deletions.
- [x] 2.2 Add logout action handler to sidebar in `src/components/operator/AdminDashboard.tsx` calling `supabase.auth.signOut()` and redirecting to `/login`.

## Phase 3: Integration / Wiring
- [x] 3.1 Embed `KnowledgeCRUD` component as a tab in `src/components/operator/AdminDashboard.tsx` and extend `TabType` type.
- [x] 3.2 Update `src/app/atendimento/admin/page.tsx` to load knowledge articles and pass them to `<AdminDashboard>`.
- [x] 3.3 Add integrations form fields for WhatsApp and OpenRouter configuration in "Integrações" tab of `AdminDashboard.tsx`.
- [x] 3.4 Modify header in `src/app/atendimento/page.tsx` to conditionally render the "Painel Administrativo" button for admin/supervisor roles.

## Phase 4: Testing
- [x] 4.1 Write unit tests for `deletarUsuarioAdmin` verifying minimum active admin logic and anti-lockout guard.
- [x] 4.2 Write integration tests for cascading deletion of client orders, items, messages, and conversations.
- [x] 4.3 Write tests for dynamic configuration fallback helper `obterConfiguracaoSistema`.

## Phase 5: Cleanup / Polish
- [x] 5.1 Polish secret masking logic and verify visual disclosure buttons in "Integrações" dashboard tab.
- [x] 5.2 Verify redirect flow on delete user and on logout session.
