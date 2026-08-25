## Exploration: Audited order lifecycle and thermal sales receipts

### Current State
`Gestão de Pedidos` uses two independent enums (`status_pedido` and `status_pagamento`), but current writers do not preserve that independence. The stock RPC is the only existing atomic, audited path for confirmation and cancellation, while the dashboard writes `confirmado` and `entregue` directly. Marking an order delivered also forces payment to approved, and the Mercado Pago webhook directly sets the order to confirmed without applying the stock RPC. A new order cannot be cancelled through the stock RPC because cancellation requires previously applied stock. The dashboard exposes delivery from any non-cancelled state and calculates “Faturamento Real” from every non-cancelled order rather than approved revenue.

Payment approval already has two sources—Mercado Pago and an operator—but neither is represented with durable provenance. The webhook stores the payment identifier, while the manual action only changes `status_pagamento`. Existing `comprovantes` are customer-uploaded payment PDFs and are semantically different from sales receipts; reusing them would mix inbound evidence with outbound documents.

No sales-receipt issuance or printing path exists. The smallest coherent model is one immutable logical receipt snapshot, issued only when the order is both `entregue` and `aprovado`, rendered twice from identical data as `VIA CLIENTE` and `VIA ESTABELECIMENTO`. Browser print CSS for 58/80 mm should be primary; server-side PDF should reproduce the same snapshot as fallback. ESC/POS requires hardware and transport decisions and remains explicitly deferred.

### Affected Areas
- `apps/web/src/app/actions/pedidos.ts` — direct lifecycle/payment writes bypass atomic transition and provenance rules.
- `apps/web/src/app/api/webhooks/mercadopago/route.ts` — integration approval currently couples payment approval to order confirmation.
- `apps/web/src/components/operator/OrdersManagementDashboard.tsx` — exposes invalid transitions, conflates delivery with payment, and overstates revenue.
- `apps/web/src/components/operator/OperatorClientOrdersList.tsx` — second caller of the same mutable lifecycle/payment actions.
- `apps/web/src/app/atendimento/pedidos/page.tsx` — server entry point and initial data boundary for the redesigned management surface.
- `supabase/migrations/20260704170000_epica6_crm_sales.sql` — defines the existing order and payment state vocabulary.
- `supabase/migrations/20260716212059_order_stock_lifecycle.sql` — contains the atomic stock confirmation/cancellation authority and its current cancellation dead end.
- `supabase/migrations/20260711155000_comprovantes_pdf.sql` — confirms inbound payment evidence must remain separate from outbound sales receipts.
- `tests/unit/pedidos-management.test.ts` — currently pins the incorrect `entregue => aprovado` behavior.
- `tests/unit/complete-lifecycle-e2e.test.ts` — lifecycle harness also teaches direct status mutation as valid.
- `tests/unit/pedidos-stock-action.test.ts` and Supabase SQL harnesses — existing evidence for stock RPC behavior and the base for transition regression tests.
- `openspec/specs/pedidos_pagamento/spec.md` — currently requires approved Mercado Pago payments to set the order to `confirmado`; the change must explicitly modify that coupling.
- `openspec/specs/operator-receipts-management/spec.md` — describes uploaded client PDFs, not the new sales-receipt domain.

### Approaches
1. **Patch the dashboard and add printable markup** — hide invalid buttons, stop auto-approving delivery, and print current order data.
   - Pros: Small initial change and fast visible improvement.
   - Cons: Other callers and the webhook still bypass rules; current mutable order/product data makes reprints non-reproducible; manual approvals remain unaudited.
   - Effort: Medium

2. **Centralize transitions, preserve independent payment truth, then issue immutable receipts** — keep the existing enums, move lifecycle/payment mutations behind database authorities, record approval provenance, and issue one snapshot consumed by both print formats.
   - Pros: Fixes the root class once across UI, actions, and integrations; avoids adding workflow states; produces auditable and reproducible receipts.
   - Cons: Requires coordinated database, action, webhook, UI, and test slices plus migration of conflicting test/spec assumptions.
   - Effort: High

3. **Introduce a new workflow engine and printer service** — add more order states, event sourcing, a print queue, and ESC/POS transport now.
   - Pros: Maximum future extensibility.
   - Cons: Adds states, infrastructure, and parallel truth before requirements justify them; exceeds the current problem and review budget.
   - Effort: Very High

### Recommendation
Use approach 2 as six bounded, reviewable phases:

1. **Lifecycle authority** — define and test the transition matrix, route confirmation/cancellation/delivery through atomic database functions, and remove the new-order cancellation dead end without adding another status.
2. **Independent payment approval** — keep `status_pagamento` independent of order status; accept Mercado Pago or explicit manual approval and record actor/source, external reference, timestamp, and previous/new status in append-only audit evidence.
3. **Eligibility and reporting** — define receipt eligibility and realized revenue as `status = entregue AND status_pagamento = aprovado`; update queries/actions before presentation.
4. **Management experience** — redesign actions and state feedback around allowed next transitions, separate operational and payment state visually, and make failures name the valid continuation.
5. **Immutable receipt issuance** — atomically create one idempotent snapshot from order, customer, line-item, totals, delivery, payment, establishment, and issuance metadata; derive two labelled copies from that same snapshot.
6. **Output adapters** — ship shared 58/80 mm browser-print templates first and server-side PDF fallback second. Treat print/PDF as renderers only; defer ESC/POS until hardware, browser/host transport, encoding, and cut-command requirements are known.

Strict TDD should replace tests that currently assert defects before production changes. With `auto-chain` and a 400-line review budget, each phase should be decomposed further into independently verifiable database/domain, application, and presentation PR slices where necessary.

### Risks
- Existing persisted orders may contain combinations that violate the new transition matrix; migration needs an explicit classification/backfill report rather than silently rewriting history.
- The Mercado Pago spec and webhook currently require payment approval to confirm an order, so decoupling needs a deliberate delta requirement and updated integration tests.
- Delivery, payment approval, and receipt issuance can race; database locking and idempotency keys must make eligibility and snapshot creation atomic.
- Manual approval is financially sensitive; authorization alone is insufficient without immutable actor/source/reason evidence.
- Receipt snapshots may contain customer contact/address data; access, retention, logs, and PDF responses must avoid cross-customer disclosure.
- Browser print margins and printable widths vary by driver; 58/80 mm fixtures require structural and real-device acceptance evidence.
- Server-side PDF libraries may add native/runtime weight; select one only after confirming the deployed Next.js runtime and deterministic font support.
- Reusing the inbound `comprovantes` model would create a semantic and authorization defect; the sales-receipt store must remain separate.

### Ready for Proposal
Yes. The proposal should preserve the six-phase order, explicitly modify the existing Mercado Pago coupling, define the authoritative transition/payment matrices, keep ESC/POS out of scope, and require receipt issuance only from the atomic `entregue + aprovado` predicate.
