// 4.1 打包形态 boot child 入口解析 pin（run.ts resolveChildEntry）。
// 权威：tech-design「打包管线（Windows NSIS）」——child 形态派生进程只读真实文件，
// 且 ESM import 沿目录上溯（@deepseek-ai/dsh-app-boot / dsh/profile-boot 须自
// {resources}/runtime/node_modules 上溯可达——host-dist 与之同容器相邻）。
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolveChildEntry } from './run.js'

const MODULE_URL = 'file:///Z:/worktrees/redesign/apps/host/dist/boot/run.js'
let dir: string
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-forge-child-entry-'))
})
afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('resolveChildEntry 双形态', () => {
  it('resourcesDir 未给（dev）→ 本模块同目录 child.js（workspace dist 解析邻接）', () => {
    const entry = resolveChildEntry(MODULE_URL)
    expect(entry.replaceAll('\\', '/')).toMatch(/apps\/host\/dist\/boot\/child\.js$/)
  })

  it('resourcesDir 给定且 host-dist 在场（packaged）→ {resources}/runtime/host-dist/boot/child.js', () => {
    const packaged = join(dir, 'runtime', 'host-dist', 'boot', 'child.js')
    mkdirSync(join(dir, 'runtime', 'host-dist', 'boot'), { recursive: true })
    writeFileSync(packaged, '// stub', 'utf8')
    const entry = resolveChildEntry(MODULE_URL, dir)
    expect(entry).toBe(packaged)
  })

  it('resourcesDir 给定但 host-dist 缺席（半成型资源）→ 回退 dev 入口（fail-loud 交 spawn）', () => {
    const entry = resolveChildEntry(MODULE_URL, join(dir, 'nonexistent-resources'))
    expect(entry.replaceAll('\\', '/')).toMatch(/apps\/host\/dist\/boot\/child\.js$/)
  })
})
