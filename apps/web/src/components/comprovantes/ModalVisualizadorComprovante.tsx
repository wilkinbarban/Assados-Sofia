'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  X,
  Download,
  ExternalLink,
  Printer,
  FileText,
  Image as ImageIcon,
  Loader2,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react'

export interface ModalVisualizadorComprovanteProps {
  isOpen: boolean
  onClose: () => void
  urlArquivo: string | null
  nomeArquivo?: string
  tamanhoBytes?: number
  clienteNome?: string
  dataCriacao?: string
}

let cachedPdfJsPromise: Promise<any> | null = null

async function getPdfJs(): Promise<any> {
  if (typeof window === 'undefined') return null
  if ((window as any).pdfjsLib) return (window as any).pdfjsLib
  if (cachedPdfJsPromise) return cachedPdfJsPromise

  cachedPdfJsPromise = new Promise((resolve, reject) => {
    if ((window as any).pdfjsLib) {
      resolve((window as any).pdfjsLib)
      return
    }

    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    script.onload = async () => {
      const lib = (window as any).pdfjsLib
      if (lib) {
        try {
          // Cria Worker via Blob inline para evitar erro de CORS/SecurityError no navegador
          const res = await fetch(
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
          )
          const text = await res.text()
          const blob = new Blob([text], { type: 'text/javascript' })
          lib.GlobalWorkerOptions.workerPort = null
          lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob)
          resolve(lib)
        } catch {
          // Fallback para rota pública local
          lib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs'
          resolve(lib)
        }
      } else {
        reject(new Error('PDF.js indisponível após carregar o script'))
      }
    }
    script.onerror = () => {
      cachedPdfJsPromise = null
      reject(new Error('Falha ao carregar script PDF.js do CDN'))
    }
    document.head.appendChild(script)
  })

  return cachedPdfJsPromise
}

/**
 * Converte uma página de documento PDF em uma imagem PNG DataURL em alta resolução
 */
async function rasterizePdfPageToPng(doc: any, pageNum: number, scale = 2.0): Promise<string> {
  const page = await doc.getPage(pageNum)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Não foi possível inicializar o canvas 2D para conversão')
  }

  // Fundo branco sólido para documentos fiscais/comprovantes
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)

  const renderContext = {
    canvasContext: context,
    viewport: viewport,
  }
  await page.render(renderContext).promise
  return canvas.toDataURL('image/png')
}

export default function ModalVisualizadorComprovante({
  isOpen,
  onClose,
  urlArquivo,
  nomeArquivo = 'comprovante.pdf',
  tamanhoBytes,
  clienteNome,
  dataCriacao,
}: ModalVisualizadorComprovanteProps) {
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [zoom, setZoom] = useState(100)
  const [baixando, setBaixando] = useState(false)
  const [pngDataUrl, setPngDataUrl] = useState<string | null>(null)
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null)

  // PDF pagination state
  const [numPages, setNumPages] = useState<number>(1)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [pdfDoc, setPdfDoc] = useState<any>(null)

  const isPdf =
    nomeArquivo.toLowerCase().endsWith('.pdf') ||
    (urlArquivo?.toLowerCase().includes('.pdf') ?? false)

  // Atualiza a imagem PNG quando a página é alterada
  const carregarPaginaComoPng = useCallback(
    async (doc: any, pageNum: number) => {
      if (!doc) return
      setCarregando(true)
      try {
        const pngUrl = await rasterizePdfPageToPng(doc, pageNum, 2.0)
        setPngDataUrl(pngUrl)
      } catch (err: any) {
        console.error('Erro ao converter página PDF em PNG:', err)
        setErro('Erro ao gerar a imagem PNG do comprovante.')
      } finally {
        setCarregando(false)
      }
    },
    []
  )

  useEffect(() => {
    if (pdfDoc && isPdf && currentPage > 1) {
      carregarPaginaComoPng(pdfDoc, currentPage)
    }
  }, [pdfDoc, currentPage, isPdf, carregarPaginaComoPng])

  useEffect(() => {
    let createdBlobUrl: string | null = null
    let ativo = true

    if (!isOpen || !urlArquivo) {
      setPngDataUrl(null)
      setOriginalBlob(null)
      setPdfDoc(null)
      setErro(null)
      setZoom(100)
      setCurrentPage(1)
      setNumPages(1)
      return
    }

    const processarArquivo = async () => {
      setCarregando(true)
      setErro(null)

      try {
        // Caso seja um comprovante gerado pelo sistema (/api/receipts/[id]/pdf)
        if (urlArquivo.includes('/api/receipts/')) {
          const imageEndpoint = urlArquivo.replace('/pdf', '/png')
          const pdfEndpoint = urlArquivo

          // 1. Busca a imagem vetorial/PNG gerada instantaneamente pelo servidor
          const [imgRes, pdfRes] = await Promise.all([
            fetch(imageEndpoint),
            fetch(pdfEndpoint),
          ])

          if (imgRes.ok) {
            const imgBlob = await imgRes.blob()
            createdBlobUrl = URL.createObjectURL(imgBlob)
            if (ativo) {
              setPngDataUrl(createdBlobUrl)
            }
          }

          if (pdfRes.ok) {
            const pdfBlob = await pdfRes.blob()
            if (ativo) {
              setOriginalBlob(pdfBlob)
            }
          }

          if (!imgRes.ok && !pdfRes.ok) {
            throw new Error('Falha ao carregar o comprovante do servidor.')
          }

          return
        }

        // Para comprovantes enviados pelo usuário (chat-midias ou URLs externas)
        let endpoint = urlArquivo
        if (
          !urlArquivo.startsWith('http://') &&
          !urlArquivo.startsWith('https://') &&
          !urlArquivo.startsWith('/api/') &&
          !urlArquivo.startsWith('blob:') &&
          !urlArquivo.startsWith('data:')
        ) {
          endpoint = `/api/chat/midia?path=${encodeURIComponent(urlArquivo)}`
        }

        const res = await fetch(endpoint)
        if (!res.ok) {
          throw new Error(`Falha na resposta do servidor (${res.status})`)
        }

        const arrayBuffer = await res.arrayBuffer()
        if (!ativo) return

        const mimeType = isPdf
          ? 'application/pdf'
          : nomeArquivo.toLowerCase().endsWith('.png')
            ? 'image/png'
            : 'image/jpeg'

        const fileBlob = new Blob([arrayBuffer], { type: mimeType })
        setOriginalBlob(fileBlob)

        if (isPdf) {
          // Converte o arquivo PDF em imagem PNG
          try {
            const pdfjsLib = await getPdfJs()
            const loadingTask = pdfjsLib.getDocument({
              data: new Uint8Array(arrayBuffer),
              useSystemFonts: true,
            })
            const doc = await loadingTask.promise
            if (!ativo) return

            setPdfDoc(doc)
            setNumPages(doc.numPages)
            setCurrentPage(1)
            const firstPagePng = await rasterizePdfPageToPng(doc, 1, 2.0)
            if (!ativo) return
            setPngDataUrl(firstPagePng)
          } catch (pdfErr) {
            console.error('Erro na rasterização de PDF para PNG:', pdfErr)
            setErro('Não foi possível gerar a prévia PNG deste documento PDF.')
          }
        } else {
          // Imagem nativa (PNG/JPG)
          createdBlobUrl = URL.createObjectURL(fileBlob)
          setPngDataUrl(createdBlobUrl)
        }
      } catch (err: any) {
        if (!ativo) return
        console.error('Erro ao processar comprovante no visualizador:', err)
        setErro(
          'Não foi possível gerar a prévia da imagem PNG. Utilize o botão abaixo para baixar o arquivo original.'
        )
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    processarArquivo()

    return () => {
      ativo = false
      if (createdBlobUrl) {
        URL.revokeObjectURL(createdBlobUrl)
      }
    }
  }, [isOpen, urlArquivo, isPdf, nomeArquivo])

  if (!isOpen || !urlArquivo) return null

  const handleDownload = () => {
    if (!originalBlob && !pngDataUrl) return
    setBaixando(true)
    try {
      const blob =
        originalBlob || new Blob([], { type: isPdf ? 'application/pdf' : 'image/png' })
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = nomeArquivo || (isPdf ? 'comprovante.pdf' : 'comprovante.png')
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(downloadUrl)
    } catch (err) {
      console.warn('Erro ao disparar download:', err)
    } finally {
      setBaixando(false)
    }
  }

  const handlePrint = () => {
    if (pngDataUrl) {
      const printWindow = window.open('', '_blank')
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head><title>Imprimir Comprovante - ${nomeArquivo}</title></head>
            <body style="margin:0; display:flex; justify-content:center; align-items:center; min-height:100vh; background:#fff;">
              <img src="${pngDataUrl}" style="max-width:100%; height:auto;" onload="window.print();window.close();" />
            </body>
          </html>
        `)
        printWindow.document.close()
      }
    }
  }

  const handleAbrirNovaAba = () => {
    if (pngDataUrl) {
      const w = window.open('')
      if (w) {
        w.document.write(`
          <html>
            <head><title>Comprovante PNG - ${nomeArquivo}</title></head>
            <body style="margin:0; background:#09090b; display:flex; align-items:center; justify-content:center; min-height:100vh;">
              <img src="${pngDataUrl}" style="max-width:95vw; max-height:95vh; object-fit:contain; border-radius:12px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);" />
            </body>
          </html>
        `)
      }
    } else if (originalBlob) {
      const url = URL.createObjectURL(originalBlob)
      window.open(url, '_blank')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-4xl max-h-[92vh] rounded-3xl border border-amber-500/30 bg-zinc-950 p-6 shadow-2xl shadow-black/90 flex flex-col text-zinc-100 overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Efeitos de fundo sutis */}
        <div className="absolute -top-32 -right-32 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 h-64 w-64 rounded-full bg-orange-500/10 blur-3xl pointer-events-none" />

        {/* Header do Visualizador */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <ImageIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-emerald-400" />
                  {isPdf ? 'Imagem PNG (Gerada do PDF)' : 'Imagem de Comprovante (PNG)'}
                </span>
                <h3 className="text-sm font-bold text-zinc-50 truncate max-w-md">
                  {nomeArquivo}
                </h3>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 flex flex-wrap items-center gap-3">
                {clienteNome && (
                  <span>
                    <strong className="text-zinc-300">Cliente:</strong> {clienteNome}
                  </span>
                )}
                {tamanhoBytes !== undefined && tamanhoBytes > 0 && (
                  <span>
                    <strong className="text-zinc-300">Tamanho:</strong>{' '}
                    {(tamanhoBytes / 1024).toFixed(1)} KB
                  </span>
                )}
                {dataCriacao && (
                  <span>
                    <strong className="text-zinc-300">Data:</strong>{' '}
                    {new Date(dataCriacao).toLocaleString('pt-BR')}
                  </span>
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition-colors cursor-pointer shrink-0 ml-2"
            title="Fechar Visualizador"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Área Central de Visualização — Renderiza EXCLUSIVAMENTE a Imagem PNG */}
        <div className="flex-1 min-h-[440px] max-h-[65vh] my-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-center relative overflow-hidden">
          {carregando ? (
            <div className="flex flex-col items-center gap-3 text-zinc-400">
              <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
              <p className="text-xs font-medium">Gerando imagem PNG em alta definição a partir do comprovante...</p>
            </div>
          ) : erro ? (
            <div className="flex flex-col items-center gap-3 text-amber-300 p-6 text-center">
              <AlertTriangle className="h-12 w-12 text-amber-400" />
              <p className="text-sm font-bold text-zinc-100">{nomeArquivo}</p>
              <p className="text-xs text-zinc-400 max-w-sm">{erro}</p>
            </div>
          ) : pngDataUrl ? (
            <div className="w-full h-full overflow-auto flex items-center justify-center p-4">
              <div
                className="transition-transform duration-200 flex items-center justify-center shadow-2xl rounded-2xl overflow-hidden border border-zinc-800 bg-white"
                style={{ transform: `scale(${zoom / 100})` }}
              >
                {/* Visualização pura de Imagem PNG */}
                <img
                  src={pngDataUrl}
                  alt={`Comprovante PNG - ${nomeArquivo}`}
                  className="max-h-[58vh] max-w-full object-contain select-none"
                />
              </div>

              {/* Controles Flutuantes: Zoom & Paginação */}
              <div className="absolute bottom-4 right-4 flex items-center gap-2 p-1.5 rounded-xl bg-zinc-950/90 border border-zinc-800/80 shadow-xl backdrop-blur-md">
                {isPdf && numPages > 1 && (
                  <div className="flex items-center gap-1 pr-2 border-r border-zinc-800">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 disabled:opacity-30 cursor-pointer"
                      title="Página Anterior"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-[11px] font-mono font-bold text-zinc-300 px-1">
                      {currentPage}/{numPages}
                    </span>
                    <button
                      type="button"
                      disabled={currentPage >= numPages}
                      onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
                      className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 disabled:opacity-30 cursor-pointer"
                      title="Próxima Página"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setZoom((prev) => Math.max(50, prev - 25))}
                  className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 transition-colors cursor-pointer"
                  title="Diminuir Zoom"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span className="text-[10px] font-mono font-bold px-1.5 text-zinc-400">
                  {zoom}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((prev) => Math.min(250, prev + 25))}
                  className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 transition-colors cursor-pointer"
                  title="Aumentar Zoom"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(100)}
                  className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                  title="Redefinir Zoom"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-zinc-400">
              <FileText className="h-12 w-12 text-amber-400" />
              <p className="text-sm font-bold text-zinc-200">{nomeArquivo}</p>
            </div>
          )}
        </div>

        {/* Rodapé com Ações Integradas */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-800/80 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-400">
              Casa de Assados Sofia • Visualizador de Imagem PNG
            </span>
          </div>

          <div className="flex items-center gap-2">
            {(originalBlob || pngDataUrl) && (
              <>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 text-xs font-bold transition-all active:scale-95 cursor-pointer"
                  title="Imprimir comprovante"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Imprimir</span>
                </button>

                <button
                  type="button"
                  onClick={handleAbrirNovaAba}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 text-xs font-bold transition-all active:scale-95 cursor-pointer"
                  title="Abrir imagem PNG em nova aba"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Abrir PNG</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={baixando}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 text-xs font-black shadow-lg shadow-amber-500/15 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {baixando ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Baixando...</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-3.5 w-3.5" />
                      <span>Baixar {isPdf ? 'PDF Original' : 'Comprovante'}</span>
                    </>
                  )}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-bold transition-all cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
