#!/usr/bin/env node
// Поднимает версию приложения сразу во всех местах, где она хранится:
//   package.json             — поле version;
//   src/version.ts           — APP_VERSION (экран настроек и проверка обновлений);
//   android/app/build.gradle — versionCode и versionName.
//
// Использование:
//   npm run bump -- 1.0.9            версия, versionCode увеличится на 1
//   npm run bump -- 1.0.9 --code 20  явно указать versionCode
//
// Дальше по порядку: npm run typecheck && npm test && npm run build,
// npx cap sync android и сборка подписанного APK (см. ANDROID.md).

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGE_JSON = join(ROOT, 'package.json')
const VERSION_TS = join(ROOT, 'src/version.ts')
const BUILD_GRADLE = join(ROOT, 'android/app/build.gradle')
const SEMVER = /^\d+\.\d+\.\d+$/

function fail(message) {
  console.error(`Ошибка: ${message}`)
  process.exit(1)
}

function parseArgs(argv) {
  const args = { version: null, code: null }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--code' || arg === '-c') {
      args.code = argv[i + 1]
      i += 1
    } else if (arg.startsWith('--code=')) {
      args.code = arg.slice('--code='.length)
    } else if (!args.version) {
      args.version = arg
    }
  }
  return args
}

const { version, code } = parseArgs(process.argv.slice(2))
if (!version) fail('укажите новую версию, например: npm run bump -- 1.0.9')
if (!SEMVER.test(version)) fail(`версия «${version}» должна быть в формате X.Y.Z`)

const pkgRaw = readFileSync(PACKAGE_JSON, 'utf8')
const oldVersion = JSON.parse(pkgRaw).version
if (oldVersion === version) fail(`версия ${version} уже установлена`)

const nextPkg = pkgRaw.replace(/"version":\s*"[^"]+"/, `"version": "${version}"`)
if (nextPkg === pkgRaw) fail('не удалось найти поле version в package.json')

const versionTsRaw = readFileSync(VERSION_TS, 'utf8')
const nextVersionTs = versionTsRaw.replace(/(APP_VERSION\s*=\s*')[\d.]+(')/, `$1${version}$2`)
if (nextVersionTs === versionTsRaw) fail('не удалось найти APP_VERSION в src/version.ts')

const gradleRaw = readFileSync(BUILD_GRADLE, 'utf8')
const codeMatch = gradleRaw.match(/versionCode\s+(\d+)/)
if (!codeMatch) fail('не удалось найти versionCode в android/app/build.gradle')

const currentCode = Number(codeMatch[1])
const nextCode = code === null ? currentCode + 1 : Number(code)
if (!Number.isInteger(nextCode) || nextCode <= 0) fail('versionCode должен быть целым положительным числом')
if (nextCode <= currentCode) fail(`versionCode ${nextCode} должен быть больше текущего ${currentCode}`)

const nextGradle = gradleRaw
  .replace(/versionCode\s+\d+/, `versionCode ${nextCode}`)
  .replace(/versionName\s+"[^"]+"/, `versionName "${version}"`)
if (nextGradle === gradleRaw) fail('не удалось обновить версию в android/app/build.gradle')

writeFileSync(PACKAGE_JSON, nextPkg)
writeFileSync(VERSION_TS, nextVersionTs)
writeFileSync(BUILD_GRADLE, nextGradle)

console.log(`Версия обновлена: ${oldVersion} → ${version} (versionCode ${currentCode} → ${nextCode})`)
console.log('Изменены: package.json, src/version.ts, android/app/build.gradle')
console.log('Дальше: npm run typecheck && npm test && npm run build && npx cap sync android')
