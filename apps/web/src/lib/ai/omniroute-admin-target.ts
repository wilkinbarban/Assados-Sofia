type Input = {
  callerBaseUrl: string
  callerApiKey: string
  configuredBaseUrl?: string
  configuredApiKey?: string
  // Retained for test/source compatibility; arbitrary DNS destinations are no longer allowed.
  lookup?: unknown
}

function canonicalOrigin(raw: string): string {
  let url: URL
  try { url = new URL(raw) } catch { throw new Error('OMNIROUTE_UNSAFE_DESTINATION') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.hash || url.search || url.pathname !== '/') {
    throw new Error('OMNIROUTE_UNSAFE_DESTINATION')
  }
  return url.origin
}

export async function resolveOmniRouteAdminTarget(input: Input) {
  const callerBaseUrl = input.callerBaseUrl.trim()
  const callerApiKey = input.callerApiKey.trim()
  const configuredBaseUrl = input.configuredBaseUrl?.trim()
  const configuredApiKey = input.configuredApiKey?.trim()
  if (!configuredBaseUrl || !configuredApiKey) throw new Error('OMNIROUTE_CONFIG_MISSING')

  const approvedOrigin = canonicalOrigin(configuredBaseUrl)
  if (!callerBaseUrl && !callerApiKey) {
    return { baseUrl: approvedOrigin, apiKey: configuredApiKey }
  }
  if (!callerBaseUrl || !callerApiKey) throw new Error('OMNIROUTE_EXPLICIT_KEY_REQUIRED')
  if (canonicalOrigin(callerBaseUrl) !== approvedOrigin) {
    throw new Error('OMNIROUTE_UNAPPROVED_DESTINATION')
  }
  return { baseUrl: approvedOrigin, apiKey: callerApiKey }
}
