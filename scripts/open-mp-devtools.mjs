// 打开三端微信小程序构建产物，避免把 uni-app 源码目录误当成开发者工具项目。
// 用法: node scripts/open-mp-devtools.mjs <store|supplier|user> [--mode dev|build] [--dry-run]
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const APPS = ['store', 'supplier', 'user']
const MODES = ['dev', 'build']
const WINDOWS_CLI_PATHS = [
  'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat',
  'C:\\Program Files\\Tencent\\微信web开发者工具\\cli.bat'
]
const MACOS_CLI_PATH = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'

/** 解析命令行参数；错误留给 CLI 入口统一打印。 */
export function parseMpOpenArgs(argv) {
  const parsed = { app: '', mode: 'dev', dryRun: false, errors: [] }
  const positional = []
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--mode') {
      parsed.mode = String(argv[index + 1] || '')
      index += 1
    } else if (token === '--dry-run') {
      parsed.dryRun = true
    } else if (token.startsWith('-')) {
      parsed.errors.push(`未知参数: ${token}`)
    } else {
      positional.push(token)
    }
  }
  parsed.app = positional[0] || ''
  if (positional.length > 1) parsed.errors.push(`只允许指定一个端，收到: ${positional.join(', ')}`)
  if (!APPS.includes(parsed.app)) parsed.errors.push(`未知端: ${parsed.app || '(空)'}`)
  if (!MODES.includes(parsed.mode)) parsed.errors.push(`未知模式: ${parsed.mode || '(空)'}`)
  return parsed
}

/** 将端与模式映射到微信开发者工具可直接打开的小程序根目录。 */
export function resolveMpProjectPath(root, app, mode) {
  if (!APPS.includes(app)) throw new Error(`未知端: ${app || '(空)'}`)
  if (!MODES.includes(mode)) throw new Error(`未知模式: ${mode || '(空)'}`)
  return resolve(root, 'apps', app, 'dist', mode, 'mp-weixin')
}

/** 校验产物目录具备微信开发者工具要求的最小入口文件。 */
export function inspectMpProject(projectPath, exists = existsSync) {
  const findings = []
  if (!exists(join(projectPath, 'app.json'))) findings.push('缺少 app.json')
  if (!exists(join(projectPath, 'project.config.json'))) findings.push('缺少 project.config.json')
  return { ok: findings.length === 0, findings }
}

/** 优先使用显式环境变量，其次查找当前系统常见的开发者工具 CLI。 */
export function resolveMpDevtoolsCli({ env = process.env, platform = process.platform, exists = existsSync } = {}) {
  const candidates = [env.WECHAT_DEVTOOLS_CLI]
  if (platform === 'win32') candidates.push(...WINDOWS_CLI_PATHS)
  else if (platform === 'darwin') candidates.push(MACOS_CLI_PATH)
  return candidates.find((candidate) => candidate && exists(candidate)) || ''
}

function usage() {
  console.error('用法: pnpm mp:open <store|supplier|user> [--mode dev|build] [--dry-run]')
  console.error('开发态需先运行 pnpm dev:<端>；构建态需先运行 pnpm build:<端>。')
}

/** 启动开发者工具；Windows 的 cli.bat 需要通过 cmd call 避免空格路径被拆开。 */
export function launchDevtools(cliPath, projectPath) {
  if (process.platform === 'win32') {
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'call', cliPath, 'open', '--project', projectPath], {
      stdio: 'inherit',
      windowsHide: true
    })
  }
  return spawnSync(cliPath, ['open', '--project', projectPath], { stdio: 'inherit' })
}

function main(argv) {
  const options = parseMpOpenArgs(argv)
  if (options.errors.length) {
    for (const error of options.errors) console.error(error)
    usage()
    return 2
  }

  const projectPath = resolveMpProjectPath(ROOT, options.app, options.mode)
  const inspection = inspectMpProject(projectPath)
  if (!inspection.ok) {
    console.error(`无法打开 ${options.app} 的 ${options.mode} 产物：`)
    for (const finding of inspection.findings) console.error(`  - ${finding}`)
    console.error(`请先运行: ${options.mode === 'dev' ? `pnpm dev:${options.app}` : `pnpm build:${options.app}`}`)
    console.error(`目标目录: ${projectPath}`)
    return 2
  }

  const cliPath = resolveMpDevtoolsCli()
  console.log(`${options.app} ${options.mode} 项目: ${projectPath}`)
  if (options.dryRun) {
    console.log(cliPath ? `开发者工具 CLI: ${cliPath}` : '开发者工具 CLI: 未找到（当前为只读预演）')
    return 0
  }
  if (!cliPath) {
    console.error('未找到微信开发者工具 CLI。请手动将以下目录导入开发者工具：')
    console.error(projectPath)
    console.error('也可通过 WECHAT_DEVTOOLS_CLI 指定 cli.bat / cli 路径。')
    return 2
  }

  const result = launchDevtools(cliPath, projectPath)
  if (result.error) {
    console.error(`启动微信开发者工具失败: ${result.error.message}`)
    return 2
  }
  if (result.status !== 0) {
    console.error(`微信开发者工具 CLI 退出码: ${result.status ?? 'unknown'}`)
    return result.status || 2
  }
  return 0
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isCli) process.exitCode = main(process.argv.slice(2))
