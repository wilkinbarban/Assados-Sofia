# Dependency risk disposition — 2026-09-07

## Decision

The Category E release removes or patches every npm audit finding rated **high** or **critical**. Two **moderate**, transitive runtime findings are accepted temporarily because their parent packages do not yet publish compatible patched dependency ranges and npm's suggested fixes require replacing the parent APIs.

This acceptance expires on **2026-10-07**. Reassess sooner if `mammoth`, `googleapis`, or `googleapis-common` publishes a compatible release.

## Remediated findings

- Removed the unused direct `pdfjs-dist@3.11.174` dependency. Payment-proof rendering continues through `pdf-parse@2.4.5` and `pdfjs-dist@5.4.296`; the reviewed static viewer assets remain unchanged.
- Removed the legacy `canvas@2` → `@mapbox/node-pre-gyp` → `tar@6.2.1` tree from the lockfile.
- Pinned `browserslist@4.28.9` through the root override.
- Updated `mammoth` to `1.12.2`, the latest compatible parent release available at review time.

## Temporarily accepted findings

| Package path | Severity | Runtime surface | Compensating controls |
|---|---|---|---|
| `mammoth@1.12.2` → `@xmldom/xmldom@0.8.13` | Moderate | Administrative knowledge-document DOCX parsing | Authenticated administrative action; accepted document types and upload limits remain enforced; no change to parsing behavior in this release. |
| `googleapis-common@8.0.2` → `qs@6.15.3` | Moderate | Outbound Google Calendar client request serialization | Server-controlled request objects and fixed Calendar API endpoint; no attacker-controlled query parser endpoint is exposed by this dependency path. |

## Rejected automatic remediation

`npm audit fix` and `npm audit fix --force` were not used. npm's available fixes would cross parent-package and API boundaries without proving compatibility. Direct undeclared transitive replacement was also rejected because it produces an invalid npm dependency tree under the repository's npm version.

## Verification and rollback

Required before merge:

- `npm audit --json`: zero critical/high findings; exactly the two accepted moderate paths above.
- `npm audit --omit=dev --json`: same bounded result.
- Focused PDF render/viewer and Google action tests.
- ESLint, TypeScript, Next.js production build, hermetic Vitest, and service-backed Supabase suites.

Rollback is a revert of the manifest, lockfile, and this disposition document. No database or production state is changed by this work unit.
