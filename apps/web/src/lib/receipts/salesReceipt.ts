export type ReceiptSnapshot = {
  order: { id: string; delivery_type?: string }
  customer: { name: string; phone?: string | null }
  line_items: Array<{ id: string; name: string; quantity: number; unit_price_centavos: number; line_total_centavos: number }>
  charged_amount_centavos: number
  payment: { status: string; method: string }
  establishment: { name: string }
  issuance: { issued_at: string; snapshot_version: number }
}

export type ReceiptCopy = { label: 'VIA CLIENTE' | 'VIA ESTABELECIMENTO'; commercialData: string }

const copyLabels = ['VIA CLIENTE', 'VIA ESTABELECIMENTO'] as const
const thermalPdfWidthPoints = 226.77
const thermalPdfLineLength = 36
const receiptSectionHeadings = new Set(['DADOS DO PEDIDO', 'CLIENTE', 'ITENS', 'PAGAMENTO'])

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100)
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!)
}

function formatIssuedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('day')}/${part('month')}/${part('year')} ${part('hour')}:${part('minute')}`
}

function receiptLines(snapshot: ReceiptSnapshot, isSegundaVia = false) {
  return [
    snapshot.establishment.name,
    isSegundaVia ? '2ª VIA • COMPROVANTE DE PAGAMENTO' : 'COMPROVANTE DE VENDA',
    'DADOS DO PEDIDO',
    'Pedido:',
    snapshot.order.id,
    `Tipo: ${snapshot.order.delivery_type || 'não informado'}`,
    'CLIENTE',
    `Nome: ${snapshot.customer.name}`,
    ...(snapshot.customer.phone ? [`Telefone: ${snapshot.customer.phone}`] : []),
    'ITENS',
    ...snapshot.line_items.flatMap((item) => [
      `${item.quantity}x ${item.name}`,
      `${money(item.unit_price_centavos)} un. | ${money(item.line_total_centavos)}`,
    ]),
    'PAGAMENTO',
    `Forma: ${snapshot.payment.method}`,
    `Status: ${snapshot.payment.status}`,
    `Valor pago: ${money(snapshot.charged_amount_centavos)}`,
    `TOTAL PAGO: ${money(snapshot.charged_amount_centavos)}`,
    `Emitido em: ${formatIssuedAt(snapshot.issuance.issued_at)}`,
    `Versão do comprovante: ${snapshot.issuance.snapshot_version}`,
  ]
}

export function toReceiptCopies(snapshot: ReceiptSnapshot, options?: { isSegundaVia?: boolean }): ReceiptCopy[] {
  const isSegundaVia = options?.isSegundaVia ?? false
  const commercialData = receiptLines(snapshot, isSegundaVia).join('\n')
  if (isSegundaVia) {
    return [{ label: 'VIA CLIENTE', commercialData }]
  }
  return copyLabels.map((label) => ({ label, commercialData }))
}

function htmlCopy(copy: ReceiptCopy) {
  const [establishment, title, ...lines] = copy.commercialData.split('\n')
  const content = lines.map((line) => {
    if (receiptSectionHeadings.has(line)) return `<h3>${line}</h3>`
    if (line.startsWith('TOTAL PAGO:')) return `<p class="total">${escapeHtml(line)}</p>`
    if (line === 'Pedido:') return `<p class="field-label">${line}</p>`
    if (/^[0-9a-f]{8}-[0-9a-f-]+$/i.test(line)) return `<p class="immutable-id">${escapeHtml(line)}</p>`
    return `<p>${escapeHtml(line)}</p>`
  }).join('')
  return `<section class="receipt"><header><h1>${escapeHtml(establishment)}</h1><p class="document-title">${title}</p><h2>${copy.label}</h2></header>${content}<footer>Documento de venda • conserve este comprovante</footer></section>`
}

export function buildReceiptPrintDocument(snapshot: ReceiptSnapshot, width: 58 | 80, options?: { isSegundaVia?: boolean }) {
  const copies = toReceiptCopies(snapshot, options)
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Comprovante de venda</title><style>@page { size: ${width}mm auto; margin: 0; } * { box-sizing: border-box; } html, body { width: ${width}mm; max-width: ${width}mm; margin: 0; padding: 0; overflow-x: hidden; color: #000; background: #fff; font-family: "Courier New", monospace; } .receipt { width: 100%; max-width: 100%; padding: 2.5mm; break-after: page; font-size: ${width === 58 ? '8.5pt' : '9.5pt'}; line-height: 1.24; } .receipt:last-child { break-after: auto; } header { text-align: center; border-block: 1px solid #000; padding: 2mm 0; margin-bottom: 1.5mm; } h1, h2, h3, p { margin: 0; } h1 { font-size: 1.35em; font-weight: 900; text-transform: uppercase; } .document-title { margin-top: .8mm; font-weight: 700; letter-spacing: .06em; } h2 { margin-top: 1mm; padding-top: 1mm; border-top: 1px dashed #000; font-size: 1em; letter-spacing: .08em; } h3 { margin: 2mm 0 1mm; padding-block: .8mm; border-block: 1px dashed #000; font-size: 1em; letter-spacing: .06em; } p { margin-bottom: .75mm; max-width: 100%; overflow-wrap: anywhere; word-break: normal; } .field-label { margin-bottom: 0; font-weight: 700; } .immutable-id { font-size: .92em; overflow-wrap: anywhere; word-break: break-all; } .total { margin-top: 2mm; padding: 1.5mm 0; border-block: 2px solid #000; font-size: 1.18em; font-weight: 900; text-align: center; } footer { margin-top: 2mm; padding-top: 1.5mm; border-top: 1px dashed #000; text-align: center; font-size: .82em; }</style></head><body>${copies.map(htmlCopy).join('')}</body></html>`
}

function pdfEscape(value: string) {
  return [...value.replace(/\u00a0/g, ' ')].map((character) => {
    if (/[\\()]/.test(character)) return `\\${character}`
    const code = character.charCodeAt(0)
    if (code >= 0x20 && code <= 0x7e) return character
    if (code <= 0xff) return `\\${code.toString(8).padStart(3, '0')}`
    return '-'
  }).join('')
}

function wrapThermalLine(value: string, maxLength = thermalPdfLineLength): string[] {
  if (!value) return ['']
  const result: string[] = []
  let remaining = value
  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf(' ', maxLength)
    if (splitAt < Math.floor(maxLength / 2)) splitAt = maxLength
    result.push(remaining.slice(0, splitAt).trimEnd())
    remaining = remaining.slice(splitAt).trimStart()
  }
  result.push(remaining)
  return result
}

/** Minimal deterministic 80 mm thermal PDF using the same immutable receipt data as browser printing. */
export function buildReceiptPdf(snapshot: ReceiptSnapshot, options?: { isSegundaVia?: boolean }): Uint8Array {
  const isSegundaVia = options?.isSegundaVia ?? false
  const title = isSegundaVia ? '2ª VIA • COMPROVANTE DE PAGAMENTO' : 'COMPROVANTE DE VENDA'
  const separator = '-'.repeat(thermalPdfLineLength)
  const lines = toReceiptCopies(snapshot, options).flatMap((copy) => [
    snapshot.establishment.name.toUpperCase(),
    title,
    copy.label,
    separator,
    ...copy.commercialData.split('\n').slice(2).flatMap((line) => [
      ...(receiptSectionHeadings.has(line) ? [separator] : []),
      ...wrapThermalLine(line),
      ...(receiptSectionHeadings.has(line) ? [separator] : []),
    ]),
    separator,
    '',
  ])
  const lineHeight = 10
  const pageHeight = Math.max(220, 24 + lines.length * lineHeight)
  const stream = ['BT', '/F1 7.5 Tf', `14 ${pageHeight - 16} Td`, ...lines.map((line, index) => `${index ? `0 -${lineHeight} Td` : ''} (${pdfEscape(line)}) Tj`).filter(Boolean), 'ET'].join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${thermalPdfWidthPoints} ${pageHeight}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
    `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => { offsets.push(new TextEncoder().encode(pdf).length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n` })
  const xref = new TextEncoder().encode(pdf).length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}

/** Vector SVG receipt image matching 80mm thermal paper rendering */
export function buildReceiptSvg(snapshot: ReceiptSnapshot, options?: { isSegundaVia?: boolean }): string {
  const isSegundaVia = options?.isSegundaVia ?? false
  const title = isSegundaVia ? '2ª VIA • COMPROVANTE DE PAGAMENTO' : 'COMPROVANTE DE VENDA'
  const separator = '-'.repeat(thermalPdfLineLength)
  const lines = toReceiptCopies(snapshot, options).flatMap((copy) => [
    snapshot.establishment.name.toUpperCase(),
    title,
    copy.label,
    separator,
    ...copy.commercialData.split('\n').slice(2).flatMap((line) => [
      ...(receiptSectionHeadings.has(line) ? [separator] : []),
      ...wrapThermalLine(line),
      ...(receiptSectionHeadings.has(line) ? [separator] : []),
    ]),
    separator,
    'Documento de venda • conserve este comprovante',
  ])

  const lineHeight = 18
  const padding = 24
  const width = 380
  const height = padding * 2 + lines.length * lineHeight

  const textElements = lines
    .map((line, idx) => {
      const y = padding + (idx + 1) * lineHeight
      const isHeader = idx === 0 || idx === 1 || idx === 2
      const isTotal = line.startsWith('TOTAL PAGO:')
      const weight = isHeader || isTotal ? 'bold' : 'normal'
      const fill = isTotal ? '#000000' : '#27272a'
      const fontSize = isHeader ? 13 : isTotal ? 14 : 11
      return `<text x="24" y="${y}" font-family="Courier New, monospace" font-size="${fontSize}" font-weight="${weight}" fill="${fill}">${escapeHtml(line)}</text>`
    })
    .join('\n')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff" rx="16" />
  <rect x="8" y="8" width="${width - 16}" height="${height - 16}" fill="#fafafa" stroke="#d4d4d8" stroke-width="1.5" stroke-dasharray="5,5" rx="12" />
  ${textElements}
</svg>`
}
