// Замеры первого экрана лендинга: демо (кадр, табы, кнопка перехода) должно целиком
// попадать в окно ноутбука — этого требуют комментарии в index.html и README лендинга.
//
//   node scripts/shots/measure.mjs [--base=http://127.0.0.1:4180]
//
// Лендинг должен быть отдан локальным сервером: python3 -m http.server 4180 --bind 127.0.0.1
import { openBrowser, openPage, sleep } from './cdp.mjs'

const BASE = (process.argv.find((arg) => arg.startsWith('--base=')) ?? '--base=http://127.0.0.1:4180')
  .slice('--base='.length)

const browser = await openBrowser()
const page = await openPage(browser, { width: 1440, height: 900, dsf: 1 })

const sizes = [
  [1440, 900],
  [1366, 768],
  [1024, 768],
]

for (const [width, height] of sizes) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: height,
  })
  await page.send('Page.navigate', { url: `${BASE}/index.html` })
  await page.waitFor('document.readyState === "complete"')
  await sleep(900)
  const data = await page.evaluate(`(() => {
    const box = (selector) => {
      const el = document.querySelector(selector)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) }
    }
    return {
      viewport: window.innerHeight,
      phone: box('.hero .phone'),
      tabs: box('#tabs'),
      action: box('#action-pill'),
      panel: box('#panel-card'),
      gallery: document.querySelectorAll('#shots figure').length,
      screens: document.querySelectorAll('.shots figure').length,
    }
  })()`)
  const below = (b) => (b && b.bottom > data.viewport ? 'НИЖЕ СГИБА' : 'ок')
  console.log(`${width}×${height}: кадр ${data.phone.top}–${data.phone.bottom} (${below(data.phone)}), ` +
    `табы низ ${data.tabs.bottom} (${below(data.tabs)}), кнопка низ ${data.action.bottom} (${below(data.action)}), ` +
    `карточек в галерее ${data.screens}`)
}

await page.close()
browser.close()
