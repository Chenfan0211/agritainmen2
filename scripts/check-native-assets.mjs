// 三端原生小程序「图片与产物」门禁：
//   ① 页面 pages/{wxml,json} 存在，usingComponents 目标可解析（/ 开头 → 源根，其余 → 页面目录）
//   ② 页面里每个 <image> 都必须绑定 binderror；整端图片组件数 > 0
//   ③ 源码引用的 /static/** 资源必须存在；.jpg/.jpeg 必须是合法 JPEG
//   ④ 源码不得再引用 .webp；构建产物不得含 .webp/.vue/.scss/.test.js/manifest.json，也不得残留 .tmp-/.backup- 临时目录
// 用法: node scripts/check-native-assets.mjs  （产物检查需先 pnpm build）
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

/** 三端纯微信小程序。 */
const NATIVE_ASSET_APPS = ['store', 'supplier', 'user']

/** 小程序原生图片标签（business-image 是业务组件，自带 binderror）。 */
const RAW_IMAGE_TAG = /<image(?=[\s/>])[^>]*>/g
const BUSINESS_IMAGE_TAG = /<business-image(?=[\s/>])/g
const STATIC_REF = /["'`](\/static\/[^"'`\s]+\.(?:jpg|jpeg|png|svg))["'`]/g

/** 产物中禁止出现的文件（源码/测试/旧 uni-app 描述文件）。 */
const FORBIDDEN_BUILD_FILE = /\.(?:webp|vue|scss)$|\.test\.js$/
const FORBIDDEN_BUILD_NAME = 'manifest.json'
const TEMP_ARTIFACT_DIR = /\.(?:tmp-|backup-)/

/** 页面模板里的原生 <image> 与 business-image 数量。 */
export function countImageSlots(template) {
  return {
    rawImages: (template.match(RAW_IMAGE_TAG) || []).length,
    businessImages: (template.match(BUSINESS_IMAGE_TAG) || []).length
  }
}

/** 未绑定 binderror 的 <image> 标签（返回标签片段，便于定位）。 */
export function unboundImageTags(template) {
  return (template.match(RAW_IMAGE_TAG) || [])
    .filter((tag) => !/binderror\s*=/.test(tag))
    .map((tag) => tag.replace(/\s+/g, ' ').slice(0, 120))
}

/** 解析 usingComponents 目标：/ 开头相对源根，其余相对当前页面/组件目录。 */
export function resolveComponentTarget(ownerFile, srcRoot, target) {
  return target.startsWith('/') ? resolve(srcRoot, target.slice(1)) : resolve(dirname(ownerFile), target)
}

/** 组件实现与模板/配置是否齐全。 */
export function missingComponentFiles(usingComponents, ownerFile, srcRoot, exists = existsSync) {
  const failures = []
  for (const [tag, target] of Object.entries(usingComponents || {})) {
    const base = resolveComponentTarget(ownerFile, srcRoot, String(target))
    if (!exists(`${base}.ts`) && !exists(`${base}.js`)) failures.push(`${tag} 缺少实现文件：${target}`)
    if (!exists(`${base}.wxml`)) failures.push(`${tag} 缺少 wxml：${target}`)
    if (!exists(`${base}.json`)) failures.push(`${tag} 缺少 json：${target}`)
  }
  return failures
}

/** 从源码文本中收集静态图片引用（忽略运行时拼接的 {{...}} 路径）。 */
export function collectStaticRefs(sources) {
  const refs = new Set()
  for (const source of sources) {
    for (const match of source.matchAll(STATIC_REF)) {
      if (match[1].includes('{{') || match[1].includes('$' + '{')) continue
      refs.add(match[1])
    }
  }
  return [...refs].sort()
}

/** 静态引用缺失 / JPEG 非法。 */
export function validateStaticRefs(refs, readBytes) {
  const failures = []
  for (const ref of refs) {
    const bytes = readBytes(ref)
    if (!bytes) {
      failures.push(`静态资源缺失：${ref}`)
      continue
    }
    if (/\.jpe?g$/i.test(ref) && !(bytes[0] === 0xff && bytes[1] === 0xd8)) failures.push(`不是合法 JPEG：${ref}`)
  }
  return failures
}

/** 产物文件与目录名违规项。 */
export function buildArtifactViolations(files) {
  const failures = []
  for (const file of files) {
    const normalized = file.replace(/\\/g, '/')
    if (FORBIDDEN_BUILD_FILE.test(normalized)) failures.push(`产物含禁止文件：${normalized}`)
    else if (basename(normalized) === FORBIDDEN_BUILD_NAME) failures.push(`产物含禁止文件：${normalized}`)
  }
  return failures
}

/** 产物目录旁的临时/备份目录残留。 */
export function tempArtifactViolations(names) {
  return names.filter((name) => TEMP_ARTIFACT_DIR.test(name)).map((name) => `残留临时目录：${name}`)
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}

/** 审计单端：页面/组件解析、图片标签、静态资源与构建产物。 */
export function auditNativeApp(app, basePath = ROOT) {
  const failures = []
  const srcRoot = join(basePath, 'apps', app, 'src')
  const distRoot = join(basePath, 'apps', app, 'dist', 'build', 'mp-weixin')
  const appJsonPath = join(srcRoot, 'app.json')
  if (!existsSync(appJsonPath)) return { failures: [`缺少 app.json：apps/${app}/src/app.json`], summary: null }
  const appJson = JSON.parse(readFileSync(appJsonPath, 'utf8'))
  const pages = Array.isArray(appJson.pages) ? appJson.pages : []
  if (!pages.length) failures.push(`app.json 未声明页面：apps/${app}/src/app.json`)

  let imageSlots = 0
  for (const page of pages) {
    const wxml = join(srcRoot, `${page}.wxml`)
    const json = join(srcRoot, `${page}.json`)
    if (!existsSync(wxml) || !existsSync(json)) {
      failures.push(`页面文件缺失：${page}.wxml / ${page}.json`)
      continue
    }
    const template = readFileSync(wxml, 'utf8')
    const config = JSON.parse(readFileSync(json, 'utf8'))
    const slots = countImageSlots(template)
    imageSlots += slots.rawImages + slots.businessImages
    for (const tag of unboundImageTags(template)) failures.push(`[${page}] <image> 未绑定 binderror：${tag}`)
    for (const item of missingComponentFiles(config.usingComponents, json, srcRoot)) failures.push(`[${page}] ${item}`)
  }
  if (imageSlots === 0) failures.push(`apps/${app} 页面没有任何图片组件（<image> / <business-image>）`)

  const sourceFiles = walk(srcRoot).filter((file) => ['.ts', '.wxml', '.json', '.scss', '.wxss'].includes(extname(file)))
  const sources = sourceFiles.map((file) => readFileSync(file, 'utf8'))
  for (const [index, source] of sources.entries()) {
    if (source.includes('.webp')) failures.push(`源码仍引用 .webp：${sourceFiles[index].slice(basePath.length + 1).replace(/\\/g, '/')}`)
  }
  const refs = collectStaticRefs(sources)
  failures.push(...validateStaticRefs(refs, (ref) => {
    const file = join(srcRoot, ref.replace(/^\//, ''))
    return existsSync(file) && statSync(file).isFile() ? readFileSync(file) : null
  }))

  if (!existsSync(distRoot)) failures.push(`缺少构建产物（请先 pnpm build）：apps/${app}/dist/build/mp-weixin`)
  else {
    failures.push(...buildArtifactViolations(walk(distRoot)))
    failures.push(...tempArtifactViolations(readdirSync(join(basePath, 'apps', app, 'dist', 'build'))))
  }

  const summary = `pages ${pages.length}，图片组件 ${imageSlots}，静态引用 ${refs.length}`
  return { failures, summary }
}

/** 三端入口。 */
export function auditNativeAssets(basePath = ROOT) {
  const failures = []
  const summaries = []
  for (const app of NATIVE_ASSET_APPS) {
    const { failures: appFailures, summary } = auditNativeApp(app, basePath)
    failures.push(...appFailures.map((item) => `[${app}] ${item}`))
    if (summary) summaries.push(`${app}(${summary})`)
  }
  return { failures, summary: summaries.join('，') }
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isCli) {
  const { failures, summary } = auditNativeAssets()
  if (failures.length) {
    console.error(`[native-assets] 图片与产物门禁未通过，共 ${failures.length} 项：`)
    for (const item of failures) console.error('  - ' + item)
    process.exitCode = 1
  } else {
    console.log(`[native-assets] passed: ${summary}`)
  }
}
