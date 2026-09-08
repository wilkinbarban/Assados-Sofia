const TELEGRAM_API_ORIGIN = 'https://api.telegram.org'
const SAFE_FILE_PATH = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/

function isSafeRelativeFilePath(filePath: string): boolean {
  return SAFE_FILE_PATH.test(filePath) && filePath.split('/').every((segment) => segment !== '.' && segment !== '..')
}

type DownloadInput = {
  token: string
  fileId: string
  maxBytes: number
  timeoutMs: number
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png'
}

type DownloadFailure = {
  ok: false
  error: string
  retryable: boolean
}

function failure(error: string, retryable: boolean): DownloadFailure {
  return { ok: false, error, retryable }
}

async function readWithLimit(response: Response, maxBytes: number): Promise<Uint8Array | DownloadFailure> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return failure('TELEGRAM_FILE_TOO_LARGE', false)
  }

  if (!response.body) return failure('TELEGRAM_FILE_DOWNLOAD_FAILED', true)

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return failure('TELEGRAM_FILE_TOO_LARGE', false)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export async function downloadTelegramDocument(input: DownloadInput) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs)

  try {
    const metadataUrl = `${TELEGRAM_API_ORIGIN}/bot${input.token}/getFile?file_id=${encodeURIComponent(input.fileId)}`
    const metadataResponse = await fetch(metadataUrl, { signal: controller.signal, redirect: 'error' })
    if (!metadataResponse.ok) return failure('TELEGRAM_GET_FILE_FAILED', true)

    const metadata = await metadataResponse.json().catch(() => null)
    const filePath = metadata?.ok === true && typeof metadata?.result?.file_path === 'string'
      ? metadata.result.file_path
      : null
    if (!filePath || !isSafeRelativeFilePath(filePath)) {
      return failure('TELEGRAM_FILE_PATH_INVALID', false)
    }

    const downloadUrl = `${TELEGRAM_API_ORIGIN}/file/bot${input.token}/${filePath}`
    const downloadResponse = await fetch(downloadUrl, { signal: controller.signal, redirect: 'error' })
    if (!downloadResponse.ok) return failure('TELEGRAM_FILE_DOWNLOAD_FAILED', true)

    const bytes = await readWithLimit(downloadResponse, input.maxBytes)
    if (!(bytes instanceof Uint8Array)) return bytes
    return { ok: true as const, bytes, mimeType: input.mimeType }
  } catch (error) {
    if (controller.signal.aborted || (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')) {
      return failure('TELEGRAM_FILE_DOWNLOAD_TIMEOUT', true)
    }
    return failure('TELEGRAM_FILE_DOWNLOAD_FAILED', true)
  } finally {
    clearTimeout(timeout)
  }
}
