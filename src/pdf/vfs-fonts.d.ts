// Декларации типов для pdfmake 0.3.x (у пакета нет собственных типов для сборок build/).
declare module 'pdfmake/build/pdfmake' {
  interface PdfDocument {
    download(filename?: string): Promise<void>
    open(win?: Window | null): Promise<void>
    getBlob(): Promise<Blob>
    getBase64(): Promise<string>
    getDataUrl(): Promise<string>
  }

  interface PdfMakeStatic {
    addVirtualFileSystem(fonts: Record<string, string>): void
    createPdf(def: unknown): PdfDocument
  }

  const pdfMake: PdfMakeStatic
  export default pdfMake
}

declare module 'pdfmake/build/vfs_fonts' {
  const vfs: Record<string, string>
  export default vfs
}
