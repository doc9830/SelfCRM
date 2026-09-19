import { useEffect, useState } from 'react'
import { Icon } from './Icons'
import { useRoute } from '../router'
import { fetchLatestRelease, isNewerVersion, UPDATE_SECTION_PATH } from '../updates'
import { APP_VERSION } from '../version'

// Версия, уведомление о которой пользователь закрыл вручную: повторно не показываем.
const DISMISS_KEY = 'selfcrm:update-dismissed'

function readDismissed(): string {
  try {
    return localStorage.getItem(DISMISS_KEY) ?? ''
  } catch {
    return ''
  }
}

function writeDismissed(version: string): void {
  try {
    localStorage.setItem(DISMISS_KEY, version)
  } catch {
    // localStorage может быть недоступен — просто не запоминаем закрытие.
  }
}

// Всплывающее уведомление о новой версии: проверка запускается автоматически
// при открытии приложения, нажатие ведёт в «Настройки → Обновления».
export function UpdateToast() {
  const { navigate } = useRoute()
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const check = async () => {
      try {
        const release = await fetchLatestRelease()
        if (cancelled || !release) return
        if (!isNewerVersion(release.version, APP_VERSION)) return
        if (readDismissed() === release.version) return
        setVersion(release.version)
      } catch {
        // Нет сети или GitHub недоступен — проверка обновлений не должна мешать работе.
      }
    }

    void check()

    return () => {
      cancelled = true
    }
  }, [])

  if (!version) return null

  const openSettings = () => {
    setVersion(null)
    navigate(UPDATE_SECTION_PATH)
  }

  const dismiss = () => {
    if (version) writeDismissed(version)
    setVersion(null)
  }

  return (
    <div className="update-toast" role="status">
      <span className="update-toast-icon">
        <Icon name="download" size={20} />
      </span>
      <button type="button" className="update-toast-main" onClick={openSettings}>
        <span className="update-toast-title">Доступна версия {version}</span>
        <span className="update-toast-desc">Нажмите, чтобы открыть обновление</span>
      </button>
      <button type="button" className="update-toast-close" onClick={dismiss} aria-label="Скрыть">
        <Icon name="close" size={16} />
      </button>
    </div>
  )
}
