# Proposal: cliente-chat-modulo

## Intent
Provide a unified Chat interface for clients as the primary landing page upon verified login. This enables clients to chat with Sofia and agents, view messages from unified channels (WhatsApp, Telegram, Web), and drag-and-drop catalog cards to start an order with Sofia.

## Scope

### In Scope
- **Shared client layout**: Navigation tabs for "Chat" and "Perfil".
- **Default route**: `/cliente` redirects or points directly to Chat.
- **Profile path migration**: Move settings/phone verification views from `/cliente/configuracoes` to `/cliente/perfil` while retaining the verification check.
- **Unified chat view**: Interface displaying message history with channel source indicators.
- **Catalog side panel**: Panel displaying product cards (image, name, price) supporting HTML5 Drag and Drop.
- **Drop zone**: Chat area detecting product drops to trigger AI ordering dialogue.
- **Server actions reuse**: Reuse existing `processarIaChat`, `listarHorarios`, and `produtos` actions.

### Out of Scope
- Direct modification of core AI ordering logic in the server-side pipeline.
- Payment gateway integration inside the chat panel.

## Capabilities

### New Capabilities
- `client-unified-chat`: Unified chat interface with channel indicators and catalog drag-and-drop drop zone.
- `client-drag-drop-menu`: Product catalog side panel with HTML5 drag-and-drop capabilities.

### Modified Capabilities
- `client-navigation`: Shared client layout, navigation tabs, redirecting `/cliente` to chat, and settings moved to `/cliente/perfil`.

## Approach
Implement a Next.js shared nested layout (`src/app/cliente/layout.tsx`) wrapping the client pages to provide unified tab-based navigation.
- Move logic from `configuracoes/page.tsx` to `perfil/page.tsx`.
- Create a redirect page at `/cliente/page.tsx` pointing to `/cliente/chat`.
- Implement `Sidebar` / `SidePanel` component for catalog products.
- Enhance `ChatContainer` with HTML5 drag-and-drop (`onDragOver`, `onDrop`) and register drop actions to call `processarIaChat` automatically.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/app/cliente/layout.tsx` | New | Client area shell with navigation tabs (Chat, Perfil). |
| `src/app/cliente/page.tsx` | New | Redirect handler or entry point for `/cliente` to chat. |
| `src/app/cliente/chat/page.tsx` | Modified | Adjusted styling, wrapper, and layout components. |
| `src/app/cliente/configuracoes/` | Removed | Deleted in favor of `/cliente/perfil`. |
| `src/app/cliente/perfil/` | New | New location for settings and telephone verification. |
| `src/components/chat/` | Modified | Chat input/history updated with drag-and-drop/channel badges. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Middleware redirect loop | Low | Keep `/cliente/verificar-telefone` outside client layout redirect. |
| Drag-and-drop mobile fallback | Medium | Support direct tap-to-add/click actions on catalog cards. |

## Rollback Plan
1. Revert Git changes to restore `/cliente/configuracoes` and delete new files.
2. Ensure routing redirects in middleware/Next config are removed.

## Dependencies
- Existing `processarIaChat` server action.
- Supabase realtime subscriptions for messaging.

## Success Criteria
- [ ] Direct `/cliente` request shows Chat interface.
- [ ] Users can navigate between Chat and Perfil tabs without full page reloads.
- [ ] HTML5 drop event on chat triggers AI order query.
- [ ] Message histories render correct channel origin badges.
