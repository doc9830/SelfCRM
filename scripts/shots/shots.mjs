// Съёмка скриншотов приложения: 22 кадра в светлой и тёмной теме.
//
//   node shots.mjs --theme=light --out=/tmp/selfcrm-shots/light
//   node shots.mjs --theme=dark  --out=/tmp/selfcrm-shots/dark
//
// Демо-база пишется в localStorage перед каждым кадром (см. demo.mjs), каждый экран
// открывается отдельной загрузкой — приложение не остаётся с прежней базой в памяти.
// Внешние запросы (проверка обновлений, подсказки адресов) блокируются в cdp.mjs.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openBrowser, openPage, sleep } from './cdp.mjs'
import { demoJson, idsByStatus, STORAGE_KEY, THEME_KEY } from './demo.mjs'

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=')
    return [key, value]
  }),
)

const BASE = (args.base ?? 'http://127.0.0.1:4173').replace(/\/$/, '') + '/'
const theme = args.theme === 'dark' ? 'dark' : 'light'
const word = theme === 'dark' ? 'темный' : 'светлый'
const OUT = args.out ?? `/tmp/selfcrm-shots/${theme}`
mkdirSync(OUT, { recursive: true })

const browser = await openBrowser()
const page = await openPage(browser)

await page.send('Page.navigate', { url: BASE })
await page.waitFor('document.readyState === "complete"')
await sleep(600)

const ids = idsByStatus()
const snapshot = ids.snapshot

// ----- действия на странице -----

// Клик по элементу с точным текстом (кнопки, ссылки, строки списков, вкладки).
async function clickText(text) {
  const result = await page.evaluate(`(() => {
    const wanted = ${JSON.stringify(text)}
    const all = [...document.querySelectorAll('button, a, .list-item, .chip, .suggest-item')]
    const exact = all.filter((el) => el.textContent.trim() === wanted)
    const target = (exact.length ? exact : all.filter((el) => el.textContent.trim().startsWith(wanted))).pop()
    if (!target) return 'нет'
    target.click()
    return 'ок'
  })()`)
  if (result !== 'ок') throw new Error(`не нашли элемент «${text}»`)
  await sleep(260)
}

// Значение в поле ввода через родной сеттер: так React видит изменение.
async function setField(selector, value, index = 0) {
  const result = await page.evaluate(`(() => {
    const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})]
    const el = nodes[${index}]
    if (!el) return 'нет'
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.focus()
    return 'ок'
  })()`)
  if (result !== 'ок') throw new Error(`не нашли поле «${selector}» №${index}`)
  await sleep(200)
}

// Прокрутка к элементу с точным текстом — глубочайшему в дереве (самому вложенному).
async function scrollToText(text, block = 'center') {
  const result = await page.evaluate(`(() => {
    const wanted = ${JSON.stringify(text)}
    const depth = (el) => { let d = 0; let node = el; while (node.parentElement) { d += 1; node = node.parentElement } return d }
    const nodes = [...document.querySelectorAll('div, span, b, p, h2, h3, li, button, a, label')]
      .filter((el) => el.textContent.trim() === wanted)
    if (!nodes.length) return 'нет'
    nodes.reduce((a, b) => (depth(b) > depth(a) ? b : a)).scrollIntoView({ block: ${JSON.stringify(block)} })
    return 'ок'
  })()`)
  if (result !== 'ок') throw new Error(`не нашли текст для прокрутки «${text}»`)
  await sleep(300)
}

async function scrollBy(fraction) {
  await page.evaluate(`(() => {
    const el = document.scrollingElement || document.documentElement
    el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) * ${fraction})
    return 'ок'
  })()`)
  await sleep(280)
}


// Поле по подписи: Field рисует <label class="field"><span class="field-label">…</span>.
async function setFieldByLabel(label, value, index = 0) {
  const result = await page.evaluate(`(() => {
    const fields = [...document.querySelectorAll('label.field')]
      .filter((f) => f.querySelector('.field-label')?.textContent.trim() === ${JSON.stringify(label)})
    const field = fields[${index}]
    if (!field) return 'нет'
    const el = field.querySelector('input, textarea, select')
    if (!el) return 'нет'
    const proto = el.tagName === 'TEXTAREA'
      ? HTMLTextAreaElement.prototype
      : el.tagName === 'SELECT' ? null : HTMLInputElement.prototype
    if (proto) Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
    else el.value = ${JSON.stringify(value)}
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    el.focus()
    el.scrollLeft = 0
    return 'ок'
  })()`)
  if (result !== 'ок') throw new Error(`не нашли поле «${label}» №${index}`)
  await sleep(200)
}

// Поле по подсказке (placeholder) или по aria-label.
async function setFieldByAttribute(attribute, name, value, index = 0) {
  const result = await page.evaluate(`(() => {
    const nodes = [...document.querySelectorAll('input, textarea')]
      .filter((el) => el.getAttribute(${JSON.stringify(attribute)}) === ${JSON.stringify(name)})
    const el = nodes[${index}]
    if (!el) return 'нет'
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.focus()
    el.scrollLeft = 0
    return 'ок'
  })()`)
  if (result !== 'ок') throw new Error(`не нашли поле ${attribute}="${name}" №${index}`)
  await sleep(220)
}

// ----- подготовка отдельных экранов -----

// Массовый приход или списание: открыть окно, написать причину и количества.
async function fillBulk(kind) {
  await clickText(kind === 'in' ? 'Приход' : 'Списание')
  await page.waitFor('!!document.querySelector(".modal")', { label: 'окно массовой операции' })
  const picks = kind === 'in'
    ? [['Гибкая подводка 1/2"', '6'], ['Кран шаровой 1/2"', '10']]
    : [['Лента ФУМ (10 м)', '4'], ['Кран шаровой 1/2"', '1']]
  await setFieldByLabel('Причина *', kind === 'in' ? 'По накладной №132' : 'Истёк срок годности')
  for (const [name, qty] of picks) {
    await setFieldByAttribute('aria-label', `Количество: ${name}`, qty)
  }
}

// Экран товара в разделе «Склад»: корректировка остатка с комментарием.
async function fillStockEdit() {
  await clickText('Корректировка')
  await setFieldByLabel('Новый остаток, шт', '14')
  await setFieldByLabel('Комментарий', 'Инвентаризация склада')
}


// ----- кадры -----

const SCREENS = [
  { file: 'Главный экран', hash: '#/', must: ['Активные заказы', 'Напоминания', 'СЕГОДНЯ'] },
  { file: 'Клиенты', hash: '#/clients', must: ['ООО «Кухни Плюс»', 'Мария Смирнова'] },
  { file: 'Карточка клиента', hash: `#/clients/${snapshot.clients[0].id}`,
    must: ['История заказов', 'Маршрут', 'Вызов'] },
  { file: 'Архив клиентов', hash: '#/clients?archive=1', must: ['Архив', 'Елена Никитина'] },
  { file: 'Новый клиент', hash: '#/clients/new', must: ['Имя *', 'Телефон', 'Сохранить'] },
  { file: 'Заказы', hash: '#/orders', must: ['Заказы', 'В работе'] },
  { file: 'Заказ в работе', hash: `#/orders/${ids.inProgress[0].id}`,
    must: ['Частично оплачен', 'Добавить оплату', 'Напоминания'],
    scrollTo: 'Оплата' },
  { file: 'Завершенный заказ', hash: `#/orders/${ids.done[1].id}`,
    must: ['Чек (PDF)', 'Завершён', 'Оплата'],
    scrollTo: 'Чек (PDF)' },
  { file: 'Повторить заказ', hash: `#/orders/${ids.done[0].id}`,
    must: ['Повторить заказ', 'Чек (PDF)'],
    scrollTo: 'Повторить заказ', scrollBlock: 'end' },
  { file: 'Новый заказ', hash: '#/orders/new', setup: fillNewOrder, scrollBy: 0,
    must: ['Позиции', 'Добавить позицию', 'Итого'] },
  { file: 'Товары', hash: '#/products', must: ['Смеситель для кухни', 'Услуга'] },
  { file: 'Карточка товара', hash: '#/products', setup: openProductCard,
    must: ['Цена, ₽', 'Себестоимость, ₽', 'Прибыль с единицы'] },
  { file: 'Склад', hash: '#/stock', must: ['Приход', 'Списание', 'Смеситель для кухни'] },
  { file: 'Массовый приход', hash: '#/stock', setup: () => fillBulk('in'),
    must: ['Массовый приход', 'Сколько пришло, шт'] },
  { file: 'Массовое списание', hash: '#/stock', setup: () => fillBulk('out'),
    must: ['Массовое списание', 'Сколько списать, шт'] },
  { file: 'Движение товара', hash: `#/stock/${ids.firstProduct.id}`,
    must: ['Движение товара', 'Поступление', 'Корректировка'],
    scrollTo: 'Движение товара' },
  { file: 'Изменение остатка', hash: `#/stock/${ids.firstProduct.id}`, setup: fillStockEdit,
    must: ['Остаток станет:', 'Новый остаток, шт'] },
  { file: 'Низкий остаток', hash: '#/stock', scrollTo: 'Кран шаровой 1/2"',
    must: ['низким остатком', 'мин.'] },
  { file: 'Статистика', hash: '#/statistics', scrollBy: 0.18,
    must: ['Выручка', 'Прибыль', 'Топ товаров и услуг'] },
  { file: 'Настройки', hash: '#/settings', must: ['Тёмная тема', 'Исполнитель'] },
  { file: 'Резервная копия', hash: '#/settings', scrollTo: 'Резервная копия',
    must: ['Экспорт', 'Импорт'] },
  { file: 'Обратная связь', hash: '#/feedback', must: ['Обратная связь', 'Идея', 'Открыть письмо'] },
]

const texts = []
for (const screen of SCREENS) {
  // Свежая база и тема на каждый кадр: экраны не влияют друг на друга.
  await page.seed(THEME_KEY, theme)
  await page.seed(STORAGE_KEY, demoJson())
  await page.setHash(screen.hash)
  await page.reload()
  if (screen.setup) await screen.setup()
  if (screen.scrollTo) await scrollToText(screen.scrollTo, screen.scrollBlock)
  if (typeof screen.scrollBy === 'number') await scrollBy(screen.scrollBy)
  await sleep(280)

  const text = await page.text()
  for (const needle of screen.must) {
    if (!text.includes(needle)) {
      throw new Error(`кадр «${screen.file}»: на экране нет «${needle}»`)
    }
  }

  const path = join(OUT, `${screen.file} (${word}).png`)
  await page.screenshot(path)
  texts.push(`===== ${screen.file} (${screen.hash})\n${text}`)
  console.log(`✓ ${screen.file} (${word})`)
}

writeFileSync(join(OUT, 'texts.txt'), texts.join('\n\n'))
console.log(`Готово: ${SCREENS.length} кадров в ${OUT}`)

await page.close()
browser.close()

// Новый заказ: клиент из списка, две позиции из каталога и количества.
async function fillNewOrder() {
  await setFieldByAttribute('placeholder', 'Начните вводить имя или телефон…', 'Кухни')
  await clickText('ООО «Кухни Плюс»')
  await setFieldByAttribute('placeholder', 'Поиск товара или услуги…', 'Смеситель для кухни')
  await clickText('Смеситель для кухни')
  await setFieldByLabel('Кол-во', '2')
  await clickText('Добавить позицию')
  await setFieldByAttribute('placeholder', 'Поиск товара или услуги…', 'Установка смесителя', 1)
  await clickText('Установка смесителя')
  await setFieldByLabel('Кол-во', '1', 1)
  await setFieldByLabel('Комментарий', 'Монтаж на кухне, доступ после 18:00')
}

// Открыть карточку товара (форма редактирования каталога).
async function openProductCard() {
  await clickText('Смеситель для кухни')
  await page.waitFor('!!document.querySelector(".modal")', { label: 'карточка товара' })
}
