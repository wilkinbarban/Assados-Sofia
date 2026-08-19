# Tasks: Sofia OmniRoute 3 Tiers Implementation

## Phase 1: OpenSpec & Runbooks
- [x] Create proposal.md
- [x] Create design.md
- [x] Create tasks.md
- [ ] Create docs/runbooks/omniroute-setup.md

## Phase 2: Provisioning Scripts
- [ ] Create scripts/omniroute/provision-combos.mjs

## Phase 3: Core Implementation
- [ ] Implement apps/web/src/lib/ai/router.ts
- [ ] Implement apps/web/src/lib/ai/omniroute.ts
- [ ] Integrate router and fallback in apps/web/src/lib/ai/openrouter.ts
- [ ] Update .env.example with OmniRoute configuration

## Phase 4: Testing & Verification
- [ ] Create unit tests for router (tests/unit/sofia-business-router.test.ts)
- [ ] Create integration tests for OmniRoute gateway (tests/unit/omniroute-gateway.test.ts)
- [ ] Create omnichannel E2E tests (tests/unit/sofia-omnichannel-tiers-e2e.test.ts)
- [ ] Run complete test suite and verify 100% pass
