# Archive Report: Humanized Multichannel Sofia Responses

**Status: PASS** — change archived after successful archive-time spec composition.

- Change: `humanized-multichannel-sofia-responses`
- Archived to: `openspec/changes/archive/2026-09-18-humanized-multichannel-sofia-responses/`
- Archive date: 2026-09-18
- Artifact store: `openspec` (native status) with hybrid memory save
- Native status consumed: `gentle-ai sdd-status humanized-multichannel-sofia-responses --cwd /home/wilkin/proyectos/CRM_Sofia_Manager` → `next: archive`, `apply: all_done`, `archive: ready`, `tasks 36/36 complete`, `blockedReasons: []`

## Artifacts read

| Artifact | Path | State |
| --- | --- | --- |
| Task completion | `tasks.md` | 36/36 checked, zero `- [ ]` |
| Delivery status | `tasks.md` `## Delivery status (reconciled against main)` | Delivered to `main` |
| Apply progress | `apply-progress.md` | Cumulative; superseded planning record preserved verbatim |
| Exploration | `exploration.md` | Present |
| Proposal | `proposal.md` | Read |
| Design | `design.md` | Read; Decision 2 superseded on pacing arithmetic |
| Specs (deltas) | `specs/{evolution_api,integracoes,portal_chat,rag_conhecimento}/spec.md` | Read; all four composed |
| Verify report | — | Absent by design (verification explicitly optional) |
| Sync report | — | Absent; not required (archive owns composition) |
| Config | `openspec/config.yaml` | Read; `persistence.mode: both` |

Native status `artifacts.verifyReport: missing` is not an admission gate: verification is explicitly optional for this change and a missing optional report is not a blocker.

## Final task completion gate

Re-read `openspec/changes/humanized-multichannel-sofia-responses/tasks.md` immediately before composition.

- Unchecked implementation tasks matching `^\s*- \[ \]`: **none** (`grep` exit 1).
- Checked tasks: **36**.
- No stale-checkbox reconciliation was needed or performed. `tasks.md` bytes were not modified.

## Domains composed

All four deltas were pending (not previously applied). Independent check: no requirement name from this change existed in any canonical spec, and `git log -- openspec/specs/` shows no prior composition of this change.

| Domain | Canonical path | Operation | Requirements |
| --- | --- | --- | --- |
| `evolution_api` | `openspec/specs/evolution_api/spec.md` | ADDED | `Evolution durable batch adoption and composing pace` |
| `integracoes` | `openspec/specs/integracoes/spec.md` | ADDED | `Telegram durable batching and typing lifecycle` |
| `portal_chat` | `openspec/specs/portal_chat/spec.md` | ADDED | `Web durable Sofia batching replaces direct generation`, `Durable authorized Web Sofia presence`, `Web presence tenant authorization` |
| `rag_conhecimento` | `openspec/specs/rag_conhecimento/spec.md` | ADDED | `Durable multichannel Sofia batch scheduling`, `Claim-bound batch membership and ordered context`, `Policy-safe and crash-fenced response authority`, `Humanized post-authority response pacing`, `Default-closed multichannel adoption` |

**ADDED requirement names (9 total):** as listed above. **MODIFIED: none. REMOVED: none.**

Composition applied only to pending ADDED operations. No existing canonical requirement was replaced or deleted, and no canonical content unrelated to this change was touched.

### Form of the write

Canonical `evolution_api`, `portal_chat` and `rag_conhecimento` previously contained **zero** `### Requirement:` blocks, so the repository convention was used: a new section `## Requirements added by \`humanized-multichannel-sofia-responses\`` appended at the end of each canonical file. `integracoes` already held a same-shaped section attributed to `atendimento-global-sofia-status-control`; per-change attribution sections are preserved, so this change's requirements were appended in their own section rather than merged into another change's record.

Parity verified: the appended requirement blocks are byte-identical to the delta requirement/scenario blocks, minus the delta-only `## ADDED Requirements` scaffolding heading.

## Corrections folded into the canonical spec of record

Two artifact-level corrections were already resolved before archive and are recorded here for traceability.

1. **`rag_conhecimento` timing corrected at the source.** The delta stated 10 s sliding silence / 20 s cap. It was corrected in place to a **25-second** sliding silence window under a **60-second** starvation cap, matching shipped behaviour restored by `15cdd6a` (`supabase/migrations/20260913010000_sofia_timing_and_pacing_correction.sql`) and documented in `docs/runbooks/sofia-multichannel-status-and-handover.md`. The corrected values were re-read and confirmed before composition, and the delta's correction note is carried into the canonical requirement. The delta file was **not** re-edited by archive.
2. **`design.md` Decision 2 is superseded on the pacing arithmetic.** Delivered SQL is `least(6000, 2000 + least(units, 500) * 10)`, pinned by `supabase/tests/sofia_pacing_core_b.sql` (`repeat('a',100) -> 3000`). Decision 2 states `2000 + max(0, length - 100) * 10`, which would yield 2000 for the same input and contradict the pin. The correction migration also dropped the generation-elapsed subtraction at the SQL layer. `design.md` was deliberately left untouched as historical bytes; the canonical requirement carries the shipped pacing rule (`max(0, computed_minimum - generation_elapsed)`).

## Composition order decision (user-authorized)

The user explicitly authorized the composition order: **this change composes first.** Requirement names do not overlap with the pending changes below, so this is a deliberate ordering decision and not a destructive merge. No destructive merge was performed or required.

## Follow-ups owed (cross-change reconciliation)

Recorded as follow-ups, not blockers:

1. **Two active changes hold pending deltas against the same canonical files**, and they must compose **after** this change:
   - `openspec/changes/atendimento-preview-and-sofia-inbound-batching/specs/{evolution_api,rag_conhecimento}/spec.md`
   - `openspec/changes/whatsapp-sofia-sleep-wake-control/specs/{evolution_api,rag_conhecimento}/spec.md`
2. **The durable-batching concept is defined by more than one change with different parameters.** `atendimento-preview-and-sofia-inbound-batching` defines its own batching requirements (`Durable per-conversation Sofia inbound batches`, `Ordered batch context and bounded response`, `Claim, retry, and terminal batch safety`, `Claim-time Sofia eligibility enforcement`, `Batch observability and rollback safety`) whose parameters differ from the 25 s / 60 s contract now canonical here. A **cross-change reconciliation is owed** so the canonical domain spec does not carry two parameterisations of the same concept.
3. **Native `sameDomainActiveChanges` (empty) did not detect this folder-level collision.** Native readiness signalled no conflict while three active changes held deltas against `evolution_api`, `rag_conhecimento`, `portal_chat` and `integracoes`. Detection came from inspecting `openspec/changes/*/specs/{domain}/spec.md` directly. This is a native-status gap worth reporting upstream.

## Delivery and verification facts at close

- Delivered on `main` across twelve commits `bd275ae`..`dc9dcec` (2026-09-11 → 2026-09-13): `a25dcb7`, `bf4b2e2`, `c93a7ad`, `27db2cd`, `fc15cb4`, `41c007e`, `591c2db`, `f2b0733`, `a792086`, `cbe169a`, `15cdd6a`, `dc9dcec`. `2585a70` lies in the range but is unrelated.
- Two later slices closed the final gaps: `f8986e4` (Web atomic and idempotent admission — `supabase/migrations/20260914010000_sofia_web_atomic_admission.sql`, its pgTAP suite, caller wiring) and `d4b9d2b` (`apps/web/src/lib/sofia/response-pace.ts`, unit suite, migration-parity drift guard).
- Test evidence at close: 16 Vitest cases across the two new pacing files; 20 across the two new Web admission files plus 10 in `tests/unit/cliente/chat.test.tsx`; `tsc --noEmit` exit 0; eslint exit 0. The full repository Vitest suite carries ten unrelated pre-existing failures.
- Issue **4283 is not a blocker**; the work merged. Any earlier claim that it gated apply survives only as historical bytes.
- **No `verify-report.md` exists, by design** — verification is optional and its absence is not a missing-artifact gate.

## Destructive merge approvals or blockers

- Destructive merges (REMOVED requirements, large MODIFIED replacements): **none required**. No approval requested.
- Blockers remaining at archive time: **none**.

## Structured status and actionContext findings

| Field | Value |
| --- | --- |
| `schemaVersion` | 2 |
| `artifactStore` | `openspec` |
| `nextRecommended` | `archive` (consumed, not recomputed) |
| `applyState` | `all_done` |
| `taskProgress` | 36 / 36, `allComplete: true` |
| `dependencies.archive` | `ready` |
| `blockedReasons` | `[]` |
| `actionContext.mode` | `repo-local` — `allowedEditRoots` not required |
| `allowedEditRoots` | `/home/wilkin/proyectos/CRM_Sofia_Manager` — all canonical and archive paths fall inside |

All canonical writes and the archive move were confined to the authoritative workspace root and its allowed edit roots, including resolved symlink targets. The archive destination did not previously exist, so nothing was overwritten.

## Files written or moved

- Written before move: `openspec/changes/humanized-multichannel-sofia-responses/archive-report.md` (this file)
- Composed: `openspec/specs/evolution_api/spec.md` (+23), `openspec/specs/integracoes/spec.md` (+22), `openspec/specs/portal_chat/spec.md` (+44), `openspec/specs/rag_conhecimento/spec.md` (+103)
- Moved: `openspec/changes/humanized-multichannel-sofia-responses/` → `openspec/changes/archive/2026-09-18-humanized-multichannel-sofia-responses/`
- Not touched by archive: `tasks.md`, `design.md`, `proposal.md`, all delta specs, all source files, migrations and tests. `apply-progress.md` retains its superseded planning record verbatim.

## Memory observation IDs

- Archive report: `sdd/humanized-multichannel-sofia-responses/archive-report` (Engram, project `CRM_Sofia_Manager`).
- Prior phase observations retain their own IDs; no canonical spec topics were created or required in Engram.

## Next recommended

None — the change is closed. Owed follow-up: run the cross-change batching reconciliation listed under **Follow-ups owed** before or during the composition of `atendimento-preview-and-sofia-inbound-batching` and `whatsapp-sofia-sleep-wake-control`.
