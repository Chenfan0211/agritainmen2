// 原生微信小程序构建：TS -> CommonJS JS，SCSS -> WXSS，并复制 WXML/JSON/静态资源。
// 用法: node scripts/build-native-mp.mjs <store|supplier|user> --mode dev|build [--watch]
//
// 产物写入策略：先在 <产物目录>.tmp-<pid> 完整构建，再整体替换目标目录（旧目录先改名再删除）。
// 目标目录被微信开发者工具占用时直接失败并提示先关闭项目，绝不覆盖写入（避免残留旧文件）。
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { transformSync } from 'esbuild'
import ts from 'typescript'
import * as sass from 'sass'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const APPS = ['store', 'supplier', 'user']
const MODES = ['dev', 'build']
const LOCKED_DIRECTORY_CODES = ['EPERM', 'EBUSY', 'ENOTEMPTY', 'EACCES']

export function parseNativeBuildArgs(argv) {
  const parsed = { app: '', mode: 'dev', watch: false, errors: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--mode') {
      parsed.mode = String(argv[index + 1] || '')
      index += 1
    } else if (token === '--watch') parsed.watch = true
    else if (token.startsWith('-')) parsed.errors.push(`未知参数: ${token}`)
    else if (!parsed.app) parsed.app = token
    else parsed.errors.push(`只允许指定一个端: ${token}`)
  }
  if (!APPS.includes(parsed.app)) parsed.errors.push(`未知端: ${parsed.app || '(空)'}`)
  if (!MODES.includes(parsed.mode)) parsed.errors.push(`未知模式: ${parsed.mode || '(空)'}`)
  return parsed
}

export function resolveNativeOutput(root, app, mode) {
  if (!APPS.includes(app)) throw new Error(`未知端: ${app || '(空)'}`)
  if (!MODES.includes(mode)) throw new Error(`未知模式: ${mode || '(空)'}`)
  return resolve(root, 'apps', app, 'dist', mode, 'mp-weixin')
}

export function rewriteCommonJsImports(source, sharedPrefix) {
  return source
    .replace(/require\((["'])@agritainment\/shared\1\)/g, `require(${JSON.stringify(sharedPrefix + 'index.js')})`)
    .replace(/require\((["'])(\.\.?\/[^"']+)\1\)/g, (_match, quote, request) => {
      if (/\.[a-z0-9]+$/i.test(request)) return `require(${quote}${request}${quote})`
      return `require(${quote}${request}.js${quote})`
    })
}

/** 目录被占用时的统一提示：不做降级覆盖，直接让构建失败。 */
export function lockedDirectoryMessage(outputDir) {
  return [
    `构建目录被占用，无法整体替换：${outputDir}`,
    '请先关闭微信开发者工具中打开的项目（或退出开发者工具）后重试；本脚本不再退回覆盖写入，避免产物残留旧文件。'
  ].join('\n')
}

/** 单次改名；命中占用类错误码时给出可执行的提示。 */
function renameOrExplain(from, to, outputDir, rename = renameSync) {
  try {
    rename(from, to)
  } catch (error) {
    if (LOCKED_DIRECTORY_CODES.includes(error?.code)) throw new Error(lockedDirectoryMessage(outputDir))
    throw error
  }
}

/**
 * 原子替换产物目录：旧目录先改名备份，新目录整体顶上，失败则回滚。
 * Windows 下目标目录被开发者工具占用会在改名时抛 EBUSY/EPERM，此时构建直接失败。
 */
export function replaceDirectoryAtomically(stagingDir, outputDir, options = {}) {
  const rename = options.rename || renameSync
  const backupDir = `${outputDir}.backup-${process.pid}-${Date.now()}`
  const hadOutput = existsSync(outputDir)
  if (hadOutput) renameOrExplain(outputDir, backupDir, outputDir, rename)
  try {
    renameOrExplain(stagingDir, outputDir, outputDir, rename)
  } catch (error) {
    if (hadOutput) {
      try {
        rename(backupDir, outputDir)
      } catch {
        // 回滚失败时保留备份目录，交给调用方报错，不掩盖原始错误。
      }
    }
    throw error
  }
  if (hadOutput) rmSync(backupDir, { recursive: true, force: true })
}

function walkFiles(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(path, out)
    else out.push(path)
  }
  return out
}

function stripPlatformConditionals(source, mode) {
  if (mode !== 'dev' && mode !== 'build') return source
  return source
    .replace(/\/\* #ifdef H5 \*\/[\s\S]*?\/\* #endif \*\//g, '')
    .replace(/\/\/ #ifdef H5[^\n]*\n[\s\S]*?\/\/ #endif/g, '')
    .replace(/\/\* #ifdef MP-WEIXIN \*\//g, '')
    .replace(/\/\/ #ifdef MP-WEIXIN[^\n]*\n/g, '')
    .replace(/\/\* #endif \*\//g, '')
    .replace(/\/\/ #endif/g, '')
}

function transpile(file, source, mode) {
  const result = ts.transpileModule(stripPlatformConditionals(source, mode), {
    fileName: file,
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true,
      importHelpers: false,
      sourceMap: false,
      inlineSourceMap: false,
      removeComments: true,
      isolatedModules: true
    },
    reportDiagnostics: false
  })
  return transformSync(result.outputText, {
    loader: 'js',
    format: 'cjs',
    target: 'es2020',
    minify: true,
    legalComments: 'none'
  }).code
}

function sharedRequirePrefix(outputFile, outputDir) {
  const depth = relative(dirname(outputFile), outputDir).split(/[\\/]/).filter(Boolean).length
  return depth === 0 ? './shared/' : '../'.repeat(depth) + 'shared/'
}

function writeCompiledTs(sourceDir, outputDir, sharedModule, mode) {
  for (const file of walkFiles(sourceDir)) {
    const extension = extname(file).toLowerCase()
    if (extension !== '.ts') continue
    if (/\.test\.ts$|\.d\.ts$/.test(file)) continue
    const target = resolve(outputDir, relative(sourceDir, file)).replace(/\.ts$/, '.js')
    mkdirSync(dirname(target), { recursive: true })
    const prefix = sharedModule ? './' : sharedRequirePrefix(target, outputDir)
    writeFileSync(target, rewriteCommonJsImports(transpile(file, readFileSync(file, 'utf8'), mode), prefix), 'utf8')
  }
}

function copyAssets(sourceDir, outputDir) {
  for (const file of walkFiles(sourceDir)) {
    const extension = extname(file).toLowerCase()
    if (extension === '.ts' || extension === '.scss') continue
    if (['.js', '.map'].includes(extension)) continue
    const target = resolve(outputDir, relative(sourceDir, file))
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, readFileSync(file))
  }
}

/** SCSS -> WXSS，并按传入的 root 复制共享设计令牌、重写为相对 WXSS 引用。 */
export function compileStyles(sourceDir, outputDir, mode, root) {
  const loadPaths = [sourceDir, resolve(root, 'packages/ui/src')]
  const tokenSource = resolve(root, 'packages/ui/src/design-tokens.css')
  const tokenTarget = resolve(outputDir, 'design-tokens.wxss')
  if (existsSync(tokenSource)) {
    mkdirSync(dirname(tokenTarget), { recursive: true })
    writeFileSync(tokenTarget, readFileSync(tokenSource))
  }
  for (const file of walkFiles(sourceDir)) {
    if (extname(file).toLowerCase() !== '.scss') continue
    const target = resolve(outputDir, relative(sourceDir, file)).replace(/\.scss$/, '.wxss')
    mkdirSync(dirname(target), { recursive: true })
    const result = sass.compileString(stripPlatformConditionals(readFileSync(file, 'utf8'), mode), { style: 'expanded', loadPaths, url: pathToFileURL(file) })
    const tokenImport = relative(dirname(target), tokenTarget).replace(/\\/g, '/')
    const css = result.css.replace(/@import\s+(["'])[^"']*design-tokens\.css\1\s*;?/g, `@import "${tokenImport}";`)
    writeFileSync(target, css, 'utf8')
  }
}

export function buildNativeApp({ root = ROOT, app, mode = 'dev' } = {}) {
  const sourceDir = resolve(root, 'apps', app, 'src')
  const outputDir = resolveNativeOutput(root, app, mode)
  if (!existsSync(sourceDir)) throw new Error(`缺少原生源码目录: ${sourceDir}`)
  const stagingDir = `${outputDir}.tmp-${process.pid}`
  rmSync(stagingDir, { recursive: true, force: true })
  mkdirSync(stagingDir, { recursive: true })
  try {
    const sharedSource = resolve(root, 'packages/shared/src')
    writeCompiledTs(sharedSource, resolve(stagingDir, 'shared'), true, mode)
    writeCompiledTs(sourceDir, stagingDir, false, mode)
    compileStyles(sourceDir, stagingDir, mode, root)
    copyAssets(sourceDir, stagingDir)

    if (!existsSync(resolve(stagingDir, 'app.json'))) throw new Error(`缺少 app.json: ${sourceDir}`)
    if (!existsSync(resolve(stagingDir, 'app.js'))) throw new Error(`缺少 app.ts: ${sourceDir}`)

    replaceDirectoryAtomically(stagingDir, outputDir)
  } catch (error) {
    rmSync(stagingDir, { recursive: true, force: true })
    throw error
  }
  return { sourceDir, outputDir, files: walkFiles(outputDir).length }
}

async function watchNativeApp(options) {
  let running = false
  let pending = false
  const rebuild = () => {
    if (running) { pending = true; return }
    running = true
    try {
      const result = buildNativeApp(options)
      console.log(`[${options.app}] 构建完成: ${result.outputDir}`)
    } catch (error) {
      console.error(error instanceof Error ? error.message : error)
    } finally {
      running = false
      if (pending) { pending = false; rebuild() }
    }
  }
  rebuild()
  const { watch } = await import('node:fs')
  const watchers = [
    watch(resolve(options.root, 'apps', options.app, 'src'), { recursive: true }, rebuild),
    watch(resolve(options.root, 'packages/shared/src'), { recursive: true }, rebuild)
  ]
  console.log(`[${options.app}] 正在监听原生源码变化...`)
  return watchers
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isCli) {
  const options = parseNativeBuildArgs(process.argv.slice(2))
  if (options.errors.length) {
    for (const error of options.errors) console.error(error)
    console.error('用法: node scripts/build-native-mp.mjs <store|supplier|user> --mode dev|build [--watch]')
    process.exit(2)
  }
  if (options.watch) await watchNativeApp(options)
  else {
    try {
      const result = buildNativeApp(options)
      console.log(`[${options.app}] 构建完成: ${result.outputDir} (${result.files} files)`)
    } catch (error) {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    }
  }
}
