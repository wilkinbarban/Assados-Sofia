const PRODUCT_IMAGE_PREFIX = 'produtos/'
const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000

type ProtectedReason = 'outside_product_prefix' | 'referenced' | 'within_grace_period' | 'invalid_timestamp'

type OrphanClassification =
  | { readonly kind: 'eligible' }
  | { readonly kind: 'protected'; readonly reason: ProtectedReason }

interface OrphanCandidate {
  readonly path: string
  readonly createdAt: Date
  readonly referencedPaths: readonly string[]
  readonly scanAt: Date
}

export function classifyProductImageOrphan(candidate: OrphanCandidate): OrphanClassification {
  if (!candidate.path.startsWith(PRODUCT_IMAGE_PREFIX) || candidate.path.length === PRODUCT_IMAGE_PREFIX.length) {
    return { kind: 'protected', reason: 'outside_product_prefix' }
  }

  if (candidate.referencedPaths.includes(candidate.path)) {
    return { kind: 'protected', reason: 'referenced' }
  }

  const candidateCreatedAt = candidate.createdAt.getTime()
  const scanStartedAt = candidate.scanAt.getTime()
  if (!Number.isFinite(candidateCreatedAt) || !Number.isFinite(scanStartedAt)) {
    return { kind: 'protected', reason: 'invalid_timestamp' }
  }

  if (scanStartedAt - candidateCreatedAt < GRACE_PERIOD_MS) {
    return { kind: 'protected', reason: 'within_grace_period' }
  }

  return { kind: 'eligible' }
}
