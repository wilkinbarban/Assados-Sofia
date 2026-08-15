export interface EvolutionAdminConfig {
  apiUrl: string
  apiKey: string
  instanceName: string
}

interface EvolutionResponse {
  base64?: string
  code?: string
  qrcode?: {
    base64?: string
    code?: string
  }
  instance?: {
    connected?: boolean
    state?: string
  }
}

function buildHeaders(apiKey: string, publicOrigin: string) {
  return {
    apikey: apiKey,
    'Content-Type': 'application/json',
    Origin: publicOrigin,
  }
}

function buildUrl(apiUrl: string, path: string) {
  return `${apiUrl.replace(/\/+$/, '')}${path}`
}

async function readEvolutionError(response: Response) {
  const body = await response.text().catch(() => '')
  return `HTTP ${response.status} - ${body || response.statusText}`
}

function extractQrCode(data: EvolutionResponse) {
  return data.base64 || data.qrcode?.base64 || data.code || data.qrcode?.code
}

export async function getEvolutionConnectionState(
  config: EvolutionAdminConfig,
  publicOrigin: string,
) {
  const response = await fetch(
    buildUrl(config.apiUrl, `/instance/connectionState/${encodeURIComponent(config.instanceName)}`),
    { method: 'GET', headers: buildHeaders(config.apiKey, publicOrigin) },
  )

  if (!response.ok) {
    throw new Error(await readEvolutionError(response))
  }

  const data = await response.json() as EvolutionResponse
  const state = data.instance?.state || 'unknown'

  return {
    connected: state === 'open' || data.instance?.connected === true,
    state,
    data,
  }
}

export async function getEvolutionQrCode(
  config: EvolutionAdminConfig,
  publicOrigin: string,
) {
  const headers = buildHeaders(config.apiKey, publicOrigin)
  let response = await fetch(
    buildUrl(config.apiUrl, `/instance/connect/${encodeURIComponent(config.instanceName)}`),
    { method: 'GET', headers },
  )

  if (response.status === 404) {
    response = await fetch(buildUrl(config.apiUrl, '/instance/create'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        instanceName: config.instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      }),
    })
  }

  if (!response.ok) {
    throw new Error(await readEvolutionError(response))
  }

  const data = await response.json() as EvolutionResponse
  const qrcode = extractQrCode(data)

  if (!qrcode) {
    throw new Error('Nenhum QR Code retornado pela Evolution API. A instância já pode estar conectada.')
  }

  return { qrcode }
}
