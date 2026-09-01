## Exploration: Multichannel Customer Payment Proofs

### Current State
The web chat already validates and stores client PDFs in private `chat-midias`, creates `comprovantes`, hands the conversation to a human, and renders receipt previews. WhatsApp/Evolution and Telegram have independent inbound adapters, but no shared payment-proof admission authority. Payment approval is audited separately through `registrar_status_pagamento`; internal two-copy sales receipts are issued from immutable eligible-order snapshots and MUST remain a separate domain.

Current gaps form one root cluster: channel-specific ingestion lacks a canonical proof lifecycle, identity admission, global byte deduplication, quarantine, order reconciliation, and consistent chat visibility. Existing receipt records also contain two exact duplicates that need deterministic migration without deleting evidence.

### Affected Areas
- `apps/web/src/app/api/chat/midia/route.ts` — current authenticated PDF upload entry point.
- `apps/web/src/app/api/webhooks/{whatsapp,evolution,telegram}/route.ts` — external-channel attachment intake and sender identity.
- `apps/web/src/components/chat/ChatContainer.tsx` — customer admitted-proof visibility.
- `apps/web/src/components/operator/OperatorChatConsole.tsx` — operator preview and actions.
- `apps/web/src/components/comprovantes/ModalVisualizadorComprovante.tsx` — current proof review surface.
- `apps/web/src/app/actions/{admin,pedidos}.ts` — management and audited payment authority adapters.
- `apps/web/src/lib/ai/openrouter.ts` — advisory classification/value extraction only.
- `supabase/migrations/` — canonical proof ledger, links, dedupe, quarantine, audit, and backfill.
- `openspec/specs/{client-payment-receipts,operator-receipts-management,client-unified-chat,bandeja_operador,whatsapp_webhook,payment-approval-audit}/spec.md` — behavioral contracts affected.

### Approaches
1. **Extend each channel independently** — add PDF handling to every webhook and reuse current `comprovantes` rows.
   - Pros: Small initial channel patches.
   - Cons: Duplicates authority, creates inconsistent identity/dedupe/quarantine rules, and couples chat visibility to untrusted intake.
   - Effort: Medium initially, High operationally.

2. **Canonical admission pipeline with thin channel adapters** — every channel submits immutable bytes and provenance to one database-authoritative proof lifecycle; chats project admitted PNG views only.
   - Pros: One security model, global dedupe, auditable reconciliation, deterministic migration, consistent UX.
   - Cons: Requires schema, workers/adapters, migration, and coordinated contract changes.
   - Effort: High.

3. **External document-processing service** — outsource storage, OCR, and workflow.
   - Pros: Specialized extraction tooling.
   - Cons: Adds privacy/vendor risk, new operational dependency, and still requires local financial authority.
   - Effort: High.

### Recommendation
Use approach 2. Persist original PDF bytes privately, hash exact bytes with SHA-256 before admission, and retain tombstones so deletion/quarantine cannot permit re-ingestion. Unknown external senders remain hidden pending manual identity resolution. LLM output is advisory; authorized staff confirm/correct the amount, link only pending orders owned by the same customer, and may approve only when the confirmed amount exactly equals the linked-order total. Human-confirmed external/in-person payments remain possible without a PDF but require audited provenance.

Admitted chat messages expose only a faithful PNG view, never the original PDF or download action. Rejection, quarantine, restoration, and customer notifications use idempotent audited transitions. Backfill selects a deterministic canonical record for the two byte-identical PDFs and preserves both provenance trails.

### Risks
- Private financial documents could leak before identity/admission if chat projection is not fail-closed.
- Hashing after persistence can race across channels; claim/dedupe must be atomic.
- LLM extraction may be wrong or prompt-injected; it cannot mutate identity, links, amounts, or payment state.
- Existing `comprovantes` semantics and current preview work may conflict unless migrated compatibly.
- Cross-channel notification retries can duplicate or contradict rejection/restoration messages.

### Ready for Proposal
Yes. Product rules and non-goals are sufficiently explicit; proposal should preserve sales-receipt separation and defer implementation details to spec/design.
