import { describe, expect, it } from 'vitest'

import { resolveEvolutionInboundPhoneLocalPart } from '@/lib/whatsapp/evolution-inbound-sender'

describe('resolveEvolutionInboundPhoneLocalPart', () => {
  it('resolves a structurally valid direct phone JID', () => {
    expect(resolveEvolutionInboundPhoneLocalPart({
      remoteJid: '5541999990003@s.whatsapp.net',
    })).toBe('5541999990003')
  })

  it('uses a valid phone alternate only for an exact LID addressing mode and valid LID JID', () => {
    expect(resolveEvolutionInboundPhoneLocalPart({
      addressingMode: 'lid',
      remoteJid: '123456789012345@lid',
      remoteJidAlt: '5541999990003@s.whatsapp.net',
    })).toBe('5541999990003')
  })

  it.each([
    [{ remoteJid: 'status@broadcast' }],
    [{ remoteJid: '120363000000000000@g.us' }],
    [{ remoteJid: '5541999990003@attacker.invalid' }],
    [{ remoteJid: '55-41-99999-0003@s.whatsapp.net' }],
    [{ remoteJid: '05541999990003@s.whatsapp.net' }],
    [{ remoteJid: '5541999990003@s.whatsapp.net/extra' }],
    [{ remoteJid: '123456789012345@lid' }],
    [{ addressingMode: 'pn', remoteJid: '123456789012345@lid', remoteJidAlt: '5541999990003@s.whatsapp.net' }],
    [{ addressingMode: 'LID', remoteJid: '123456789012345@lid', remoteJidAlt: '5541999990003@s.whatsapp.net' }],
    [{ addressingMode: 'lid', remoteJid: 'not-numeric@lid', remoteJidAlt: '5541999990003@s.whatsapp.net' }],
    [{ addressingMode: 'lid', remoteJid: '123456789012345@lid', remoteJidAlt: 'status@broadcast' }],
    [{ addressingMode: 'lid', remoteJid: '123456789012345@lid', remoteJidAlt: '5541999990003@attacker.invalid' }],
    [{ addressingMode: 'lid', remoteJid: '120363000000000000@g.us', remoteJidAlt: '5541999990003@s.whatsapp.net' }],
    [{ addressingMode: 'lid', remoteJid: 'status@broadcast', remoteJidAlt: '5541999990003@s.whatsapp.net' }],
  ])('fails closed for ambiguous or malformed sender key %j', (key) => {
    expect(resolveEvolutionInboundPhoneLocalPart(key)).toBeNull()
  })
})
