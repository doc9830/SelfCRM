// Сохранение и чтение файла резервной копии.
//
// Главная проверка здесь — та, из-за которой восстановление данных не работало: плагин
// файловой системы без явной кодировки считает данные base64 и декодирует их, поэтому
// JSON превращался в мусор («Unexpected token … is not valid JSON»). Тест закрепляет
// кодировку UTF8 и то, что в файл уходит ровно текст копии.
import { afterEach, describe, expect, it, vi } from 'vitest'

const filesystem = vi.hoisted(() => ({
  native: true,
  writeFile: vi.fn(async (options: Record<string, unknown>) => ({
    uri: `file:///cache/${String(options.path)}`,
  })),
}))
const share = vi.hoisted(() => ({ share: vi.fn(async () => ({})) }))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => filesystem.native },
}))
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: { writeFile: filesystem.writeFile },
}))
vi.mock('@capacitor/share', () => ({ Share: { share: share.share } }))

import { downloadJson, readBackupFile } from './backup'

// FileReader в Node нет: подменяем его поведением «прочитал и отдал текст», как у браузера.
let fileText = ''
class FakeFileReader {
  result: string | null = null
  onload: (() => void) | null = null
  onerror: (() => void) | null = null

  readAsText() {
    this.result = fileText
    this.onload?.()
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  filesystem.native = true
  filesystem.writeFile.mockClear()
  share.share.mockClear()
})

describe('downloadJson', () => {
  it('на Android пишет строку копии как текст, а не как base64', async () => {
    const json = '{"clients": [], "orders": []}'

    await downloadJson(json, 'selfcrm-backup.json')

    expect(filesystem.writeFile).toHaveBeenCalledTimes(1)
    const options = filesystem.writeFile.mock.calls[0][0] as Record<string, unknown>
    expect(options.data).toBe(json)
    expect(options.encoding).toBe('utf8')
    expect(options.path).toBe('selfcrm-backup.json')
    expect(share.share).toHaveBeenCalledTimes(1)
  })

  it('в браузере отдаёт файл ссылкой на скачивание', async () => {
    filesystem.native = false
    const anchor = { href: '', download: '', click: vi.fn() }
    vi.stubGlobal('document', {
      createElement: () => anchor,
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
    })
    const createObjectURL = vi.fn(() => 'blob:selfcrm')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    await downloadJson('{}', 'selfcrm-backup.json')

    expect(filesystem.writeFile).not.toHaveBeenCalled()
    expect(anchor.download).toBe('selfcrm-backup.json')
    expect(anchor.href).toBe('blob:selfcrm')
    expect(anchor.click).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:selfcrm')
  })
})

describe('readBackupFile', () => {
  it('убирает BOM и пробелы по краям: с ними JSON не разбирался', async () => {
    vi.stubGlobal('FileReader', FakeFileReader)
    fileText = '\uFEFF\n  {"clients": []}\n'

    const text = await readBackupFile({} as File)

    expect(text).toBe('{"clients": []}')
  })
})
