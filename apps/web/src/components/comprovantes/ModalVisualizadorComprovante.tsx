'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
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
  if ((window as any).pdfjsLib) {
    const lib = (window as any).pdfjsLib
    lib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.js'
    return lib
  }
  if (cachedPdfJsPromise) return cachedPdfJsPromise

  cachedPdfJsPromise = new Promise((resolve, reject) => {
    if ((window as any).pdfjsLib) {
      resolve((window as any).pdfjsLib)
      return
    }

    const script = document.createElement('script')
    script.src = '/pdfjs/pdf.min.js'
    script.onload = () => {
      const lib = (window as any).pdfjsLib
      if (lib) {
        lib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.js'
        resolve(lib)
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
  const pdfDocRef = useRef<any>(null)

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
      void pdfDocRef.current?.destroy?.()
      pdfDocRef.current = null
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
          const imageEndpoint = urlArquivo.replace('/pdf', '/svg')
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

        if (isPdf) {
          // 1. Tenta carregar a prévia PNG ultrarrápida gerada pelo servidor
          try {
            const previewEndpoint = endpoint.includes('?') ? `${endpoint}&preview=true` : `${endpoint}?preview=true`
            const previewRes = await fetch(previewEndpoint)
            if (previewRes.ok && previewRes.headers.get('content-type')?.includes('image')) {
              const previewBlob = await previewRes.blob()
              if (!ativo) return
              createdBlobUrl = URL.createObjectURL(previewBlob)
              setPngDataUrl(createdBlobUrl)
              setNumPages(1)
              setCurrentPage(1)
              return
            }
          } catch (serverPreviewErr) {
            console.warn('Prévia do servidor indisponível, tentando download do original:', serverPreviewErr)
          }
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
          // Fallback: Converte o arquivo PDF em imagem PNG no cliente
          try {
            const pdfjsLib = await getPdfJs()
            const loadingTask = pdfjsLib.getDocument({
              data: new Uint8Array(arrayBuffer),
              useSystemFonts: true,
            })
            const doc = await loadingTask.promise
            if (!ativo) return

            pdfDocRef.current = doc
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
      void pdfDocRef.current?.destroy?.()
      pdfDocRef.current = null
      if (createdBlobUrl) {
        URL.revokeObjectURL(createdBlobUrl)
      }
    }
  }, [isOpen, urlArquivo, isPdf, nomeArquivo])

  if (!isOpen || !urlArquivo) return null

  const handleDownload = () => {
    if (!originalBlob || originalBlob.size === 0) {
      setErro('O arquivo original está indisponível. Tente novamente ou use a prévia para imprimir.')
      return
    }
    setBaixando(true)
    try {
      const downloadUrl = URL.createObjectURL(originalBlob)
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

  const openSafeImageWindow = (print: boolean) => {
    if (pngDataUrl) {
      const printWindow = window.open('', '_blank')
      if (printWindow) {
        const document = printWindow.document
        document.title = `${print ? 'Imprimir comprovante' : 'Prévia do comprovante'} - ${nomeArquivo}`
        document.body.style.cssText = `margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:${print ? '#fff' : '#09090b'}`
        const image = document.createElement('img')
        image.src = pngDataUrl
        image.alt = 'Prévia do comprovante'
        image.style.cssText = 'max-width:95vw;max-height:95vh;object-fit:contain'
        if (print) image.addEventListener('load', () => printWindow.print(), { once: true })
        document.body.appendChild(image)
      }
    }
  }

  const handlePrint = () => openSafeImageWindow(true)

  const handleAbrirNovaAba = () => {
    if (pngDataUrl) {
      openSafeImageWindow(false)
    } else if (originalBlob) {
      const url = URL.createObjectURL(originalBlob)
      const opened = window.open(url, '_blank')
      if (!opened) URL.revokeObjectURL(url)
      else window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
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
                  {urlArquivo.includes('/api/receipts/') ? 'Prévia vetorial do comprovante' : isPdf ? 'Prévia gerada do PDF' : 'Imagem do comprovante'}
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

        {/* Área central de visualização */}
        <div className="flex-1 min-h-[440px] max-h-[65vh] my-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-center relative overflow-hidden">
          {carregando ? (
            <div className="flex flex-col items-center gap-3 text-zinc-400">
              <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
              <p className="text-xs font-medium">Gerando prévia do comprovante...</p>
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
                {/* eslint-disable-next-line @next/next/no-img-element -- Preview is a transient blob or data URL generated from private proof content. */}
                    <img
                  src={pngDataUrl}
                  alt={`Prévia do comprovante - ${nomeArquivo}`}
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
              Casa de Assados Brasa & Sabor • Visualizador de comprovante
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
                  title="Abrir prévia em nova aba"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Abrir prévia</span>
                </button>

                {originalBlob && originalBlob.size > 0 ? <button
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
                </button> : isPdf ? <span className="text-xs text-amber-300">PDF original indisponível</span> : null}
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
