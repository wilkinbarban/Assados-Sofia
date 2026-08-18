# Asados Design System

## 0. Scope

This contract extracts the existing operational UI used by the admin dashboard. It preserves the current dark, compact visual language for active admin and supervisor workflows. It does not introduce a new brand direction or a component library.

Evidence: `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/atendimento/admin/page.tsx`, `apps/web/src/components/operator/AdminDashboard.tsx`, and `apps/web/src/components/operator/InventoryManager.tsx`.

## 1. Foundations

- Canvas: `zinc-950` / `#09090b`; primary foreground: `zinc-50` / `#fafafa`.
- Surfaces: `zinc-900` with restrained transparency; separators use `zinc-800` or `zinc-800/60`.
- Primary operational accent: amber (`amber-400` to `amber-500`).
- Semantic state: emerald for success or active, rose for error or destructive action, amber for warning and confirmation, zinc for neutral context.
- Display and UI type: Outfit. Identifiers, paths, timestamps, and technical metadata: JetBrains Mono.
- Icons: Lucide only. Do not use emoji as an icon.

## 2. Layout And Density

- Admin header height is `h-16`; content remains dense and scan-oriented.
- Panels use `rounded-xl` or `rounded-2xl`, a `zinc-800` border, `zinc-900` surface, and a restrained shadow.
- Prefer compact tables on wide screens and stacked metadata rows on narrow screens.
- Default spacing rhythm: 8, 12, 16, and 24px equivalents through existing Tailwind utilities.
- Object paths must wrap or truncate safely without hiding the current status or available action.

## 3. Reusable Primitives

- `AdminPageHeader`: title, concise operational description, and optional primary action.
- `AdminPanel`: dark bordered container for a bounded operational task.
- `AdminStatusBadge`: neutral, info, warning, success, and error variants with text labels; color is never the only status signal.
- `AdminNotice`: inline success, warning, or error feedback for a panel.
- `ConfirmActionDialog`: modal for an irreversible or externally visible action; it states the target and consequence before confirming.

## 4. Interaction Rules

- Buttons show a pending state and are disabled while their action is in flight.
- A dry-run scan never starts on mount and never removes Storage objects.
- Approval and execution are separate steps. Execution requires an approved row and a second explicit confirmation.
- Toasts remain brief and use the existing `rounded-2xl` zinc overlay pattern. Persistent action failures also remain visible inline.
- No automatic retries of destructive Storage work from the UI.

## 5. Responsive Behavior

- Validate at 375px, 768px, and 1280px wide.
- At 375px, panel controls stack, technical paths remain reachable, and dialogs fit with `p-4` viewport padding.
- At 768px and above, keep status, age, attempts, and actions readable without excessive vertical scrolling.
- At 1280px, use dense tabular alignment while preserving a distinct action column.

## 6. Accessibility And Cognitive Constraints

- Every icon-only control has an accessible label.
- Confirmation dialogs manage focus, close with Escape, and have a visible close action.
- Status uses text plus icon/color; errors name the failed operation without exposing provider or Storage internals.
- Destructive execution uses plain language: the selected path, approval state, and consequence are visible before confirmation.
- Low motion only: use existing opacity/transform transitions for modal and toast entry; honor reduced-motion preferences when adding animation.

## 7. Accepted Debt

- The existing `AdminDashboard` centralizes several concerns and still owns its current toast/modal implementation. New operational panels remain isolated instead of refactoring the dashboard as part of S8.
- The first S8 slice exposes existing queue/RPC state only; it does not add a new approval workflow to the database.

## 8. Verification

- Unit tests cover action authorization, explicit approval, and execution gating.
- Browser QA covers the admin reconciliation tab at 375px, 768px, and 1280px, including keyboard focus, disabled controls, dialog confirmation, and error feedback.
- Visual changes must retain the zinc/amber/emerald/rose semantic mapping and compact operational density described above.
