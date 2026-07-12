## Exploration: Chat Module in the Client Area

### Current State
Today, the client dashboard has pages under [src/app/cliente/](file:///home/wilkin/proyectos/Asados/src/app/cliente/) for:
- [chat/page.tsx](file:///home/wilkin/proyectos/Asados/src/app/cliente/chat/page.tsx): Renders the web-chat container.
- [configuracoes/page.tsx](file:///home/wilkin/proyectos/Asados/src/app/cliente/configuracoes/page.tsx): Handles profile settings and verification of new telephone numbers.
- [verificar-telefone/page.tsx](file:///home/wilkin/proyectos/Asados/src/app/cliente/verificar-telefone/page.tsx): Verifies the phone number using OTP.

However, there is no shared client layout or unified navigation system (e.g. sidebar, footer bar, or tabs) to allow a user to switch back and forth. Instead, both pages exist as standalone route entry points and render their own header components independently.

**Database Schema & Storage for Messages:**
- `conversas` table: Stores active client sessions. Columns include `id`, `cliente_id`, `status` (`'ia_atendendo'`, `'aberta'`, `'fechada'`), `ia_ativa` (boolean), `data_criacao`, and `data_atualizacao`.
- `mensagens` table: Stores individual messages. Columns include `id`, `conversa_id`, `remetente` (`'cliente'`, `'operador'`, `'ia'`), `conteudo`, `url_anexo`, `whatsapp_mensagem_id`, `telegram_mensagem_id`, and `data_criacao`.
- `whatsapp_sofia_states` table: Controls whether Sofia is active/sleeping on WhatsApp per customer.
- Real-time updates: The publication `supabase_realtime` is enabled on the `conversas` and `mensagens` tables, enabling the client chat interface to subscribe to instant changes.
- Media files are stored privately in the `chat-midias` storage bucket.

**Sofia Response and Webhook Integration:**
- Webhook routes process inbound messages from external channels:
  - [src/app/api/webhooks/whatsapp/route.ts](file:///home/wilkin/proyectos/Asados/src/app/api/webhooks/whatsapp/route.ts)
  - [src/app/api/webhooks/telegram/route.ts](file:///home/wilkin/proyectos/Asados/src/app/api/webhooks/telegram/route.ts)
  - [src/app/api/webhooks/evolution/route.ts](file:///home/wilkin/proyectos/Asados/src/app/api/webhooks/evolution/route.ts)
- Webhooks register clients automatically, save incoming messages, and trigger the RAG pipeline asynchronously if the AI is active.
- For client web-chat, [ChatContainer.tsx](file:///home/wilkin/proyectos/Asados/src/components/chat/ChatContainer.tsx) triggers the server action [processarIaChat](file:///home/wilkin/proyectos/Asados/src/app/actions/chat.ts), which calls the RAG pipeline.
- The pipeline [processarRagPipeline](file:///home/wilkin/proyectos/Asados/src/lib/ai/openrouter.ts) uses:
  - RPC `buscar_artigos_relevantes(query_text)` to read articles from `base_conhecimento`.
  - RPC `buscar_produto_por_nome(p_nome)` or `buscar_produtos_disponiveis()` to retrieve menu data from `produtos` if a product/menu intent is detected.
  - The last 10 messages from `mensagens` for context history.
  - A System Prompt containing hardcoded Portuguese-only constraints and a prohibition on automatic order confirmations.
  - OpenRouter (or DeepSeek if configured) to generate responses.

**Products & Stock Retrieval:**
- Products are stored in the `produtos` table (columns `id`, `nome`, `descricao`, `preco_centavos`, `url_imagem`, `url_imagem_thumb`, `url_imagem_2`, `url_imagem_2_thumb`, `quantidade_estoque`, `estoque_minimo`, and `controlar_estoque`).
- Stock movements are logged in the `movimentacoes_estoque` table.
- Product retrieval for chatbot queries is executed using PG functions/RPCs (`buscar_produtos_disponiveis` and `buscar_produto_por_nome`).
- Operator-focused operations are handled via actions like [src/app/actions/produtos.ts](file:///home/wilkin/proyectos/Asados/src/app/actions/produtos.ts) and [src/app/actions/estoque.ts](file:///home/wilkin/proyectos/Asados/src/app/actions/estoque.ts).
- Category categorization is not present in the codebase; products are flatly structured in the `produtos` table.

---

### Affected Areas
- [src/app/cliente/](file:///home/wilkin/proyectos/Asados/src/app/cliente/) — Folder containing routes that will need layout integration.
- `src/app/cliente/layout.tsx` — A new file to define client-wide UI wrapping (side navigation or top bar tabs).
- [src/app/cliente/chat/page.tsx](file:///home/wilkin/proyectos/Asados/src/app/cliente/chat/page.tsx) — Will be adjusted to remove redundant global page layout classes.
- [src/app/cliente/configuracoes/page.tsx](file:///home/wilkin/proyectos/Asados/src/app/cliente/configuracoes/page.tsx) — Will be adjusted to remove duplicate navigation headers.

---

### Approaches

1. **Approach A: Next.js Shared Nested Layout with Sub-pages**
   - Implement a new `layout.tsx` under [src/app/cliente/](file:///home/wilkin/proyectos/Asados/src/app/cliente/) providing shared client navigation (tabs or side menu to switch between "Chat" and "Configurações"). Maintain current sub-pages `/cliente/chat` and `/cliente/configuracoes` as normal sub-routes.
   - **Pros:**
     - Natural deep-linking and routing using Next.js out-of-the-box mechanisms.
     - Clean separation of concerns (Chat logic stays in `chat/page.tsx`, settings in `configuracoes/page.tsx`).
     - Standard Next.js architecture pattern that supports loading/error states individually.
   - **Cons:**
     - Requires moving navigation/headers out of existing pages into the layout.
   - **Effort:** Low

2. **Approach B: Unified Client Page with Local Tab State**
   - Consolidate settings and chat under a single route (e.g., `/cliente/dashboard`) using React state `const [activeTab, setActiveTab] = useState('chat')` to swap components in-place.
   - **Pros:**
     - Faster client-side transitions since both pages are mounted in memory.
     - Simpler shared React state if we need to pass active conversation information between components.
     - Reduces API requests during switching.
   - **Cons:**
     - Poor URLs for sharing and bookmarks (cannot directly link to settings).
     - Component files grow large and harder to maintain.
     - Requires refactoring and removing the current `/cliente/chat` and `/cliente/configuracoes` sub-routes, necessitating redirection logic.
   - **Effort:** Medium

---

### Recommendation
We recommend **Approach A (Next.js Shared Nested Layout)**. It aligns with standard Next.js directory-based routing, enables clean bookmarks and deep-linking, keeps component sizes manageable, and avoids major rewrites of existing state management.

---

### Risks
- **RLS & Middleware Conflicts:** When implementing new routes or layouts, the middleware block (redirecting to `/cliente/verificar-telefone` if the phone isn't verified) must not get caught in recursive redirect loops.
- **Header Alignment:** Ensure headers in layout don't conflict or duplicate headers from component sub-containers (e.g. ChatContainer).

---

### Ready for Proposal
**Yes**. The codebase structure is clear. We are ready to define the implementation specification for creating a shared client area layout and adding tabs/navigation to switch between the Chat module and configurations.
