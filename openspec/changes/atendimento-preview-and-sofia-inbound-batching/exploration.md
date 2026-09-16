# Architecture & Exploration Notes: atendimento-preview-and-sofia-inbound-batching

## 1. Change Scope & Summary

This exploration covers two reviewable operational outcomes for the Asados platform:
- **Outcome A**: Make the Atendimento 'Visualizar Comprovante Anexo' button choose exactly one deterministic preview path (canonical authenticated payment proof preview when `payment_proof_id` exists, otherwise authenticated `url_anexo` media preview), with visible failure handling instead of no-ops.
- **Outcome B**: Batch inbound Sofia messages per customer/conversation across Telegram and WhatsApp/Evolution using durable server-side scheduling (5 seconds silence window after the latest message, 20 seconds maximum wait from the first message), aggregating text and attachments into ordered context and emitting a single response per batch while preserving channel-specific intake, idempotency, human handoffs, opt-outs, and financial authority boundaries.

---

## 2. Outcome A: Atendimento Receipt Preview Path

### 2.1 Current Defect Analysis
In `apps/web/src/components/operator/OperatorChatConsole.tsx` (~line 740):
- When a recent message has **both** `url_anexo` and `payment_proof_id`, the action handler currently:
  1. Dispatches `asados:open-attachment-preview` (triggering inline attachment card preview/scroll).
  2. Calls `handleAbrirVisualizador(...)` (opening `ModalVisualizadorComprovante`).
- When `payment_proof_id` is missing and `url_anexo` exists, `asados:open-attachment-preview` is dispatched. If the inline card preview fails to load or cannot render the file, the action silent-fails with no user feedback.

### 2.2 Deterministic Path Resolution Rules
1. **Canonical Payment Proof Path (`payment_proof_id` present)**:
   - Target: `handleAbrirVisualizador('/api/payment-proofs/${mensagemRecente.payment_proof_id}/preview', 'comprovante.png', mensagemRecente.payment_proof_id)`.
   - Explicitly suppression: DO NOT dispatch `asados:open-attachment-preview`.
2. **Authenticated Media Path (`payment_proof_id` absent, `url_anexo` present)**:
   - Target: Open authenticated media preview via modal or scroll-to-card preview deterministically.
   - DO NOT trigger double invocation of proof preview and attachment preview handlers.
3. **Visible Failure Feedback**:
   - If media/proof fetching fails or endpoint returns non-OK status, show visible feedback in the UI (error notification/toast or error state inside modal: *"Não foi possível carregar a visualização do comprovante"*) instead of silent failure.

### 2.3 Affected Files & Tests
- `apps/web/src/components/operator/OperatorChatConsole.tsx`
- `apps/web/src/components/comprovantes/ModalVisualizadorComprovante.tsx`
- `tests/components/operator/OperatorChatConsoleAttachmentBanner.test.tsx`
- `tests/components/operator/AttachmentCard.test.tsx`

---

## 3. Outcome B: Inbound Sofia Message Batching Topology

### 3.1 Durable Server-Side Batching Architecture
To survive serverless reloads, pod restarts, and multi-instance concurrency, in-memory `setTimeout` is excluded. Batching relies on database persistence and server-side scheduling.

#### Database Schema: `public.sofia_inbound_batches`
```sql
CREATE TABLE IF NOT EXISTS public.sofia_inbound_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversa_id UUID NOT NULL REFERENCES public.conversas(id) ON DELETE CASCADE,
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    canal TEXT NOT NULL CHECK (canal IN ('whatsapp', 'telegram')),
    first_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    latest_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    scheduled_process_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled', 'failed')),
    locked_at TIMESTAMPTZ,
    locked_by TEXT,
    data_criacao TIMESTAMPTZ NOT NULL DEFAULT now(),
    data_atualizacao TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_sofia_inbound_batches_pending_conversa
    ON public.sofia_inbound_batches (conversa_id)
    WHERE status = 'pending';

CREATE INDEX idx_sofia_inbound_batches_schedule
    ON public.sofia_inbound_batches (scheduled_process_at)
    WHERE status = 'pending';
```

#### Timings & Scheduling Formulas
- **Silence Window**: 5 seconds (`latest_message_at + interval '5 seconds'`)
- **Max Wait Timeout**: 20 seconds (`first_message_at + interval '20 seconds'`)
- **Formula**: `scheduled_process_at = LEAST(latest_message_at + 5s, first_message_at + 20s)`

### 3.2 Ingestion Flow Integration
- **Telegram Intake** (`apps/web/src/app/api/webhooks/telegram/route.ts`):
  - Deduplicate message key immediately.
  - Process canonical payment proofs immediately (bypassing batch delay for intake ledger).
  - Check sleep state, business hours, opt-out.
  - Persist message to `mensagens`.
  - If `ia_ativa` is true, atomically upsert `sofia_inbound_batches` instead of calling `processarRagPipeline` directly.
- **Evolution WhatsApp Intake** (`apps/web/src/app/api/webhooks/evolution/route.ts`):
  - Deduplicate message key immediately.
  - Process canonical payment proof intake immediately.
  - Check sleep state (`whatsapp_sofia_states`), business hours, contact opt-out.
  - Persist message to `mensagens`.
  - If `ia_ativa` is true, atomically upsert `sofia_inbound_batches`.

### 3.3 Race Condition & Edge Case Protections
1. **Concurrent Message Arrival**:
   - If a batch is currently `status = 'pending'`, an incoming message updates `latest_message_at = now()` and updates `scheduled_process_at = LEAST(now() + 5s, first_message_at + 20s)`.
   - If a batch is `status = 'processing'`, an incoming message creates a new pending batch starting at `first_message_at = now()`.
2. **Handoff / Pause Mid-Silence**:
   - When the worker locks a batch for processing, it re-evaluates `ia_ativa` and `sofia_dormindo`. If an operator paused the chat or customer opted out during the 5s window, the batch is marked `cancelled` without generating an LLM response.
3. **Financial Authority Boundary**:
   - Sofia never approves, rejects, reconciles, or confirms money. Payment proof confirmation remains strictly within payment proof admin workflows.

---

## 4. Shared vs Channel-Specific Map

| Component / Layer | Shared Path | Channel-Specific Path |
|---|---|---|
| Inbound Deduplication | `mensagens` lookup | Telegram (`telegram_mensagem_id`), Evolution (`whatsapp_mensagem_id`) |
| Payment Proof Intake | `ingestEvolutionCanonicalPaymentProof` / `queueCanonicalPaymentProof` | Telegram bot API vs Evolution API downloads |
| Sleep & Handoff State | `conversas.ia_ativa`, `sofia-control.ts` | WhatsApp (`whatsapp_sofia_states`), Telegram (`conversas.ia_ativa`) |
| Batch Persistence | `sofia_inbound_batches` table | Webhook handlers enqueue per `canal` |
| RAG Prompt Assembly | `processarRagPipeline` | Aggregates all batched messages chronologically |
| Response Delivery | Outbox dispatch contract | Telegram API (`sendMessage`) vs Evolution API (`sendText`) |

---

## 5. Work-Unit Commit Plan & Likely PR Boundaries

Given the session review budget of 400 changed lines, the work is sliced into cohesive work units across 2 chained PRs:

### PR 1: Deterministic Preview Path & Visible Failure (Outcome A)
- **Work Unit 1.1**: Update `OperatorChatConsole.tsx` button logic to select payment proof preview vs media preview deterministically.
- **Work Unit 1.2**: Add error toast / modal failure handling for preview load errors.
- **Work Unit 1.3**: Update unit tests in `OperatorChatConsoleAttachmentBanner.test.tsx` and `AttachmentCard.test.tsx`.
- **Forecast**: ~120 lines.

### PR 2: Durable Inbound Sofia Message Batching (Outcome B)
- **Work Unit 2.1**: Migration for `sofia_inbound_batches` table, indexes, and queue helper functions.
- **Work Unit 2.2**: Update Telegram and Evolution webhook handlers to enqueue batch rows.
- **Work Unit 2.3**: Update `processarRagPipeline` and batch runner service to process aggregated messages and emit single responses.
- **Work Unit 2.4**: Unit & integration tests for 5s silence, 20s max-wait, and handoff cancellation.
- **Forecast**: ~350 lines.

---

## 6. SDD Result Contract

```yaml
change_name: atendimento-preview-and-sofia-inbound-batching
phase: explore
status: complete
skill_resolution: paths-injected
artifacts:
  - openspec/changes/atendimento-preview-and-sofia-inbound-batching/exploration.md
review_budget: 400
forecast_lines: 470
delivery_strategy: ask-on-risk
suggested_pr_chain:
  - name: pr1-deterministic-receipt-preview
    units: [1.1, 1.2, 1.3]
    lines: ~120
  - name: pr2-durable-sofia-message-batching
    units: [2.1, 2.2, 2.3, 2.4]
    lines: ~350
```
