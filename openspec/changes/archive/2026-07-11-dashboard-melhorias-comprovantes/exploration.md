## Exploration: Dashboard Improvements and PDF Payment Receipt Attachment

### Current State
Currently, the application allows users to send file attachments through the chat interface (`ChatContainer.tsx`), which are uploaded directly to the private Supabase storage bucket `chat-midias`. However, there is no validation for PDF file types at the magic bytes level, no strict file size validation (other than general network/Supabase limits), and no dedicated dashboard section for reviewing payment receipts ("comprovantes").

Additionally, routing and layouts are managed dynamically:
- Layouts check active routes using `x-pathname` from the request headers to render appropriate navigation states (e.g. Chat vs. Perfil).
- User authentication and role-based redirects (`admin`, `supervisor`, `vendedor`, `cliente`) are handled both in the login action (`src/app/login/page.tsx`) and within Next.js Middleware (`middleware.ts`).
- Administrative dashboards (`src/components/operator/AdminDashboard.tsx`) render a multi-tab sidebar based on the `activeTab` state but lack a view specifically for managing, viewing, or validating payment receipts.

### Affected Areas
- [src/components/chat/ChatContainer.tsx](file:///home/wilkin/proyectos/Asados/src/components/chat/ChatContainer.tsx) — Needs updates in the `handleFileChange` method to check file size limits, MIME type, and read the first 4 bytes using a `FileReader` (`ArrayBuffer`) to check for the PDF magic bytes signature (`%PDF`).
- [src/components/operator/AdminDashboard.tsx](file:///home/wilkin/proyectos/Asados/src/components/operator/AdminDashboard.tsx) — Needs modification of the `TabType` enum to include `'comprovantes'`, addition of a navigation button in the sidebar, and rendering a view for managing receipts.
- [src/app/actions/admin.ts](file:///home/wilkin/proyectos/Asados/src/app/actions/admin.ts) — Needs new server actions to fetch, approve, or reject payment receipts.
- [supabase/migrations/](file:///home/wilkin/proyectos/Asados/supabase/migrations) — Needs a new migration to support linking payment receipts directly to orders (e.g. adding a `url_comprovante` column to the `pedidos` table).

### Approaches

1. **Option A: Link Receipts implicitly via Chat Messages & Attachments**
   - **Description**: Rely entirely on existing database models. When a user uploads a PDF, the admin dashboard queries the `mensagens` table for any message containing a URL with a `.pdf` extension.
   - **Pros**:
     - No database schema changes/migrations needed.
     - Extremely lightweight.
   - **Cons**:
     - Fragile: hard to link a specific PDF receipt to a specific order without manual guessing.
     - Prone to picking up non-payment PDFs (e.g., menu copies or guides).
   - **Effort**: Low

2. **Option B: Direct Relation between Orders and Receipts (Recommended)**
   - **Description**: Add a `url_comprovante` column to the `pedidos` table (via database migration). When a client uploads a PDF receipt, or when it's automatically captured in chat, it is linked to the active `pedido` record. The "Comprovantes" tab then queries `pedidos` where `status_pagamento = 'pendente'` and `url_comprovante IS NOT NULL`.
   - **Pros**:
     - Robust and explicit relationship between a payment receipt and its corresponding order.
     - Clean, structured dashboard view showing the client name, order items/totals, and the PDF receipt preview side-by-side.
     - Prevents orphaned attachments.
   - **Cons**:
     - Requires database migration (`ALTER TABLE public.pedidos ADD COLUMN url_comprovante TEXT`).
     - Requires updating the UI/backend to link the uploaded file to the active order.
   - **Effort**: Medium

### Recommendation
**Option B** is highly recommended. It guarantees data integrity by explicitly associating the payment receipt with the respective order, rather than relying on unstructured chat message parsing. This matches professional billing standards and provides operators with a much cleaner workflow to approve/reject payments.

### Risks
- **Security / Magic Bytes Verification**: Reading magic bytes is performed in the client-side browser before upload. If users upload via APIs or direct Supabase clients, client-side validation is bypassed. Database policies or a Supabase Edge Function validation should be considered to harden uploads.
- **Concurrent Approvals**: Multiple operators might try to approve/reject the same receipt simultaneously. We should handle status transition locking or UI updates carefully.

### Ready for Proposal
Yes. The codebase structure is well-organized, and the proposed changes to redirects, layout tabs, file upload validations, and admin panel additions fit naturally within the established patterns.
