declare module 'pdf-parse' {
  export class PDFParse {
    constructor(options: Record<string, unknown>)
    getScreenshot(options: Record<string, unknown>): Promise<{
      pages: Array<{ data: Uint8Array; width: number; height: number }>
    }>
    getText(options?: Record<string, unknown>): Promise<{ text: string }>
    destroy(): Promise<void>
  }
}
