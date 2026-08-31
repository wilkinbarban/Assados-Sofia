# Pull Request

> Link one approved issue, select one PR type, and give reviewers a focused verification path.

## Approved issue reference (required)

- Approved issue: #<!-- approved issue number -->
- Issue reference (use one):
  - Child/slice PR: `Refs #N` or `Part of #N` so the issue remains open.
  - Final tracker or single final PR: `Closes #N`, `Fixes #N`, or `Resolves #N` only when completion should close the issue.

> If repository CI later enforces closing keywords on every PR, reconcile that CI requirement with the chain policy before publication.

## PR type (required — select exactly one)

- [ ] Bug fix — `type:bug`
- [ ] Feature — `type:feature`
- [ ] Documentation — `type:docs`
- [ ] Refactor — `type:refactor`
- [ ] Chore — `type:chore`
- [ ] Breaking change — `type:breaking-change`

## Summary

- <!-- 1–3 concise bullets -->

## Changes

| Area or file | Change | Reviewer focus |
| --- | --- | --- |
|  |  |  |

## Chain context

| Field | Value |
| --- | --- |
| Strategy | Single PR / Feature Branch Chain |
| Tracker | #<!-- tracker PR or issue; `N/A` for single PR --> |
| Position | <!-- e.g., 2 of 4; `N/A` for single PR --> |
| Base | <!-- target branch or prior child branch --> |
| Dependency | <!-- prior PR(s), or `None` --> |
| Follow-up | <!-- next PR(s), or `None` --> |
| Changed-line budget | <!-- additions + deletions; target ≤400 --> |
| Start / end | <!-- included boundary --> |
| Scope / exclusions | <!-- what is included; what is intentionally excluded --> |
| Rollback | <!-- revert boundary and impact --> |
| Verification | <!-- focused checks and expected result --> |

```text
<!-- Chain diagram; mark this PR with 📍. Example:
main <- tracker (#N) <- child 1 <- 📍 child 2 <- child 3
-->
```

### Size exception

- [ ] `size:exception` declared for an immutable oversized commit.
- Rationale: <!-- why the commit cannot be split safely; leave `N/A` if not used -->

> This is a declaration for review, not a claim that a GitHub label exists.

## AI assistance disclosure

- [ ] No AI assistance was used.
- [ ] AI assistance was used and reviewed by the contributor: <!-- tool and review performed -->

## Test plan

- [ ] Focused automated checks passed: <!-- command and result -->
- [ ] Manual verification passed: <!-- scenario and result -->
- [ ] No production mutation was performed; this PR changes repository artifacts only.

## Contributor checklist

- [ ] The referenced issue is approved.
- [ ] Exactly one PR type was selected and the matching `type:*` label will be applied.
- [ ] The diff is focused, reviewable, and within the changed-line budget, or the size exception is justified.
- [ ] Chain context, dependencies, exclusions, rollback, and verification are complete when applicable.
- [ ] Tests and documentation are updated for the changed behavior.
- [ ] The commit follows Conventional Commits and has no `Co-Authored-By` trailer.
