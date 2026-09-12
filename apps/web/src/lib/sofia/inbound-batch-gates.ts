export function inboundBatchProcessingEnabled(
  value = process.env.SOFIA_INBOUND_BATCH_PROCESSING_ENABLED,
): boolean {
  return value === "true";
}

export function inboundBatchRuntimeEnabled(
  value = process.env.SOFIA_INBOUND_BATCH_RUNTIME_ENABLED,
): boolean {
  return value === "true";
}

export function telegramInboundBatchEnqueueEnabled(
  value = process.env.SOFIA_INBOUND_BATCH_TELEGRAM_ENQUEUE_ENABLED,
): boolean {
  return value === "true";
}

export function evolutionInboundBatchEnqueueEnabled(
  value = process.env.SOFIA_INBOUND_BATCH_EVOLUTION_ENQUEUE_ENABLED,
): boolean {
  return value === "true";
}
