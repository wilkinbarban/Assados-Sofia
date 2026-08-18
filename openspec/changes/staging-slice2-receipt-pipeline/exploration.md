## Exploration: Staging Residual Fixture Forensic Inventory

### Current State
Receipt `20260715T101439-2528497` was a manual staging-only attempt at `2026-07-15T10:14:39Z` and ended with `cleanup-incomplete`. The runner uses random UUIDs for `slice2-{admin|denied}-<uuid>@invalid.example`, a product named `slice2 fixture`, `fixture` cleanup errors, and `produtos/<product-uuid>/<slot>/<object-uuid>/{full|thumb}.webp` paths. The receipt redacts every generated identifier, so none can be exactly attributed retrospectively.

An authorized read-only inventory used a transient root-only systemd credential context with the staging encrypted credential. It queried only the staging project `mhoqwjatrendnhfnwewv` for the narrow UTC window `2026-07-15T10:11:39Z` through `2026-07-15T10:17:39Z`. No fixture data was changed. The context was collected; its unit is `not-found` afterward.

The inventory did not produce a reliable candidate set: the successful Auth request response could not be locally parsed before its private temporary response was removed; candidate product and pending-cleanup queries returned `404`; Storage listing returned `400`; and the final retry received `401`. These are query/endpoint failures, not evidence of absence.

### Affected Areas
- `scripts/validate-slice2-hosted-receipt.sh` — defines fixture namespaces and cleanup order.
- `supabase/migrations/20260713110019_admin_product_image_lifecycle.sql` — defines pending-cleanup records and permitted path shapes.
- `ops/systemd/asados-slice2-receipt.service` — reference for the encrypted staging credential binding; it remains not installed.
- `openspec/changes/staging-slice2-receipt-pipeline/exploration.md` — records the bounded forensic result.

### Approaches
1. **Preserve the incomplete inventory and request a corrected read-only query plan** — use endpoint/schema validation outside the credential context, then repeat only the failed allowlisted reads.
   - Pros: preserves the evidence boundary; no fixture mutation or smoke is required.
   - Cons: residual fixtures remain unconfirmed.
   - Effort: Low.

2. **Authorize a dedicated forensic read RPC** — deploy a reviewed staging-only read interface that returns only allowlisted candidate IDs and timestamps.
   - Pros: avoids broad Auth/Storage listing and improves future attribution.
   - Cons: requires a source/schema change and separate approval.
   - Effort: Medium.

### Recommendation
Use Approach 1. Do not treat the failed endpoints as an empty inventory and do not remediate any records. First validate the staging REST exposure and the exact Storage list request shape without credentials; then authorize one corrected root-only, read-only inventory using the same six-minute window.

### Risks
- `cleanup-incomplete` proves cleanup closure failed, but not which resource class remains.
- Random UUID fixture identities prevent exact attribution from the redacted receipt alone.
- Product, pending-cleanup, and Storage query failures mean a residual fixture could still exist.

### Ready for Proposal
No — a corrected, explicitly bounded read-only inventory is needed before any cleanup proposal. No candidate IDs are reported because none were reliably observed.
