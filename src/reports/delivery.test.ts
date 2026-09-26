// Проверки доставки файла отчёта: выбор пути и работа с мостом платформы.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  deliverReportFile,
  planReportDelivery,
  registerReportFileBridge,
  reportFileBridge,
  type ReportBridgeResult,
  type ReportFileBridge,
} from './delivery'

afterEach(() => {
  registerReportFileBridge(null)
  vi.unstubAllGlobals()
})

const blob = new Blob(['xlsx'])

describe('выбор пути доставки', () => {
  it('сборка Capacitor сохраняет файл на устройство', () => {
    expect(planReportDelivery({ native: true, bridge: false, canShareFiles: false })).toBe('native')
  })

  it('в мини-приложении Telegram файл уходит ссылкой через мост', () => {
    expect(planReportDelivery({ native: false, bridge: true, canShareFiles: true })).toBe('bridge')
  })

  it('клиент, умеющий отдавать файлы, получает системное меню', () => {
    expect(planReportDelivery({ native: false, bridge: false, canShareFiles: true })).toBe('file-share')
  })

  it('обычный браузер скачивает файл', () => {
    expect(planReportDelivery({ native: false, bridge: false, canShareFiles: false })).toBe(
      'file-download',
    )
  })
})

describe('мост платформы', () => {
  it('регистрируется и снимается', () => {
    const bridge: ReportFileBridge = { send: async () => ({ kind: 'opened', url: null }) }
    expect(reportFileBridge()).toBeNull()
    registerReportFileBridge(bridge)
    expect(reportFileBridge()).toBe(bridge)
    registerReportFileBridge(null)
    expect(reportFileBridge()).toBeNull()
  })

  it('получает файл отчёта целиком и возвращает исход', async () => {
    const sent: Array<{ blob: Blob; fileName: string; message: string }> = []
    const result: ReportBridgeResult = { kind: 'copied', url: 'https://example.com/file.xlsx' }
    registerReportFileBridge({
      send: async (file) => {
        sent.push(file)
        return result
      },
    })

    const delivery = await deliverReportFile({
      blob,
      fileName: 'SelfCRM_Отчет_Все_время.xlsx',
      message: 'Отчёт SelfCRM: за всё время',
    })

    expect(delivery).toEqual({ kind: 'bridge', result })
    expect(sent).toHaveLength(1)
    expect(sent[0].blob).toBe(blob)
    expect(sent[0].fileName).toBe('SelfCRM_Отчет_Все_время.xlsx')
    expect(sent[0].message).toBe('Отчёт SelfCRM: за всё время')
  })
})

describe('без моста и системного меню', () => {
  it('файл скачивается браузером', async () => {
    // В тестовой среде нет ни DOM, ни навигатора: подменяем то, чем пользуется
    // скачивание, — ссылку и адрес объекта.
    const clicks: Array<{ download: string }> = []
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:report', revokeObjectURL: () => {} })
    vi.stubGlobal('document', {
      body: { appendChild: () => {}, removeChild: () => {} },
      createElement: () => ({
        href: '',
        download: '',
        click() {
          clicks.push({ download: this.download })
        },
      }),
    })

    const delivery = await deliverReportFile({
      blob,
      fileName: 'SelfCRM_Отчет_2026-09-01_2026-09-26.xlsx',
      message: 'Отчёт SelfCRM',
    })

    expect(delivery).toEqual({ kind: 'downloaded' })
    expect(clicks).toEqual([{ download: 'SelfCRM_Отчет_2026-09-01_2026-09-26.xlsx' }])
  })
})
