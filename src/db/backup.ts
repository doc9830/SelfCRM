import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { normalizeBackupText } from './backupText'
import type { Database } from './database'

function timestamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
}

/**
 * Сохраняет произвольный JSON-текст как файл (резервная копия, копия до импорта и т.п.).
 *
 * В браузере это обычное скачивание, а на Android — запись файла во временный каталог
 * приложения и системное меню «Поделиться»: Android-WebView игнорирует скачивание по
 * ссылке `<a download>`, поэтому раньше нажатие «Скачать» ничего не делало.
 * Так же формируется PDF-чек (см. src/pdf/documents.ts).
 */
export async function downloadJson(json: string, fileName: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const file = await Filesystem.writeFile({
      path: fileName,
      data: json,
      directory: Directory.Cache,
      recursive: true,
      // Без явной кодировки плагин считает данные base64 и декодирует их: JSON-текст
      // превращался в мусор, и восстановление падало с «Unexpected token … is not valid
      // JSON». Encoding.UTF8 пишет строку как есть — это и есть формат резервной копии.
      encoding: Encoding.UTF8,
    })
    await Share.share({
      title: fileName,
      text: fileName,
      files: [file.uri],
    })
    return
  }

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
export function downloadBackup(db: Database): Promise<void> {
  return downloadJson(db.exportData(), `selfcrm-backup-${timestamp()}.json`)
}

// Читает выбранный пользователем файл резервной копии. BOM и пробелы по краям убираются
// сразу (см. db/backupText.ts): файл мог пройти через чат, почту или редактор.
export function readBackupFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(normalizeBackupText(String(reader.result)))
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'))
    reader.readAsText(file)
  })
}
