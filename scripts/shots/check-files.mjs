// Проверка: имена кадров в SCREENS лендинга совпадают с файлами в «Screenshots v3»
// и для светлой, и для тёмной темы — галерея и живое демо иначе покажут пустые рамки.
//
//   node scripts/shots/check-files.mjs [--base=http://127.0.0.1:4180]
import { openBrowser, openPage, sleep } from './cdp.mjs'

const BASE = (process.argv.find((arg) => arg.startsWith('--base=')) ?? '--base=http://127.0.0.1:4180')
  .slice('--base='.length)

const browser = await openBrowser()
const page = await openPage(browser, { width: 1440, height: 900, dsf: 1 })
await page.send('Page.navigate', { url: `${BASE}/index.html` })
await sleep(600)
await page.waitFor('document.readyState === "complete" && !!window.SelfCRMLanding')
await sleep(600)

const names = await page.evaluate(`(() => {
  const screens = window.SelfCRMLanding
  return Object.keys(screens).map((key) => screens[key].file)
})()`)
console.log('кадров в SCREENS:', names.length)

let broken = []
for (const word of ['светлый', 'темный']) {
  for (const file of names) {
    const url = `${BASE}/Screenshots%20v3/${encodeURIComponent(file + ' (' + word + ').png')}`
    const response = await fetch(url, { method: 'HEAD' })
    if (!response.ok) broken.push(`${file} (${word}).png → ${response.status}`)
  }
}
console.log(broken.length ? `НЕ НАЙДЕНЫ:\n${broken.join('\n')}` : `все кадры на месте (${names.length * 2} файла)`)

await page.close()
browser.close()
