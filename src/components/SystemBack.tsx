// Системная кнопка «Назад» в Android (включая жест «назад»). В Capacitor 8 ядро
// её не обрабатывает: за это отвечает плагин App. Без своего слушателя нажатие
// уходит в стандартный путь Android и закрывает приложение — поэтому кнопка
// повторяет навигацию приложения, а не закрывает его.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import { useRoute } from '../router'
import { BACK_EVENT, backTarget } from '../utils/back'

// Сколько ждём второе нажатие на «Главной», прежде чем снять подсказку.
const EXIT_HINT_MS = 2000

export function SystemBack() {
  const { route, navigate } = useRoute()
  const [hint, setHint] = useState(false)

  // Обработчик события регистрируется один раз, а адрес и переход берёт из refs:
  // иначе слушатель пересоздавался бы на каждом переходе.
  const routeRef = useRef(route)
  const navigateRef = useRef(navigate)
  const armedRef = useRef(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    routeRef.current = route
    navigateRef.current = navigate
  })

  const stopHint = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    armedRef.current = false
    setHint(false)
  }, [])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let removed = false
    let handle: PluginListenerHandle | undefined

    const onBack = () => {
      // 1. Открытое модальное окно или меню закрываются первыми и «съедают» нажатие.
      if (!document.dispatchEvent(new CustomEvent(BACK_EVENT, { cancelable: true }))) {
        stopHint()
        return
      }

      // 2. Обычный переход — туда же, куда ведёт стрелочка в шапке.
      const target = backTarget(routeRef.current)
      if (target) {
        stopHint()
        navigateRef.current(target)
        return
      }

      // 3. Главная: первое нажатие показывает подсказку, второе — закрывает приложение.
      if (armedRef.current) {
        stopHint()
        void App.exitApp()
        return
      }
      armedRef.current = true
      setHint(true)
      timerRef.current = window.setTimeout(stopHint, EXIT_HINT_MS)
    }

    void App.addListener('backButton', onBack).then((registered) => {
      if (removed) void registered.remove()
      else handle = registered
    })

    return () => {
      removed = true
      stopHint()
      if (handle) void handle.remove()
    }
  }, [stopHint])

  // Переход по адресу снимает «взведённый» выход: подсказка относится к главной.
  useEffect(() => {
    stopHint()
  }, [route.path, stopHint])

  if (!hint) return null

  return (
    <div className="back-hint" role="status">
      Нажмите «Назад» ещё раз, чтобы выйти
    </div>
  )
}
