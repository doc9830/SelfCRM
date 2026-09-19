import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { GITHUB_REPO } from './version'

// Маршрут раздела «Настройки → Обновления»: открывается уведомлением о новой версии.
export const UPDATE_SECTION_PATH = '/settings?section=updates'

export interface ReleaseInfo {
  version: string
  name: string
  notes: string
  url: string
  apkUrl?: string
  publishedAt: string
}

const API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`

interface GithubAsset {
  name?: string
  browser_download_url?: string
}

interface GithubRelease {
  tag_name?: string
  name?: string | null
  body?: string | null
  html_url?: string
  published_at?: string
  assets?: GithubAsset[]
}

// Сравнение семантических версий («1.2.3» или «v1.2.3»).
// Возвращает >0, если a новее b; <0, если старше; 0, если равны.
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .trim()
      .replace(/^v/i, '')
      .split('.')
      .map((part) => {
        const n = Number.parseInt(part, 10)
        return Number.isFinite(n) ? n : 0
      })
  const left = parse(a)
  const right = parse(b)
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function isNewerVersion(latest: string, current: string): boolean {
  return compareVersions(latest, current) > 0
}

function findApkUrl(assets: GithubAsset[]): string | undefined {
  return assets.find((a) => (a.name ?? '').toLowerCase().endsWith('.apk'))?.browser_download_url
}

// Возвращает последний опубликованный релиз или null, если релизов ещё нет.
export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  const response = await fetch(API_URL, {
    headers: { Accept: 'application/vnd.github+json' },
  })

  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(`Не удалось проверить обновления (ошибка ${response.status})`)
  }

  const json = (await response.json()) as GithubRelease
  const version = (json.tag_name ?? '').trim().replace(/^v/i, '')
  if (!version) return null

  return {
    version,
    name: json.name?.trim() || `Версия ${version}`,
    notes: (json.body ?? '').trim(),
    url: json.html_url ?? `https://github.com/${GITHUB_REPO}/releases`,
    apkUrl: findApkUrl(json.assets ?? []),
    publishedAt: json.published_at ?? '',
  }
}

// Открывает внешнюю ссылку: на Android — системный браузер, в вебе — новая вкладка.
export async function openExternal(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url })
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

// Нативный плагин Android: скачивает APK во временный каталог и запускает
// системный установщик. Скачивание делается нативно, потому что у ассетов
// GitHub нет CORS-заголовков и fetch из WebView не сработает.
export const UPDATE_FILE_NAME = 'selfcrm-update.apk'

export interface UpdateProgress {
  received: number
  total: number
  fraction: number
}

interface AppInstallerPlugin {
  download(options: { url: string; fileName: string }): Promise<{ path: string; size: number }>
  install(options: { fileName: string }): Promise<{ value: boolean }>
  addListener(eventName: 'progress', listenerFunc: (info: UpdateProgress) => void): Promise<PluginListenerHandle>
  removeAllListeners(): Promise<void>
}

const AppInstaller = registerPlugin<AppInstallerPlugin>('AppInstaller')

// Скачивает APK во временный каталог приложения. Работает только на Android.
export async function downloadUpdate(
  apkUrl: string,
  onProgress?: (progress: UpdateProgress) => void,
): Promise<void> {
  const listener = onProgress
    ? await AppInstaller.addListener('progress', (info) => onProgress(info))
    : null
  try {
    await AppInstaller.download({ url: apkUrl, fileName: UPDATE_FILE_NAME })
  } finally {
    if (listener) await listener.remove()
  }
}

// Открывает уже скачанный APK в системном установщике Android.
export async function installUpdate(): Promise<void> {
  await AppInstaller.install({ fileName: UPDATE_FILE_NAME })
}
