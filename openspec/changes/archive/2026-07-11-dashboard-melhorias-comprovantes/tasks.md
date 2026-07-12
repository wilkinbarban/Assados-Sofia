# Tasks: Dashboard Improvements & PDF Payment Receipts

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 450-600 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (Foundation & Nav) → PR 2 (PDF, Handoff & Admin) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units
| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Phase 1 foundation & client navigation | PR 1 | Base branch; client nav, inactivity logout |
| 2 | Phase 2 implementation & admin views | PR 2 | Merges onto main after PR 1; PDF, DB logs, admin tab |

## Phase 1: Foundation

- [x] 1.1 Create migration `supabase/migrations/20260711155000_comprovantes_pdf.sql` for `comprovantes` table.
- [x] 1.2 Implement client-side `src/components/operator/InactivityLogout.tsx` with activity event listeners.
- [x] 1.3 Create operator layout `src/app/atendimento/layout.tsx` to mount `InactivityLogout`.

## Phase 2: Core Implementation

- [x] 2.1 Create navigation tabs component in `src/components/cliente/ClienteNav.tsx` using `usePathname`.
- [x] 2.2 Refactor layout `src/app/cliente/layout.tsx` to use `ClienteNav` and redirect logout to `/`.
- [x] 2.3 Add validation to `src/components/chat/ChatContainer.tsx` restricting to PDF files < 5MB.
- [x] 2.4 Add magic byte check `%PDF-` (`[0x25, 0x50, 0x44, 0x46]`) for PDF verification in `ChatContainer.tsx`.
- [x] 2.5 Update state to set `ia_ativa = false` and conversation `status = 'aberta'` upon PDF receipt upload.
- [x] 2.6 Insert database logs / automated confirmation message from sender `'ia'` on receipt upload.
- [x] 2.7 Add `obterComprovantes` filter query logic in server action `src/app/actions/admin.ts`.
- [x] 2.8 Add "Comprovantes" review tab, table, filters, and iframe PDF preview to `src/components/operator/AdminDashboard.tsx`.

## Phase 3: Integration & Testing

- [x] 3.1 Create test `src/components/cliente/__tests__/ClienteNav.test.tsx` verifying active styling with simulated pathname.
- [x] 3.2 Create test `src/components/chat/__tests__/ChatPDF.test.tsx` validating PDF magic bytes helper.
- [x] 3.3 Create test `src/components/operator/__tests__/InactivityLogout.test.tsx` for operator inactivity timer.
- [x] 3.4 Create test `src/components/chat/__tests__/ChatHandoff.test.tsx` for chat auto-handoff DB triggers.

## Phase 4: Cleanup & Deployment

- [ ] 4.1 Rebuild local and production environments using `docker compose build`.
- [ ] 4.2 Perform end-to-end verification of upload limits, handoff, and inactivity logout.
