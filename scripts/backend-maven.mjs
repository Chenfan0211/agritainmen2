#!/usr/bin/env node
import { existsSync, readdirSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { spawnSync } from 'node:child_process'

function javaMajor(javaHome) {
  if (!javaHome) return 0
  const java = join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
  if (!existsSync(java)) return 0
  const result = spawnSync(java, ['-version'], { encoding: 'utf8' })
  const text = `${result.stderr || ''}${result.stdout || ''}`
  const match = /version "(?:1\.)?(\d+)/.exec(text)
  return match ? Number(match[1]) : 0
}

function findJdk21() {
  const candidates = [process.env.JAVA_HOME]
  if (process.platform === 'win32') {
    const roots = [
      'C:\\Program Files\\Eclipse Adoptium',
      'C:\\Program Files\\Java',
      join(process.env.USERPROFILE || '', '.jdks')
    ]
    for (const root of roots) {
      if (!existsSync(root)) continue
      for (const name of readdirSync(root)) {
        if (/jdk-?21|temurin-21|21\./i.test(name)) candidates.push(join(root, name))
      }
    }
  }
  return candidates.find((candidate) => javaMajor(candidate) >= 21) || ''
}

const javaHome = findJdk21()
if (!javaHome) {
  console.error('未找到 JDK 21。请安装 JDK 21 并设置 JAVA_HOME。')
  process.exit(1)
}
const args = process.argv.slice(2)
const commandArgs = ['-f', 'backend/pom.xml', ...args]
const env = { ...process.env, JAVA_HOME: javaHome, Path: `${join(javaHome, 'bin')}${delimiter}${process.env.Path || process.env.PATH || ''}` }
const result = spawnSync(process.platform === 'win32' ? 'mvn.cmd' : 'mvn', commandArgs, { stdio: 'inherit', env, shell: process.platform === 'win32' })
if (result.error) console.error(result.error)
process.exit(result.status ?? 1)
