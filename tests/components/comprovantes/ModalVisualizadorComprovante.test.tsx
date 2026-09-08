import React from 'react'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import ModalVisualizadorComprovante from '@/components/comprovantes/ModalVisualizadorComprovante'

const mocks = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        createSignedUrl: mocks.createSignedUrl,
      }),
    },
  }),
}))

describe('ModalVisualizadorComprovante Component', () => {
  beforeEach(() => {
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.supabase.co/storage/v1/object/sign/chat-midias/comprovantes/123/comprovante.pdf?token=abc' },
      error: null,
    })

    // Mock global fetch & createObjectURL in jsdom
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
      blob: async () => new Blob(['%PDF-1.4 mock content'], { type: 'application/pdf' }),
    } as any)

    // Mock HTMLCanvasElement
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string, options?: ElementCreationOptions) => {
      if (tagName === 'canvas') {
        const el = originalCreateElement('canvas', options) as HTMLCanvasElement
        el.getContext = vi.fn().mockReturnValue({
          fillStyle: '',
          fillRect: vi.fn(),
        }) as any
        el.toDataURL = vi.fn().mockReturnValue('data:image/png;base64,mockPngBase64String')
        return el
      }
      return originalCreateElement(tagName, options)
    })

    // Mock pdfjsLib
    ;(window as any).pdfjsLib = {
      GlobalWorkerOptions: {},
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: () =>
            Promise.resolve({
              getViewport: () => ({ width: 600, height: 800 }),
              render: () => ({ promise: Promise.resolve() }),
            }),
        }),
      }),
    }

    if (!window.URL.createObjectURL) {
      window.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-blob')
    } else {
      vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:http://localhost/mock-blob')
    }

    if (!window.URL.revokeObjectURL) {
      window.URL.revokeObjectURL = vi.fn()
    } else {
      vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {})
    }
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders metadata, file name, converts PDF to PNG and displays PNG image', async () => {
    render(
      <ModalVisualizadorComprovante
        isOpen={true}
        onClose={vi.fn()}
        urlArquivo="comprovantes/123/comprovante_pix_final.pdf"
        nomeArquivo="comprovante_pix_final.pdf"
        clienteNome="Wilkin Barban"
        tamanhoBytes={204800}
        dataCriacao="2026-08-25T14:30:00Z"
      />
    )

    expect(screen.getByText(/comprovante_pix_final\.pdf/i)).toBeInTheDocument()
    expect(screen.getByText(/Wilkin Barban/i)).toBeInTheDocument()
    expect(screen.getByText(/200\.0 KB/i)).toBeInTheDocument()
    expect(screen.getByText(/Prévia gerada do PDF/i)).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText(/Baixar PDF Original/i)).toBeInTheDocument()
      expect(screen.getByText(/Abrir prévia/i)).toBeInTheDocument()
      const img = screen.getByRole('img')
      expect(img).toBeInTheDocument()
      expect(img).toHaveAttribute('src', expect.stringContaining('data:image/png;base64,'))
      expect((window as any).pdfjsLib.GlobalWorkerOptions.workerSrc).toBe('/pdfjs/pdf.worker.min.js')
    })
  })

  it('triggers onClose when clicking the close button', () => {
    const onCloseMock = vi.fn()
    render(
      <ModalVisualizadorComprovante
        isOpen={true}
        onClose={onCloseMock}
        urlArquivo="comprovantes/123/comprovante.pdf"
        nomeArquivo="comprovante.pdf"
      />
    )

    const closeBtn = screen.getByRole('button', { name: /Fechar Visualizador/i })
    fireEvent.click(closeBtn)

    expect(onCloseMock).toHaveBeenCalledTimes(1)
  })

  it('renders image viewer with zoom controls for image files', async () => {
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.supabase.co/storage/v1/object/sign/chat-midias/comprovantes/123/recibo.png?token=abc' },
      error: null,
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
      blob: async () => new Blob(['mock-image-data'], { type: 'image/png' }),
    } as any)

    render(
      <ModalVisualizadorComprovante
        isOpen={true}
        onClose={vi.fn()}
        urlArquivo="comprovantes/123/recibo.png"
        nomeArquivo="recibo.png"
      />
    )

    expect(screen.getByText(/Imagem do comprovante/i)).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Aumentar zoom/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Diminuir zoom/i })).toBeInTheDocument()
    })

    const zoomInBtn = screen.getByRole('button', { name: /Aumentar zoom/i })
    fireEvent.click(zoomInBtn)

    expect(screen.getByText('125%')).toBeInTheDocument()
  })

  it('uses the authenticated SVG preview endpoint for generated receipts', async () => {
    render(
      <ModalVisualizadorComprovante
        isOpen
        onClose={vi.fn()}
        urlArquivo="/api/receipts/receipt-1/pdf"
        nomeArquivo="comprovante.pdf"
      />,
    )

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/receipts/receipt-1/svg')
      expect(screen.getByText(/Prévia vetorial do comprovante/i)).toBeInTheDocument()
      expect(screen.getByText(/Abrir prévia/i)).toBeInTheDocument()
    })
  })

  it('destroys a loaded PDF document when the viewer closes', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined)
    ;(window as any).pdfjsLib.getDocument = () => ({
      promise: Promise.resolve({
        numPages: 1,
        destroy,
        getPage: () => Promise.resolve({
          getViewport: () => ({ width: 600, height: 800 }),
          render: () => ({ promise: Promise.resolve() }),
        }),
      }),
    })

    const view = render(
      <ModalVisualizadorComprovante
        isOpen
        onClose={vi.fn()}
        urlArquivo="comprovantes/123/comprovante.pdf"
        nomeArquivo="comprovante.pdf"
      />,
    )
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument())
    view.rerender(
      <ModalVisualizadorComprovante
        isOpen={false}
        onClose={vi.fn()}
        urlArquivo="comprovantes/123/comprovante.pdf"
        nomeArquivo="comprovante.pdf"
      />,
    )
    await waitFor(() => expect(destroy).toHaveBeenCalledTimes(1))
  })

  it('does not offer an empty original download when only a preview loaded', async () => {
    ;(global.fetch as any)
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(['svg'], { type: 'image/svg+xml' }) })
      .mockResolvedValueOnce({ ok: false, status: 500 })

    render(
      <ModalVisualizadorComprovante
        isOpen
        onClose={vi.fn()}
        urlArquivo="/api/receipts/receipt-1/pdf"
        nomeArquivo="comprovante.pdf"
      />,
    )

    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument())
    expect(screen.queryByText(/Baixar PDF Original/i)).not.toBeInTheDocument()
    expect(screen.getByText(/PDF original indisponível/i)).toBeInTheDocument()
  })
})
