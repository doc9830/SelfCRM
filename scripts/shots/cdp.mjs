// Мини-клиент DevTools Protocol без зависимостей: в Node 22 WebSocket уже встроен.
// Даёт страницу с эмуляцией телефона 390×844 @2x и снимок экрана в PNG.

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function openBrowser(port = 9222) {
  const info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
  const ws = new WebSocket(info.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', () => reject(new Error('нет соединения с Chrome на порту ' + port)), { once: true })
  })

  let nextId = 0
  const pending = new Map()
  const listeners = new Map()

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id !== undefined) {
      const entry = pending.get(msg.id)
      if (!entry) return
      pending.delete(msg.id)
      if (msg.error) entry.reject(new Error(`${entry.method}: ${msg.error.message}`))
      else entry.resolve(msg.result)
      return
    }
    for (const fn of listeners.get(msg.method) ?? []) fn(msg.params, msg.sessionId)
  })

  function send(method, params = {}, sessionId) {
    const id = ++nextId
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, method })
      ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }))
    })
  }

  return {
    send,
    close: () => ws.close(),
    log: (line) => process.stdout.write(line + '\n'),
  }
}

export async function openPage(browser, { width = 390, height = 844, dsf = 2 } = {}) {
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true })
  const send = (method, params) => browser.send(method, params, sessionId)

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  // Снаружи приложение не должно ходить: проверка обновлений и подсказки адресов
  // в кадре не нужны, а их запросы могут ждать сети.
  await send('Network.setBlockedURLs', {
    urls: ['*api.github.com*', '*suggestions.dadata.ru*'],
  })
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: dsf,
    mobile: true,
    screenWidth: width,
    screenHeight: height,
  })

  const api = {
    send,
    async evaluate(expression, { awaitPromise = false } = {}) {
      const result = await send('Runtime.evaluate', {
        expression,
        awaitPromise,
        returnByValue: true,
      })
      if (result.exceptionDetails) {
        throw new Error('ошибка в браузере: ' + (result.exceptionDetails.exception?.description ?? expression))
      }
      return result.result.value
    },
    async waitFor(expression, { timeout = 10000, interval = 120, label = expression } = {}) {
      const deadline = Date.now() + timeout
      while (Date.now() < deadline) {
        try {
          if (await api.evaluate(expression)) return true
        } catch {
          // страница в процессе загрузки — просто пробуем снова
        }
        await sleep(interval)
      }
      throw new Error(`не дождались условия: ${label}`)
    },
    async setHash(hash) {
      await api.evaluate(`location.hash = ${JSON.stringify(hash)}`)
    },
    async seed(key, json) {
      await api.evaluate(`localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(json)})`)
    },
    async reload() {
      await send('Page.reload', { ignoreCache: false })
      await api.waitFor(
        'document.readyState === "complete" && document.body.innerText.trim().length > 0',
        { label: 'перезагрузка страницы' },
      )
      await sleep(350)
    },
    async text() {
      return api.evaluate('document.body.innerText')
    },
    async screenshot(path) {
      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      const { writeFileSync } = await import('node:fs')
      writeFileSync(path, Buffer.from(data, 'base64'))
      return path
    },
    async close() {
      await browser.send('Target.closeTarget', { targetId })
    },
  }

  return api
}
