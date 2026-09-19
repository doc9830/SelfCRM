import type { Database } from './database'

function timestamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
}

// Скачивает произвольный JSON-текст как файл (резервная копия, копия до импорта и т.п.).
export function downloadJson(json: string, fileName: string): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Скачивает резервную копию в виде JSON-файла.
export function downloadBackup(db: Database): void {
  downloadJson(db.exportData(), `selfcrm-backup-${timestamp()}.json`)
}

// Читает выбранный пользователем файл резервной копии.
export function readBackupFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'))
    reader.readAsText(file)
  })
}
