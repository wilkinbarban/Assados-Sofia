export interface EvolutionInboundMessageKey {
  addressingMode?: unknown
  remoteJid?: unknown
  remoteJidAlt?: unknown
}

const PHONE_JID_PATTERN = /^([1-9][0-9]{5,14})@s\.whatsapp\.net$/
const LID_JID_PATTERN = /^[1-9][0-9]{4,19}@lid$/

function phoneLocalPart(jid: unknown): string | null {
  if (typeof jid !== 'string') return null
  return PHONE_JID_PATTERN.exec(jid)?.[1] ?? null
}

/**
 * Resolves only unambiguous direct inbound Evolution senders.
 * Alternate JIDs are trusted exclusively for Evolution's exact LID shape.
 */
export function resolveEvolutionInboundPhoneLocalPart(
  key: EvolutionInboundMessageKey,
): string | null {
  const directPhone = phoneLocalPart(key.remoteJid)
  if (directPhone) return directPhone

  if (
    key.addressingMode === 'lid' &&
    typeof key.remoteJid === 'string' &&
    LID_JID_PATTERN.test(key.remoteJid)
  ) {
    return phoneLocalPart(key.remoteJidAlt)
  }

  return null
}
