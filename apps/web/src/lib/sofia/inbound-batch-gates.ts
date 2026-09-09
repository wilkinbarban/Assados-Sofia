export function inboundBatchProcessingEnabled(value = process.env.SOFIA_INBOUND_BATCH_PROCESSING_ENABLED): boolean {
  return value === 'true'
}
