import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * Тесты на правила системных отступов (safe-area) в index.css.
 *
 * Регресс: высота нижней навигации задавалась как `height: var(--nav-h)` при
 * `box-sizing: border-box`, из-за чего системный отступ (полоса навигации Android)
 * не добавлялся к высоте, а вычитался из неё — иконки и подписи вкладок уезжали
 * под системную полосу. Отступ обязан прибавляться к высоте полосы вкладок.
 */
const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8')

// Тело правила по селектору, например ruleBody('.app-nav') → "height: ...".
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`))
  expect(match, `в index.css нет правила ${selector}`).not.toBeNull()
  return match![1]
}

describe('системные отступы в index.css', () => {
  it('--safe-top/--safe-bottom берут максимум из env(), Capacitor и Telegram', () => {
    const root = ruleBody(':root')
    expect(root).toContain(
      '--safe-bottom: max(env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px), var(--tg-safe-area-inset-bottom, 0px))'
    )
    expect(root).toContain(
      '--safe-top: max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px), var(--tg-safe-area-inset-top, 0px))'
    )
  })

  it('высота нижней навигации = полоса вкладок + системный отступ', () => {
    const nav = ruleBody('.app-nav')
    expect(nav).toContain('height: calc(var(--nav-h) + var(--safe-bottom))')
    expect(nav).toContain('padding-bottom: var(--safe-bottom)')
  })

  it('шапка прибавляет системный отступ сверху к своей высоте', () => {
    const header = ruleBody('.app-header')
    expect(header).toContain('height: calc(var(--header-h) + var(--safe-top))')
    expect(header).toContain('padding: var(--safe-top) 12px 0')
  })

  it('контент и плавающие элементы отсчитываются от системной полосы', () => {
    expect(ruleBody('.app-main')).toContain('calc(var(--nav-h) + 24px + var(--safe-bottom))')
    expect(ruleBody('.fab')).toContain('calc(var(--nav-h) + 16px + var(--safe-bottom))')
    expect(ruleBody('.update-toast')).toContain('calc(var(--nav-h) + 84px + var(--safe-bottom))')
    expect(ruleBody('.back-hint')).toContain('calc(var(--nav-h) + 20px + var(--safe-bottom))')
    expect(ruleBody('.modal-overlay')).toContain('padding: 16px 16px calc(16px + var(--safe-bottom))')
  })

  it('«сырого» env(safe-area-*) в правилах нет — в части сборок он не задан', () => {
    const withoutVariables = css.replace(/--safe-(top|bottom):[^\n]*/g, '')
    expect(withoutVariables).not.toContain('env(safe-area')
  })
})
