## Exploration: Dashboard Improvements (Epica 8)

### Current State
Currently, the system features a basic administrative dashboard under `/atendimento/admin` and an operator chat workspace under `/atendimento`. However, several critical management capabilities and usability features are missing:
1. **User Deletion**: There is no function or Server Action to delete clients or system operators (admin, supervisor, vendedor) from the database. Deleting users manually is blocked or complicated by foreign key relationships (such as `public.pedidos` referencing `public.clientes` with `ON DELETE RESTRICT`).
2. **Logout Button**: Operators and admins have no explicit logout/close-session button in the administrative layout.
3. **API Keys Management**: Integration credentials (Meta WhatsApp tokens, OpenRouter LLM keys) are loaded strictly from `.env` on the server, making dynamic updates via UI impossible.
4. **Knowledge Base UI**: The Knowledge Base CRUD console (`KnowledgeCRUD`) resides on a separate route `/atendimento/conhecimento` rather than being integrated as a module inside the main Admin Dashboard.
5. **Dashboard Navigation**: Admins and supervisors working in `/atendimento` have no direct button to return to the Admin Dashboard (`/atendimento/admin`), only to the Knowledge Base.

### Affected Areas
- `src/app/actions/admin.ts` — Affected by adding the Server Action `deletarUsuarioAdmin(usuarioId)` to handle clean deletion, and adding actions to read/write system configuration keys.
- `src/components/operator/AdminDashboard.tsx` — Affected by adding a logout button, integrations forms for Meta and LLM keys, and rendering `KnowledgeCRUD` inside a new "Base de Conhecimento" tab.
- `src/app/atendimento/admin/page.tsx` — Affected by loading the initial Knowledge Base articles and passing them to `AdminDashboard`.
- `src/app/atendimento/page.tsx` — Affected by adding a navigation link to "Painel Administrativo" in the header for admins/supervisors.
- `src/lib/ai/openrouter.ts` — Affected by replacing direct `process.env` calls for LLM settings with a configuration fetcher helper.
- `src/lib/whatsapp/send.ts` — Affected by replacing direct `process.env` calls for WhatsApp tokens with the configuration fetcher helper.
- `supabase/migrations/` (new migration file) — Storing schema modifications for the new configuration table `public.configuracoes_sistema`.

### Approaches

#### 1. Deleting Users & Clients
- **Option 1.1: Complete Cascade Deletion (Full Purge)**
  *Description*: Implement a server action `deletarUsuarioAdmin(usuarioId)` that:
  1. Inspects if the user has an associated record in `public.clientes`.
  2. If a client profile exists, retrieves all associated `pedidos`, deletes all related `itens_pedido` (which has `ON DELETE CASCADE`), deletes the `pedidos` records, and deletes the `clientes` record (which cascade-deletes `conversas` and `mensagens`).
  3. Deletes the auth user using `adminSupabase.auth.admin.deleteUser(usuarioId)` which automatically cascade-deletes `public.perfis` and `public.codigos_verificacao`.
  *Pros*: Fully purges all personal and transactional data, complying with privacy standards (GDPR/LGPD).
  *Cons*: Irreversible data loss of sales history/statistics.
  *Effort*: Medium

- **Option 1.2: Anonymization & Reassignment (Soft Deletion)**
  *Description*: Reassign all orders (`pedidos`) from the deleted client to a dummy system account ("Cliente Excluído") before deleting the client profile.
  *Pros*: Preserves overall sales figures and financial statistics.
  *Cons*: Requires maintaining a special mock profile and extra database handling.
  *Effort*: Medium

#### 2. Logout / Close Session Button
- **Option 2.1: Add Logout Button in Admin Dashboard Sidebar**
  *Description*: Add a "Sair" button inside `AdminDashboard.tsx` sidebar utilizing the client-side router and `@/lib/supabase/client` to execute `await supabase.auth.signOut()`.
  *Pros*: Clean, simple, and self-contained within the Client Component.
  *Cons*: None.
  *Effort*: Low

#### 3. System Configuration & Keys Management
- **Option 3.1: Table-based Config Store with `.env` Fallback**
  *Description*: Create a new table `public.configuracoes_sistema (chave VARCHAR(100) PRIMARY KEY, valor TEXT, eh_segredo BOOLEAN)` protected by strict Admin-only RLS policies. Define a helper `obterConfiguracao(chave)` that queries the database using `service_role` and falls back to `process.env` if the record is missing. Create a UI form under "Integrações" tab to manage these keys.
  *Pros*: Dynamic configuration without container restarts; robust fallback mechanism.
  *Cons*: Credentials stored in plain text in database (protected by RLS).
  *Effort*: Medium

- **Option 3.2: Vault or Encrypted Fields**
  *Description*: Similar to Option 3.1, but encrypt values using a symmetric key prior to database insertion.
  *Pros*: Additional layer of security in case of database leaks.
  *Cons*: Increases complexity; requires managing the encryption key in `.env`.
  *Effort*: High

#### 4. Knowledge Base Module Tab
- **Option 4.1: Embed `KnowledgeCRUD` inside `AdminDashboard`**
  *Description*: Pre-load articles in `/atendimento/admin/page.tsx`, expand `TabType` in `AdminDashboard.tsx`, and render `<KnowledgeCRUD>` inside the dashboard tab view.
  *Pros*: Cohesive and centralized experience. Avoids context switching.
  *Cons*: Slightly increases initial page payload (easily optimized).
  *Effort*: Low-Medium

#### 5. Navigation Return Button
- **Option 5.1: Navigation Link in Chat Header**
  *Description*: Add a "Painel Administrativo" Link inside `src/app/atendimento/page.tsx` header for authorized roles (`['admin', 'supervisor']`).
  *Pros*: Provides intuitive and role-restricted navigation.
  *Cons*: None.
  *Effort*: Low

### Recommendation
1. **User Deletion**: Implement **Option 1.1** (Complete Cascade Deletion). For the scope of this project, a complete purge of test data is appropriate, clean, and avoids database drift.
2. **Logout**: Implement **Option 2.1** (Sidebar button in `AdminDashboard.tsx`).
3. **Config/Keys**: Implement **Option 3.1** (System Configuration table with strict RLS and `.env` fallback). It's flexible, secure enough when protected by RLS, and easy to maintain.
4. **Knowledge Base**: Implement **Option 4.1** (Embed `KnowledgeCRUD` as a dashboard tab).
5. **Navigation**: Implement **Option 5.1** (Add Admin Link to `/atendimento` header).

### Risks
- **Admin Lockout**: Deleting the last administrator would lock out the system. The deletion Server Action MUST enforce that at least one active Admin remains.
- **Accidental Deletions**: Deleting a user triggers database-wide cascades. A double-check modal is mandatory.
- **Leaking Secrets**: Configuration keys must be masked (e.g. `sk-or-***`) in the UI and never printed in plaintext inside audit logs.

### Ready for Proposal
Yes — The changes are well-understood. We can proceed with writing the design specification and implementing these five improvements.
