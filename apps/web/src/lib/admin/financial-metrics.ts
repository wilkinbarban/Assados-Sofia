export type FinancialOperationalMetrics = {
  period: { startAt: string; endAt: string }
  ordersCreated: number
  approvedSalesCount: number
  refundedSalesCount: number
  grossApprovedCents: number
  refundsCents: number
  netOperationalRevenueCents: number
  averageApprovedTicketCents: number | null
  providerGrossCents: number
  providerFeesCents: number
  providerNetCents: number
  openReceivablesCount: number
  openReceivablesCents: number
  cashSessionsOpened: number
  cashSessionsClosed: number
  cashDifferenceCents: number
  bankReconciledCount: number
  bankReconciledCents: number
  bankUnreconciledCount: number
  bankUnreconciledCents: number
  marginAvailable: false
}

const fail = () => { throw new Error('INVALID_FINANCIAL_METRICS') }
const record = (value: unknown, keys: readonly string[]) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail()
  const result = value as Record<string, unknown>
  if (Object.keys(result).length !== keys.length || keys.some((key) => !(key in result))) fail()
  return result
}
const count = (value: unknown) => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail()
  return value as number
}
const cents = (value: unknown) => {
  if (!Number.isSafeInteger(value)) fail()
  return value as number
}
const nonnegativeCents = (value: unknown) => { const result = cents(value); if (result < 0) fail(); return result }
const metrics = (value: unknown, counts: readonly string[], nonnegative: readonly string[], signed: readonly string[] = []) => { const result = record(value, [...counts, ...nonnegative, ...signed]); counts.forEach((key) => count(result[key])); nonnegative.forEach((key) => nonnegativeCents(result[key])); signed.forEach((key) => cents(result[key])); return result }
const period = (value: unknown, startAt: string, endAt: string) => { const result = record(value, ['start_at', 'end_at']); if (typeof result.start_at !== 'string' || typeof result.end_at !== 'string' || Date.parse(result.start_at) !== Date.parse(startAt) || Date.parse(result.end_at) !== Date.parse(endAt)) fail() }

export function parseFinancialOperationalMetrics(operational: unknown, financial: unknown, startAt: string, endAt: string): FinancialOperationalMetrics {
  const report = record(operational, ['period', 'orders', 'payments', 'proof_funnel', 'proof_sla', 'channel', 'operational_value_cents'])
  period(report.period, startAt, endAt)
  const orders = metrics(report.orders, ['created', 'novo', 'confirmado', 'entregue', 'cancelado'], [])
  metrics(report.payments, ['approved_events', 'refunded_events'], [])
  metrics(report.proof_funnel, ['received', 'admitted', 'reconciled', 'review', 'quarantined', 'duplicate', 'purged'], [])
  metrics(report.proof_sla, ['admitted_within_60m', 'admitted_over_60m', 'open_0_to_60m', 'open_61m_to_24h', 'open_over_24h'], [])
  metrics(report.channel, ['web', 'whatsapp', 'telegram'], [])
  metrics(report.operational_value_cents, [], ['gross_approved', 'refunds'], ['net'])
  const financialReport = record(financial, ['period', 'receivables', 'cash', 'provider_settlements', 'refunds', 'sales', 'scope'])
  period(financialReport.period, startAt, endAt)
  const receivables = metrics(financialReport.receivables, ['opened_count', 'settled_count', 'open_count'], ['opened_centavos', 'settled_centavos', 'open_centavos'])
  const cash = metrics(financialReport.cash, ['sessions_opened', 'sessions_closed'], ['opening_float_centavos'], ['closing_difference_centavos'])
  const provider = metrics(financialReport.provider_settlements, ['count', 'bank_reconciled_count', 'bank_unreconciled_count'], ['gross_centavos', 'fees_centavos', 'bank_reconciled_centavos', 'bank_unreconciled_centavos'], ['net_centavos'])
  const refunds = metrics(financialReport.refunds, ['events'], ['centavos'])
  const sales = metrics(financialReport.sales, ['approved_order_count', 'refunded_order_count'], ['gross_approved_centavos', 'refunds_centavos'], ['net_operational_centavos'])
  const scope = record(financialReport.scope, ['operational_only', 'fiscal_accounting', 'double_entry', 'partial_or_combined_payments'])
  if (scope.operational_only !== true || scope.fiscal_accounting !== false || scope.double_entry !== false || scope.partial_or_combined_payments !== false) fail()
  const approvedSalesCount = count(sales.approved_order_count)
  const refundsCents = cents(sales.refunds_centavos)
  if (count(sales.refunded_order_count) !== count(refunds.events) || refundsCents !== cents(refunds.centavos)) fail()
  const grossApprovedCents = cents(sales.gross_approved_centavos)
  const netOperationalRevenueCents = cents(sales.net_operational_centavos)
  if (netOperationalRevenueCents !== grossApprovedCents - refundsCents) fail()
  return {
    period: { startAt, endAt }, ordersCreated: count(orders.created), approvedSalesCount, refundedSalesCount: count(sales.refunded_order_count),
    grossApprovedCents, refundsCents, netOperationalRevenueCents,
    averageApprovedTicketCents: approvedSalesCount > 0 ? Math.round(grossApprovedCents / approvedSalesCount) : null,
    providerGrossCents: cents(provider.gross_centavos), providerFeesCents: cents(provider.fees_centavos), providerNetCents: cents(provider.net_centavos),
    openReceivablesCount: count(receivables.open_count), openReceivablesCents: cents(receivables.open_centavos),
    cashSessionsOpened: count(cash.sessions_opened), cashSessionsClosed: count(cash.sessions_closed), cashDifferenceCents: cents(cash.closing_difference_centavos),
    bankReconciledCount: count(provider.bank_reconciled_count), bankReconciledCents: cents(provider.bank_reconciled_centavos), bankUnreconciledCount: count(provider.bank_unreconciled_count), bankUnreconciledCents: cents(provider.bank_unreconciled_centavos), marginAvailable: false,
  }
}

export function validateReportingPeriod(input: unknown): { startAt: string; endAt: string } | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const { startAt, endAt } = input as Record<string, unknown>
  if (typeof startAt !== 'string' || typeof endAt !== 'string') return null
  const start = Date.parse(startAt), end = Date.parse(endAt)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > 366 * 24 * 60 * 60 * 1000) return null
  return { startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() }
}
