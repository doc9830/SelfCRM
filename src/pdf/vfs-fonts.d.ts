// Декларации типов для pdfmake (у пакета нет собственных типов для сборок build/).
declare module 'pdfmake/build/pdfmake' {
  interface PdfMakeStatic {
    vfs: Record<string, string>
    addVirtualFileSystem(fonts: Record<string, string>): void
    createPdf(def: unknown): {
      download(filename?: string, callback?: () => void): void
      open(options?: unknown): void
      getBlob(cb: (blob: Blob) => void): void
      getBase64(cb: (base64: string) => void): void
    }
  }
  const pdfMake: PdfMakeStatic
  export default pdfMake
}

declare module 'pdfmake/build/vfs_fonts' {
  const vfs: Record<string, string>
  export default vfs
}
