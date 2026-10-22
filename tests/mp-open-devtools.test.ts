import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { inspectMpProject, launchDevtools, parseMpOpenArgs, resolveMpDevtoolsCli, resolveMpProjectPath } from '../scripts/open-mp-devtools.mjs'

describe('mp:open 开发者工具入口', () => {
  it('解析默认 dev 模式、build 模式和只读预演参数', () => {
    expect(parseMpOpenArgs(['store'])).toEqual({ app: 'store', mode: 'dev', dryRun: false, errors: [] })
    expect(parseMpOpenArgs(['supplier', '--mode', 'build', '--dry-run'])).toEqual({
      app: 'supplier',
      mode: 'build',
      dryRun: true,
      errors: []
    })
    expect(parseMpOpenArgs(['nope']).errors.join('|')).toContain('未知端')
    expect(parseMpOpenArgs(['store', '--mode', 'preview']).errors.join('|')).toContain('未知模式')
  })

  it('把三端映射到对应的开发态和构建态产物目录', () => {
    const root = resolve('E:/project/agritainmen2')
    for (const app of ['store', 'supplier', 'user']) {
      expect(resolveMpProjectPath(root, app, 'dev')).toBe(resolve(root, 'apps', app, 'dist', 'dev', 'mp-weixin'))
      expect(resolveMpProjectPath(root, app, 'build')).toBe(resolve(root, 'apps', app, 'dist', 'build', 'mp-weixin'))
    }
    expect(() => resolveMpProjectPath(root, 'admin', 'dev')).toThrow('未知端')
    expect(() => resolveMpProjectPath(root, 'store', 'preview')).toThrow('未知模式')
  })

  it('在启动前报告缺失的 app.json 与 project.config.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mp-open-project-'))
    try {
      expect(inspectMpProject(dir)).toEqual({
        ok: false,
        findings: ['缺少 app.json', '缺少 project.config.json']
      })
      writeFileSync(join(dir, 'app.json'), '{}')
      writeFileSync(join(dir, 'project.config.json'), '{}')
      expect(inspectMpProject(dir)).toEqual({ ok: true, findings: [] })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('优先使用 WECHAT_DEVTOOLS_CLI，并支持标准安装路径回退', () => {
    const custom = 'C:\\custom\\wechat\\cli.bat'
    expect(resolveMpDevtoolsCli({ env: { WECHAT_DEVTOOLS_CLI: custom }, platform: 'win32', exists: (path) => path === custom })).toBe(custom)

    const standard = 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat'
    expect(resolveMpDevtoolsCli({ env: {}, platform: 'win32', exists: (path) => path === standard })).toBe(standard)
    expect(resolveMpDevtoolsCli({ env: {}, platform: 'linux', exists: () => false })).toBe('')
  })

  it.runIf(process.platform === 'win32')('Windows 下能启动含空格的批处理 CLI 并转发项目路径', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mp-open cli-'))
    const cli = join(dir, 'cli fake.cmd')
    const log = join(dir, 'args.txt')
    const project = join(dir, 'project path')
    try {
      writeFileSync(cli, `@echo off\r\necho %* > "${log}"\r\nexit /b 0\r\n`)
      const result = launchDevtools(cli, project)
      expect(result.status).toBe(0)
      expect(readFileSync(log, 'utf8').trim()).toBe(`open --project "${project}"`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
