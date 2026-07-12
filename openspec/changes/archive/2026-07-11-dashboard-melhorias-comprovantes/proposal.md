# Proposal: Dashboard Improvements and PDF Payment Receipt Attachment

## Intent
Improve client dashboard navigation, layout styling (sticky sidebar), and logout behavior. Enforce PDF-only receipt upload with size (< 5MB) and magic bytes validation, triggering handoff. Add a 15-minute idle auto-logout for staff, and implement an Admin review interface for uploaded payment receipts.

## Scope

### In Scope
- Client-side tab state component (`ClienteNav`) for client navigation.
- Main client layout adjustments to keep the catalog sidebar sticky.
- Staff inactivity hook (`InactivityLogout`) for 15-minute idle logout.
- Shared staff layout under `src/app/atendimento/layout.tsx` running inactivity detection.
- PDF magic bytes validation and size checks under 5MB in `ChatContainer.tsx`.
- Auto-deactivation of AI (`ia_ativa = false`) and queue routing (`status = aberta`) on receipt upload.
- SQL migration for `comprovantes` database table linked to `clientes` (cascade delete).
- Admin "Comprovantes" dashboard tab with list, filters (client/date), preview, and actions.

### Out of Scope
- Automatic payment validation or bank integration.
- Upload of other formats (PNG/JPG) or automatic format conversion.
- Customize timeout duration per role or client-side auto-logout.

## Capabilities

### New Capabilities
- `client-payment-receipts`: Restrict chat attachments to validated PDFs (< 5MB), trigger operator handoff on receipt upload.
- `operator-receipts-management`: Review dashboard allowing admins to list, filter, preview, and action client receipts.

### Modified Capabilities
- `client-navigation`: Responsive active navigation tab states, layout styling for sticky catalog sidebar, and redirecting client logout to `/`.

## Approach
Create the `comprovantes` table. Add a client-side hook listening to `mousemove`, `keydown`, `click` events to track inactivity. Implement PDF validation (first 4 bytes check for `%PDF-`) in the chat container. Restyle the client container for sticky sidebar behavior, and build the admin review interface with server actions.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/` | New | SQL migration for `comprovantes` table (cascade delete). |
| `src/components/ClienteNav.tsx` | New | Client-side navigation tab component. |
| `src/components/InactivityLogout.tsx` | New | Client hook/component for staff idle auto-logout. |
| `src/app/atendimento/layout.tsx` | New | Shared layout wrapper hosting inactivity detection. |
| `src/app/cliente/layout.tsx` | Modified | Integrate active navigation tab state and change logout redirect to `/`. |
| `src/components/chat/ChatContainer.tsx` | Modified | Add client-side PDF verification and handoff trigger. |
| `src/components/operator/AdminDashboard.tsx` | Modified | Add "Comprovantes" review tab with date/client filter inputs. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Inactivity checks log out busy operators | Low | Listen to all keyboard/mouse inputs across window. |
| Non-PDFs uploaded with renamed extension | Low | Enforce magic byte check (`[0x25, 0x50, 0x44, 0x46]`). |

## Rollback Plan
Revert code changes in frontend components. If migrations were applied, run a migration to drop the `comprovantes` table.

## Dependencies
- Supabase auth, storage, database schema.

## Success Criteria
- [ ] Active tabs style updates correctly without full page reload.
- [ ] Catalog sidebar remains sticky/locked during scrolling.
- [ ] Invalid or >5MB files rejected; valid PDFs trigger Sofia handoff.
- [ ] Idle staff logs out after 15 minutes.
- [ ] Client logout redirects to `/`.
- [ ] Admin panel lists, filters, and previews receipts.
