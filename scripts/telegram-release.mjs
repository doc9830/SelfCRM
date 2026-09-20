#!/usr/bin/env node
// Публикация изменений из GitHub Release в Telegram-канал SelfCRM.
//
// Источником правды считается сам релиз: tag_name (версия), name (заголовок),
// body (changelog) и assets (APK, обложка). История коммитов и diff не разбираются.
//
// Схема: GitHub Release published → этот скрипт → Telegram Bot API → канал.
// Никаких зависимостей, серверов и сторонних сервисов: только встроенные в Node
// fetch, FormData и Blob, поэтому в GitHub Actions не нужен `npm ci`.
//
// Примеры:
//   # локальная проверка формирования поста (в Telegram ничего не уходит, секреты не нужны)
//   node scripts/telegram-release.mjs --dry-run --release-file scripts/fixtures/telegram-release.json
//
//   # проверка на настоящих данных релиза, полученных через API
//   node scripts/telegram-release.mjs --dry-run --tag v1.3.1
//
//   # так скрипт вызывает workflow: данные берутся из события release.published
//   node scripts/telegram-release.mjs --event-file "$GITHUB_EVENT_PATH"
//
// Секреты читаются только из окружения (TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID)
// и никогда не печатаются: в логах они заменяются на «***».

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const TELEGRAM_API = 'https://api.telegram.org'
const GITHUB_API = 'https://api.github.com'

const DEFAULTS = {
  repo: 'doc9830/SelfCRM',
  assetsDir: 'release-assets',
  maxMessage: 4096, // лимит Telegram на длину текста сообщения
  maxCaption: 1024, // лимит Telegram на подпись к изображению
}

const USAGE = `Скрипт публикации GitHub Release в Telegram-канал SelfCRM.

Аргументы:
  --dry-run                 сформировать и напечатать сообщение, но не отправлять
  --event-file <путь>       JSON события GitHub (в Actions: $GITHUB_EVENT_PATH)
  --release-file <путь>     JSON самого релиза (фикстуры, отладка)
  --tag <тег>               взять релиз по тегу через API; без тега — последний
  --repo <owner/name>       репозиторий (по умолчанию ${DEFAULTS.repo})
  --assets-dir <путь>       папка обложек внутри репозитория (по умолчанию ${DEFAULTS.assetsDir})
  --assets-ref <ревизия>    где искать обложку в репозитории (по умолчанию — тег релиза,
                            затем основная ветка: обложку можно добавить после релиза)
  --skip-sections <список>  заголовки секций через запятую, которые не публикуем
  --max-message <число>     лимит длины сообщения (по умолчанию ${DEFAULTS.maxMessage})
  --max-caption <число>     лимит длины подписи к фото (по умолчанию ${DEFAULTS.maxCaption})
  --require-apk             падать, если в релизе нет APK (по умолчанию — fallback на релиз)
  --no-cover                не искать обложку, отправить текстовый пост
  --help                    эта справка

Окружение:
  TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID — секреты GitHub Actions;
  GH_TOKEN (или GITHUB_TOKEN), GH_REPO, GH_RUN_ID — для проверки повторной публикации.`

// Значения секретов держим в одном месте, чтобы гарантированно вырезать их из логов.
const secrets = { token: '', channel: '' }

function fail(message) {
  const error = new Error(message)
  error.fatal = true
  throw error
}

function info(message) {
  console.log(maskSecrets(message))
}

function warn(message) {
  console.log(maskSecrets(`⚠️  ${message}`))
}

function maskSecrets(text) {
  let out = String(text)
  if (secrets.token) out = out.split(secrets.token).join('***')
  if (secrets.channel) out = out.split(secrets.channel).join(maskChannel(secrets.channel))
  return out
}

function maskChannel(channel) {
  if (!channel) return '***'
  return channel.startsWith('@') ? `${channel.slice(0, 8)}…` : 'chat ***'
}

function parseArgs(argv) {
  const opts = {
    ...DEFAULTS,
    repo: process.env.GH_REPO || process.env.GITHUB_REPOSITORY || DEFAULTS.repo,
    assetsDir: process.env.SELFCRM_ASSETS_DIR || DEFAULTS.assetsDir,
    assetsRef: process.env.SELFCRM_ASSETS_REF || '',
    tag: '',
    eventFile: null,
    releaseFile: null,
    dryRun: false,
    noCover: false,
    requireApk: false,
    skipSections: (process.env.TELEGRAM_SKIP_SECTIONS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    help: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => {
      if (i + 1 >= argv.length) fail(`у аргумента ${arg} нет значения`)
      i += 1
      return argv[i]
    }
    switch (arg) {
      case '--help':
      case '-h':
        opts.help = true
        break
      case '--dry-run':
        opts.dryRun = true
        break
      case '--no-cover':
        opts.noCover = true
        break
      case '--require-apk':
        opts.requireApk = true
        break
      case '--tag':
        opts.tag = next()
        break
      case '--event-file':
        opts.eventFile = next()
        break
      case '--release-file':
        opts.releaseFile = next()
        break
      case '--repo':
        opts.repo = next()
        break
      case '--assets-dir':
        opts.assetsDir = next()
        break
      case '--assets-ref':
        opts.assetsRef = next()
        break
      case '--max-message':
        opts.maxMessage = Number(next())
        break
      case '--max-caption':
        opts.maxCaption = Number(next())
        break
      case '--skip-sections':
        opts.skipSections = next()
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        break
      default:
        fail(`неизвестный аргумент: ${arg} (справка: --help)`)
    }
  }

  return opts
}

// ---------- HTML и текст ----------

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Ссылка попадает в атрибут href. Текст уже экранирован, поэтому здесь только
// проверяем схему и закрываем кавычки: повторное экранирование дало бы &amp;amp;.
function safeUrl(url) {
  if (!/^https?:\/\//i.test(url)) return null
  return url.replace(/"/g, '&quot;')
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '')
}

function collapse(text) {
  return String(text).replace(/\s+/g, ' ').trim()
}

// ---------- GitHub: релиз и файлы ----------

function ghHeaders(token, accept = 'application/vnd.github+json') {
  const headers = {
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'SelfCRM-telegram-release',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

function encodePath(path) {
  return path
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')
}

function readJsonFile(path, what) {
  if (!existsSync(path)) fail(`${what}: файл не найден — ${path}`)
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`${what}: не удалось разобрать JSON (${path}): ${error.message}`)
  }
}

// Принимает и «сырой» релиз, и полный payload события GitHub (там релиз в поле release).
function normalizeRelease(json, source) {
  const release = json && typeof json === 'object' && json.release ? json.release : json
  if (!release || typeof release !== 'object' || !release.tag_name) {
    fail(`${source}: в JSON нет поля tag_name — это не релиз GitHub?`)
  }
  return release
}

async function fetchRelease({ repo, tag, token }) {
  const url = tag
    ? `${GITHUB_API}/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`
    : `${GITHUB_API}/repos/${repo}/releases/latest`
  const response = await fetch(url, { headers: ghHeaders(token) })
  if (response.status === 404) {
    fail(tag ? `релиз с тегом ${tag} не найден в ${repo}` : `в ${repo} нет опубликованных релизов`)
  }
  if (!response.ok) fail(`GitHub API вернул ${response.status} при получении релиза`)
  return response.json()
}

function loadRelease(opts) {
  if (opts.releaseFile) {
    return {
      release: normalizeRelease(readJsonFile(opts.releaseFile, 'release-file'), opts.releaseFile),
      source: `файл ${opts.releaseFile}`,
    }
  }
  if (opts.eventFile) {
    const json = readJsonFile(opts.eventFile, 'event-file')
    if (!json.release) fail(`event-file ${opts.eventFile}: это не payload события release (нет поля release)`)
    return { release: json.release, source: `событие GitHub (${json.action ?? 'release'})` }
  }
  return null
}

function pickApk(assets) {
  const asset = (assets ?? []).find((item) => /\.apk$/i.test(item?.name ?? ''))
  if (!asset) return null
  return {
    name: asset.name,
    size: asset.size ?? 0,
    // browser_download_url — прямая ссылка на файл в релизе (её и открывает Telegram).
    url: asset.browser_download_url ?? null,
  }
}

function pickCoverAsset(assets) {
  const images = (assets ?? []).filter((item) => /\.(png|jpe?g|webp)$/i.test(item?.name ?? ''))
  return (
    images.find((item) => /^cover\./i.test(item.name)) ??
    images.find((item) => /^screenshot[\s_-]?1\./i.test(item.name)) ??
    images.find((item) => /^screenshot/i.test(item.name)) ??
    null
  )
}

async function fetchAssetBytes(asset, token) {
  const url = asset.url ?? asset.browser_download_url
  if (!url) return null
  // Для ассета релиза нужен Accept: application/octet-stream, иначе API вернёт JSON.
  const response = await fetch(url, { headers: ghHeaders(token, 'application/octet-stream') })
  if (!response.ok) {
    warn(`не удалось скачать ${asset.name} (HTTP ${response.status})`)
    return null
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!bytes.length) {
    warn(`файл ${asset.name} пустой`)
    return null
  }
  return bytes
}

// Основная ветка репозитория — вторая попытка найти обложку в файлах репозитория.
let cachedDefaultBranch = ''
async function defaultBranch({ repo, token }) {
  if (cachedDefaultBranch) return cachedDefaultBranch
  try {
    const response = await fetch(`${GITHUB_API}/repos/${repo}`, { headers: ghHeaders(token) })
    if (response.ok) {
      const data = await response.json()
      if (data?.default_branch) {
        cachedDefaultBranch = data.default_branch
        return cachedDefaultBranch
      }
    }
  } catch {
    // Сеть недоступна — считаем, что ветка называется main: ниже это просто
    // будет неудачная попытка чтения, обложка честно уйдёт в «нет».
  }
  cachedDefaultBranch = 'main'
  return cachedDefaultBranch
}

async function listRepoDir({ repo, ref, path, token }) {
  const url = `${GITHUB_API}/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`
  const response = await fetch(url, { headers: ghHeaders(token) })
  if (response.status === 404) return []
  if (!response.ok) {
    warn(`не удалось прочитать ${path} в репозитории (GitHub API ${response.status})`)
    return []
  }
  const data = await response.json()
  return Array.isArray(data) ? data : []
}

async function fetchRepoFile({ repo, ref, path, token }) {
  const url = `${GITHUB_API}/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`
  const response = await fetch(url, { headers: ghHeaders(token, 'application/vnd.github.raw') })
  if (response.status === 404) return null
  if (!response.ok) {
    warn(`не удалось скачать ${path} (HTTP ${response.status})`)
    return null
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  return bytes.length ? bytes : null
}

// Обложка: сначала ассет релиза (можно менять без коммитов), потом файл в
// репозитории release-assets/<тег>/ (cover.* → screenshot-1.* → screenshot*).
// Файлы передаются в Telegram байтами, поэтому сторонние хостинги не нужны.
async function resolveCover({ release, opts, token }) {
  if (opts.noCover) return { reason: 'выключено ключом --no-cover' }

  const asset = pickCoverAsset(release.assets)
  if (asset) {
    const bytes = await fetchAssetBytes(asset, token)
    if (bytes) return { bytes, filename: asset.name, source: `ассет релиза ${asset.name}` }
  }

  const dir = `${opts.assetsDir.replace(/\/+$/, '')}/${release.tag_name}`
  // Сначала ревизия самого тега (обложку можно закоммитить до создания тега),
  // затем основная ветка: файл-обложку часто добавляют уже после публикации
  // релиза, и требовать пересоздания тега было бы жестоко.
  const fallbackRef = opts.assetsRef || (await defaultBranch({ repo: opts.repo, token }))
  const refs = [release.tag_name, fallbackRef].filter((ref, index, all) => ref && all.indexOf(ref) === index)
  const reasons = []

  for (const ref of refs) {
    const entries = await listRepoDir({ repo: opts.repo, ref, path: dir, token })
    const files = entries.filter((entry) => entry.type === 'file' && /\.(png|jpe?g|webp)$/i.test(entry.name))
    if (!files.length) {
      reasons.push(`нет картинок в ${dir}/ (${ref})`)
      continue
    }
    const chosen =
      files.find((entry) => /^cover\./i.test(entry.name)) ??
      files.find((entry) => /^screenshot[\s_-]?1\./i.test(entry.name)) ??
      files.find((entry) => /^screenshot/i.test(entry.name))
    if (!chosen) {
      const names = files
        .slice(0, 3)
        .map((entry) => entry.name)
        .join(', ')
      reasons.push(
        `в ${dir}/ нет cover.png или screenshot-1.png (${ref}; найдено: ${names}${files.length > 3 ? '…' : ''})`,
      )
      continue
    }
    const bytes = await fetchRepoFile({ repo: opts.repo, ref, path: `${dir}/${chosen.name}`, token })
    if (!bytes) {
      reasons.push(`файл ${dir}/${chosen.name} не скачался (${ref})`)
      continue
    }
    const where = ref === release.tag_name ? `${dir}/${chosen.name}` : `${dir}/${chosen.name} (ветка ${ref})`
    return { bytes, filename: chosen.name, source: `${where} (репозиторий)` }
  }

  return { reason: `ассета cover.* нет, и в файлах репозитория пусто: ${reasons.join('; ')}` }
}

// ---------- Changelog: Markdown → Telegram HTML ----------

function truncate(text, max) {
  const chars = Array.from(String(text))
  if (chars.length <= max) return chars.join('')
  return `${chars.slice(0, max - 1).join('')}…`
}

// Блоки ``` ... ``` вынимаются из текста целиком: внутри них не работает
// markdown-разметка, а Telegram показывает их моноширинным блоком <pre>.
function extractFences(body) {
  const store = []
  const text = String(body).replace(/```[^\n]*\n([\s\S]*?)```/g, (match, code) => {
    store.push(`<pre>${escapeHtml(code.replace(/\n+$/, ''))}</pre>`)
    return `\u0000F${store.length - 1}\u0000`
  })
  return { text, fences: store }
}

// Инлайновый код вынимается до экранирования и разметки, иначе `*`, `_` и `<`
// внутри него ломали бы и HTML, и выделение.
function extractCodeSpans(line) {
  const store = []
  const hold = (html) => {
    store.push(html)
    return `\u0000${store.length - 1}\u0000`
  }
  const out = line.replace(/`([^`\n]+)`/g, (match, code) => hold(`<code>${escapeHtml(code)}</code>`))
  return {
    out,
    restore: (text) => text.replace(/\u0000(\d+)\u0000/g, (match, index) => store[Number(index)] ?? ''),
  }
}

function restoreFences(text, fences) {
  return text.replace(/\u0000F(\d+)\u0000/g, (match, index) => fences[Number(index)] ?? '')
}

// Markdown-выделения → HTML Telegram. Вход уже экранирован, поэтому символы
// < > & из тела релиза безопасны, а жирный/курсив/ссылки добавляются только нами.
function inlineMarkdown(escaped) {
  let out = escaped
  // Ссылки обрабатываем первыми, чтобы адрес не попал под выделения.
  out = out.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (match, label, url) => {
    const href = safeUrl(url)
    return href ? `<a href="${href}">${label}</a>` : label
  })
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
  out = out.replace(/__([^_\n]+)__/g, '<b>$1</b>')
  out = out.replace(/(^|[\s(«"„“'])\*([^*\n]+)\*/g, '$1<i>$2</i>')
  out = out.replace(/(^|[\s(«"„“'])_([^_\n]+)_/g, '$1<i>$2</i>')
  out = out.replace(/~~([^~\n]+)~~/g, '<s>$1</s>')
  return out
}

// Заголовки секций печатаем капсом, но теги и адреса ссылок не трогаем.
function uppercaseOutsideTags(html) {
  return html.replace(/(<[^>]+>)|([^<]+)/g, (match, tag, text) => tag ?? text.toUpperCase())
}

// ---------- Нарезка на сообщения с сохранением целостности HTML ----------

function tokenizeHtml(html) {
  const tokens = []
  const re = /<(\/?)([a-z][a-z0-9-]*)((?:"[^"]*"|'[^']*'|[^>])*)>/gi
  let last = 0
  let match
  const pushText = (text) => {
    for (const char of text) tokens.push({ text: char, length: char.length })
  }
  while ((match = re.exec(html)) !== null) {
    if (match.index > last) pushText(html.slice(last, match.index))
    const name = match[2].toLowerCase()
    tokens.push({
      tag: match[0],
      name,
      closing: match[1] === '/',
      selfClosing: /\/\s*>$/.test(match[0]) || name === 'br' || name === 'hr',
    })
    last = match.index + match[0].length
  }
  if (last < html.length) pushText(html.slice(last))
  return tokens
}

// Режет HTML на части длиной не больше limit, закрывая и заново открывая теги,
// чтобы Telegram не получил незакрытый <b> и не отклонил сообщение целиком.
function splitHtml(html, limit) {
  const tokens = tokenizeHtml(html)
  const parts = []
  const open = []
  let buf = ''
  let softBreak = -1
  let index = 0

  const closeAll = () =>
    open
      .map((entry) => `</${entry.name}>`)
      .reverse()
      .join('')
  const reopenAll = () => open.map((entry) => entry.tag).join('')
  const reserve = () => open.reduce((sum, entry) => sum + entry.name.length + 3, 0)

  while (index < tokens.length) {
    const token = tokens[index]

    if (token.tag) {
      if (token.closing) {
        const position = open.map((entry) => entry.name).lastIndexOf(token.name)
        if (position >= 0) open.splice(position, 1)
      } else if (!token.selfClosing) {
        open.push({ name: token.name, tag: token.tag })
      }
      buf += token.tag
      index += 1
      continue
    }

    if (buf.length + token.length + reserve() > limit) {
      if (!buf.length) {
        // Защита от бесконечного цикла, если лимит меньше одного символа.
        parts.push(token.text)
        index += 1
        continue
      }
      const cut = softBreak > 0 ? softBreak : buf.length
      parts.push(`${buf.slice(0, cut).replace(/\s+$/, '')}${closeAll()}`)
      buf = `${reopenAll()}${buf.slice(cut).replace(/^[ \t]+/, '')}`
      softBreak = -1
      continue
    }

    if (token.text === ' ' || token.text === '\n') softBreak = buf.length + token.length
    buf += token.text
    index += 1
  }

  if (buf.trim()) parts.push(`${buf}${closeAll()}`)
  return parts.length ? parts : ['']
}

// ---------- Сборка поста ----------

const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const BULLET_RE = /^\s{0,3}[-*+]\s+(.*)$/
const ORDERED_RE = /^\s{0,3}(\d{1,3})[.)]\s+(.*)$/
const HR_RE = /^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/
const QUOTE_RE = /^\s{0,3}>\s?(.*)$/
const TABLE_RE = /^\s*\|.*\|\s*$/
const IMAGE_RE = /!\[[^\]]*\]\([^)]*\)/g
const TABLE_SEPARATOR_RE = /^:?-{2,}:?$/

function renderLine(raw, fences) {
  const { out, restore } = extractCodeSpans(raw)
  const html = restore(inlineMarkdown(escapeHtml(out)))
  return restoreFences(html, fences)
}

// Разбирает тело релиза в блоки. Секции берутся как есть: заголовки «## …»
// становятся капсом, bullet-списки — строками «• …». Ничего не додумывается:
// если автор релиза написал секции иначе, они всё равно попадут в пост.
function parseChangelog({ body, version, releaseName, skipSections = [] }) {
  const { text, fences } = extractFences(String(body ?? '').replace(/\r\n?/g, '\n'))
  const lines = text.split('\n')
  const blocks = []
  const notes = { droppedImages: 0, skippedSections: [], droppedTitle: false }
  const push = (type, html, plain) => blocks.push({ type, html, plain: plain ?? collapse(stripTags(html)) })

  let skipping = false
  let skipLevel = 0

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (!line.trim()) continue
    const clean = line.replace(IMAGE_RE, () => {
      notes.droppedImages += 1
      return ''
    })
    if (!clean.trim()) continue

    const heading = clean.match(HEADING_RE)
    if (heading) {
      const level = heading[1].length
      const rendered = renderLine(heading[2], fences)
      const plain = collapse(stripTags(rendered))
      if (skipping && level <= skipLevel) skipping = false
      if (skipSections.some((needle) => plain.toLowerCase().includes(needle.toLowerCase()))) {
        skipping = true
        skipLevel = level
        notes.skippedSections.push(plain)
        continue
      }
      if (skipping) continue
      if (level === 1) {
        const lower = plain.toLowerCase()
        const duplicatesTitle =
          lower.includes(version.toLowerCase()) || lower === collapse(releaseName ?? '').toLowerCase()
        if (duplicatesTitle) {
          notes.droppedTitle = true
          continue
        }
      }
      push('heading', `<b>${uppercaseOutsideTags(rendered)}</b>`, plain)
      continue
    }

    if (skipping) continue

    if (HR_RE.test(clean)) {
      push('hr', '────────', '────────')
      continue
    }

    if (TABLE_RE.test(clean)) {
      const rows = []
      while (i < lines.length && TABLE_RE.test(lines[i])) {
        rows.push(lines[i])
        i += 1
      }
      i -= 1
      const cellsOf = (row) =>
        row
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => cell.trim())
      for (const row of rows) {
        const cells = cellsOf(row)
        if (!cells.some((cell) => cell && !TABLE_SEPARATOR_RE.test(cell))) continue
        push('table', renderLine(cells.join(' · '), fences))
      }
      continue
    }

    const bullet = clean.match(BULLET_RE)
    if (bullet) {
      push('bullet', `• ${renderLine(bullet[1], fences)}`)
      continue
    }

    const ordered = clean.match(ORDERED_RE)
    if (ordered) {
      push('bullet', `${ordered[1]}. ${renderLine(ordered[2], fences)}`)
      continue
    }

    const quote = clean.match(QUOTE_RE)
    if (quote) {
      push('text', renderLine(quote[1], fences))
      continue
    }

    push('text', renderLine(clean, fences))
  }

  return { blocks, notes }
}

// Соседние пункты списка склеиваем в один блок с переводами строк: так список
// выглядит списком, а не абзацами, и режется на сообщения по границам пунктов.
// Строки таблицы склеиваем так же, чтобы они не разъезжались пустыми строками.
function groupChunks(blocks) {
  const chunks = []
  for (const block of blocks) {
    const last = chunks[chunks.length - 1]
    const mergeable = block.type === 'bullet' || block.type === 'table'
    if (mergeable && last?.type === block.type) last.html += `\n${block.html}`
    else chunks.push({ type: block.type, html: block.html })
  }
  return chunks
}

function packHtml({ header, chunks, footer, limit }) {
  const parts = []
  let buf = header ?? ''
  const flush = () => {
    if (buf) parts.push(buf)
    buf = ''
  }
  const add = (piece) => {
    if (!piece) return
    const candidate = buf ? `${buf}\n\n${piece}` : piece
    if (candidate.length <= limit) {
      buf = candidate
      return
    }
    // Режем вместе с накопленным куском: так заголовок поста не остаётся один
    // в сообщении, а идёт вместе с началом длинного раздела.
    const pieces = splitHtml(candidate, limit)
    for (let k = 0; k < pieces.length - 1; k += 1) parts.push(pieces[k])
    buf = pieces[pieces.length - 1] ?? ''
  }

  for (const chunk of chunks) add(chunk.html)
  if (footer) add(footer)
  flush()
  return parts.length ? parts : [header ?? '']
}

// Короткая версия поста для подписи к обложке: у подписи лимит 1024 символа.
function buildShortCaption({ title, version, blocks, limit }) {
  const bullets = blocks
    .filter((block) => block.type === 'bullet')
    .map((block) => truncate(collapse(block.plain).replace(/^(?:•\s*|\d{1,3}[.)]\s+)/, ''), 90))
  const head = `${title}\n\n✨ Новая версия уже доступна!`
  const variants = [bullets.slice(0, 4), bullets.slice(0, 2), [`📱 Версия ${version}`], []]
  for (const tail of variants) {
    const caption = tail.length ? `${head}\n\n${tail.join('\n')}` : head
    if (caption.length <= limit) return caption
  }
  return truncate(title, limit)
}

function buildButtons({ apk, releaseUrl }) {
  const rows = []
  // Если APK в релизе нет — кнопка скачивания не должна врать: ведём в релиз.
  if (apk?.url) rows.push([{ text: '📱 Скачать APK', url: apk.url }])
  else if (releaseUrl) rows.push([{ text: '📦 GitHub Release', url: releaseUrl }])
  if (releaseUrl) rows.push([{ text: '📋 Подробнее', url: releaseUrl }])
  return rows.length ? { inline_keyboard: rows } : undefined
}

function buildPost({ release, opts, cover, apk }) {
  const version = String(release.tag_name ?? '').trim().replace(/^v/i, '')
  const title = `${release.prerelease ? '🧪' : '🚀'} SelfCRM ${version}`
  const footer = `📱 Версия ${version}`
  const buttons = buildButtons({ apk, releaseUrl: release.html_url })
  const { blocks, notes } = parseChangelog({
    body: release.body,
    version,
    releaseName: release.name,
    skipSections: opts.skipSections,
  })
  const chunks = groupChunks(blocks)
  const messages = []

  if (cover?.bytes) {
    const asCaption = packHtml({ header: title, chunks, footer, limit: opts.maxCaption })
    if (asCaption.length === 1) {
      messages.push({ kind: 'photo', caption: asCaption[0], buttons })
    } else {
      // Вся простыня в подпись не влезла: короткая версия на обложке с кнопками,
      // дальше полный changelog отдельными сообщениями (без потери текста).
      messages.push({
        kind: 'photo',
        caption: buildShortCaption({ title, version, blocks, limit: opts.maxCaption }),
        buttons,
      })
      for (const part of packHtml({ header: title, chunks, footer, limit: opts.maxMessage })) {
        messages.push({ kind: 'text', text: part })
      }
    }
  } else {
    const parts = packHtml({ header: title, chunks, footer, limit: opts.maxMessage })
    parts.forEach((part, index) => {
      messages.push({
        kind: 'text',
        text: part,
        buttons: index === parts.length - 1 ? buttons : undefined,
      })
    })
  }

  return { version, title, messages, notes, blocks }
}

// ---------- Telegram Bot API ----------

function formatSize(bytes) {
  if (!bytes) return '0 Б'
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`
}

function guessImageType(name) {
  const lower = String(name).toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'image/png'
}

// Адрес запроса содержит токен, поэтому в логи он не попадает никогда: ошибки
// формируются только из ответа Telegram (и маскируются в maskSecrets).
async function tgFetch(method, token, init) {
  let response
  try {
    response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, init)
  } catch (error) {
    fail(`не удалось связаться с Telegram (${method}): ${error.message}`)
  }

  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }

  if (!json || !json.ok) {
    const description = json?.description ?? truncate(text, 300)
    const code = json?.error_code ?? response.status
    const error = new Error(`${method}: ${code} — ${description}`)
    error.telegram = true
    error.telegramCode = code
    throw error
  }

  return json.result
}

function tgJson(method, payload, token) {
  return tgFetch(method, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

function tgPhoto({ token, chatId, bytes, filename, caption, buttons }) {
  const form = new FormData()
  form.set('chat_id', chatId)
  form.set('parse_mode', 'HTML')
  form.set('photo', new Blob([bytes], { type: guessImageType(filename) }), filename)
  if (caption) form.set('caption', caption)
  if (buttons) form.set('reply_markup', JSON.stringify(buttons))
  return tgFetch('sendPhoto', token, { method: 'POST', body: form })
}

// ---------- Защита от повторной публикации ----------

// GitHub Release — разовое событие, но повторный запуск (retry) workflow мог бы
// отправить пост второй раз. Поэтому перед автоматической публикацией смотрим,
// не было ли уже успешного запуска этого workflow с тем же тегом: имя запуска
// формируется как «Telegram release <тег>» (см. run-name в telegram-release.yml).
async function findPreviousRun({ repo, tag, token, runId }) {
  if (!token || !runId) {
    return { checked: false, reason: 'нет GH_TOKEN/GH_RUN_ID — проверка доступна только в Actions' }
  }
  const url = `${GITHUB_API}/repos/${repo}/actions/workflows/telegram-release.yml/runs?event=release&per_page=100`
  let response
  try {
    response = await fetch(url, { headers: ghHeaders(token) })
  } catch (error) {
    return { checked: false, reason: `GitHub API недоступен: ${error.message}` }
  }
  if (!response.ok) return { checked: false, reason: `GitHub API вернул ${response.status}` }

  const data = await response.json()
  const wanted = `telegram release ${tag}`.toLowerCase()
  const run = (data.workflow_runs ?? []).find(
    (item) =>
      String(item.id) !== String(runId) &&
      item.conclusion === 'success' &&
      String(item.name ?? '')
        .toLowerCase()
        .includes(wanted),
  )
  return { checked: true, run: run ?? null }
}

// ---------- Сухой прогон ----------

function printDryRun({ opts, release, apk, cover, post }) {
  const line = '─'.repeat(66)
  const headings = post.blocks.filter((block) => block.type === 'heading').map((block) => block.plain)
  console.log(`\n${line}`)
  console.log('DRY-RUN: сообщение сформировано, в Telegram ничего не отправлено')
  console.log(line)
  console.log(`Release title : ${release.name ?? '—'}`)
  console.log(`Version       : ${post.version}`)
  console.log(`Release URL   : ${release.html_url ?? '—'}`)
  console.log(`APK URL       : ${apk?.url ?? '— (нет APK: кнопка ведёт на страницу релиза)'}`)
  console.log(`Cover         : ${cover.bytes ? cover.source : `нет — ${cover.reason}`}`)
  console.log(`Секции        : ${headings.length ? headings.join(' | ') : '—'}`)
  console.log(`Сообщений     : ${post.messages.length}`)

  post.messages.forEach((message, index) => {
    const text = message.kind === 'photo' ? message.caption : message.text
    const limit = message.kind === 'photo' ? opts.maxCaption : opts.maxMessage
    const kind = message.kind === 'photo' ? 'sendPhoto (подпись)' : 'sendMessage'
    console.log(`\n${line}`)
    console.log(`Сообщение ${index + 1}/${post.messages.length}: ${kind} — ${text.length}/${limit} символов`)
    console.log(`Кнопки: ${message.buttons ? JSON.stringify(message.buttons.inline_keyboard) : 'нет'}`)
    console.log(line)
    console.log(text)
  })
  console.log(`\n${line}`)
  console.log('Конец сухого прогона. Для отправки запустите без --dry-run (нужны секреты).')
  console.log(line)
}

// ---------- main ----------

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    console.log(USAGE)
    return 0
  }
  if (!Number.isFinite(opts.maxMessage) || opts.maxMessage < 64) fail('--max-message должен быть числом ≥ 64')
  if (!Number.isFinite(opts.maxCaption) || opts.maxCaption < 64) fail('--max-caption должен быть числом ≥ 64')

  secrets.token = process.env.TELEGRAM_BOT_TOKEN ?? ''
  secrets.channel = process.env.TELEGRAM_CHANNEL_ID ?? ''
  const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || ''
  const runId = process.env.GH_RUN_ID || process.env.GITHUB_RUN_ID || ''

  // 1. Данные релиза: событие GitHub, файл-фикстура или GitHub API по тегу.
  let release = null
  let source = ''
  const fromFile = loadRelease(opts)
  if (fromFile) {
    release = fromFile.release
    source = fromFile.source
  } else {
    release = await fetchRelease({ repo: opts.repo, tag: opts.tag, token: ghToken })
    source = `GitHub API — ${opts.repo}${opts.tag ? `, тег ${opts.tag}` : ', последний опубликованный релиз'}`
  }

  // 2. APK и обложка.
  const apk = pickApk(release.assets)
  const cover = await resolveCover({ release, opts, token: ghToken })

  // 3. Текст поста.
  const post = buildPost({ release, opts, cover, apk })

  info(`Источник данных : ${source}`)
  info(`Release         : ${release.name ?? release.tag_name}`)
  info(`Version         : ${post.version}`)
  info(`Release URL     : ${release.html_url ?? '—'}`)
  info(`APK             : ${apk ? `${apk.name} (${formatSize(apk.size)}) → ${apk.url}` : 'не найден в релизе'}`)
  info(`Cover           : ${cover.bytes ? `${cover.source}, ${formatSize(cover.bytes.length)}` : 'нет'}`)
  info(`Сообщений       : ${post.messages.length}`)

  if (!apk) {
    const message = `в релизе ${release.tag_name} нет APK: кнопка «Скачать APK» заменена на ссылку на релиз`
    if (opts.requireApk) fail(message)
    warn(message)
  }
  if (cover.reason) warn(`обложка не отправляется: ${cover.reason}`)
  if (post.notes.droppedTitle) info('заголовок H1 из тела релиза не дублируется в посте')
  if (post.notes.droppedImages) {
    info(`картинок в теле: ${post.notes.droppedImages} — в Telegram не публикуются (обложка задаётся отдельно)`)
  }
  if (post.notes.skippedSections.length) {
    warn(`секции исключены ключом --skip-sections: ${post.notes.skippedSections.join('; ')}`)
  }

  // 4. Сухой прогон: печатаем всё, что ушло бы в канал, и останавливаемся.
  if (opts.dryRun) {
    printDryRun({ opts, release, apk, cover, post })
    return 0
  }

  // 5. Реальная отправка: без секретов ничего не делаем.
  if (!secrets.token || !secrets.channel) {
    const error = new Error(
      'не заданы секреты TELEGRAM_BOT_TOKEN и/или TELEGRAM_CHANNEL_ID ' +
        '(Settings → Secrets and variables → Actions → New repository secret)',
    )
    error.fatal = true
    error.exitCode = 2
    throw error
  }

  if (opts.eventFile) {
    const previous = await findPreviousRun({ repo: opts.repo, tag: release.tag_name, token: ghToken, runId })
    if (previous.checked && previous.run) {
      info(`Тег ${release.tag_name} уже публиковался (запуск ${previous.run.id}) — повтор не нужен.`)
      return 0
    }
    if (!previous.checked) warn(`проверка повторной публикации недоступна: ${previous.reason}`)
    else info(`Проверка повторной публикации: успешных отправок для ${release.tag_name} не было.`)
  }

  // 6. Проверяем доступ до первой отправки: иначе в канале могла бы остаться
  // «половина» поста, если токен или права неверные.
  let me
  try {
    me = await tgJson('getMe', {}, secrets.token)
  } catch (error) {
    error.fatal = true
    error.exitCode = 2
    error.hint = 'проверьте секрет TELEGRAM_BOT_TOKEN: токен выдаёт @BotFather (/mybots → API Token)'
    throw error
  }
  try {
    const chat = await tgJson('getChat', { chat_id: secrets.channel }, secrets.token)
    info(`Канал           : ${chat.title ?? chat.username ?? maskChannel(secrets.channel)} (${chat.type})`)
  } catch (error) {
    error.fatal = true
    error.exitCode = 2
    error.hint =
      'проверьте секрет TELEGRAM_CHANNEL_ID (@username канала или -100… для приватного) ' +
      'и права бота: канал → Администраторы → «Публикация сообщений»'
    throw error
  }
  info(`Бот             : @${me.username ?? '—'} (id ${me.id})`)
  info('Публикую в Telegram…')

  for (const [index, message] of post.messages.entries()) {
    const position = `${index + 1}/${post.messages.length}`
    if (message.kind === 'photo') {
      const result = await tgPhoto({
        token: secrets.token,
        chatId: secrets.channel,
        bytes: cover.bytes,
        filename: cover.filename,
        caption: message.caption,
        buttons: message.buttons,
      })
      info(`[${position}] sendPhoto (${cover.filename}) → message_id ${result.message_id}`)
    } else {
      const payload = {
        chat_id: secrets.channel,
        text: message.text,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      }
      if (message.buttons) payload.reply_markup = message.buttons
      const result = await tgJson('sendMessage', payload, secrets.token)
      info(`[${position}] sendMessage (${message.text.length} символов) → message_id ${result.message_id}`)
    }
  }

  info(`Готово: релиз ${release.tag_name} опубликован в Telegram (${post.messages.length} сообщ.).`)
  return 0
}

// Скрипт можно и запускать напрямую, и импортировать (для проверок): main()
// выполняется только при прямом запуске.
const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false

if (invokedDirectly) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      if (error.telegram) console.error(maskSecrets(`❌ Ошибка Telegram: ${error.message}`))
      else console.error(maskSecrets(`❌ ${error.message}`))
      if (error.hint) console.error(maskSecrets(`   ${error.hint}`))
      if (!error.fatal && !error.telegram) console.error(error.stack)
      process.exitCode = error.exitCode ?? 1
    })
}

// Экспорт нужен для проверок (см. dry-run и scripts/fixtures): при обычном
// запуске скрипт работает как CLI и эти экспорты ни на что не влияют.
export { buildPost, groupChunks, packHtml, parseChangelog, splitHtml }