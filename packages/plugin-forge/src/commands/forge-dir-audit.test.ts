// workspace-artifact-governance §2.5 —— /forge-dir-audit handler 单测：
// command plane 机械扫描（深度上限 3 层 / 跳过 node_modules 等重目录 / 符号链接不深入）
// 与标准地图比对产差异载荷（缺失分区/越位目录/游离散件）；差异经 followup 同径提交会话
// agent 一个分析回合（agent 只出建议清单——零文件系统变更、零清理执行、零派发面）。
// 真实临时目录承载（node:fs IO 面——handler 即 IO 语义本体，纯桩无意义）。
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { auditDirTree, createForgeDirAuditHandler, FORGE_DIR_AUDIT_NAME, scanDirTree, STORAGE_MAP_DIRS } from './forge-dir-audit.js'
import type { ForgeCommandInvocation } from '../faces.js'

const createdDirs: string[] = []

function workspaceOf(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `forge-dir-audit-${label}-`))
  createdDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of createdDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** 敲指令会话桩（header.cwd = 工作区根——forge-dir-init.test invocationOf 同形） */
function invocationOf(root: string, followup?: (message: unknown) => void): ForgeCommandInvocation {
  return {
    agent: { session: { id: 's-main', header: { cwd: root } }, ...(followup !== undefined ? { followup } : {}) } as never,
    rawInput: '',
  }
}

/** 全树快照（相对路径有序集——audit 零文件系统变更取证面） */
function treeSnapshot(root: string): string[] {
  const out: string[] = []
  const walk = (abs: string, rel: string): void => {
    const entries = readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))
    for (const entry of entries) {
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`
      out.push(`${childRel}${entry.isDirectory() ? '/' : ''}`)
      if (entry.isDirectory()) walk(join(abs, entry.name), childRel)
    }
  }
  walk(root, '')
  return out
}

describe('forge-dir-audit 机械扫描（workspace-artifact-governance §2.5）', () => {
  it(`指令名 pin：${FORGE_DIR_AUDIT_NAME}（无 input 描述符——无参指令）`, () => {
    expect(FORGE_DIR_AUDIT_NAME).toBe('forge-dir-audit')
  })

  it('扫描深度上限 3 层：3 段路径条目在场、4 段以深不触达（禁无限递归）', () => {
    const root = workspaceOf('depth')
    mkdirSync(join(root, 'a', 'b', 'c', 'd', 'e'), { recursive: true })
    writeFileSync(join(root, 'a', 'b', 'deep3.txt'), 'x') // 3 段——界内
    writeFileSync(join(root, 'a', 'b', 'c', 'deep4.txt'), 'x') // 4 段——界外
    writeFileSync(join(root, 'a', 'b', 'c', 'd', 'e', 'deep6.txt'), 'x')
    const entries = scanDirTree(root)
    const rels = entries.map((entry) => entry.rel)
    expect(rels).toContain('a/b/c')
    expect(rels).toContain('a/b/deep3.txt')
    expect(rels).not.toContain('a/b/c/d')
    expect(rels).not.toContain('a/b/c/deep4.txt')
    expect(rels.some((rel) => rel.split('/').length > 3)).toBe(false)
  })

  it('跳过 node_modules 等已知重目录：入口条目在场、子树零触达', () => {
    const root = workspaceOf('heavy')
    mkdirSync(join(root, 'node_modules', 'some-pkg'), { recursive: true })
    writeFileSync(join(root, 'node_modules', 'some-pkg', 'index.js'), 'x')
    const rels = scanDirTree(root).map((entry) => entry.rel)
    expect(rels).toContain('node_modules')
    expect(rels).not.toContain('node_modules/some-pkg')
  })

  it('符号链接/junction 不深入：链接条目本身在场、目标子树零触达', () => {
    const root = workspaceOf('link')
    const target = mkdtempSync(join(tmpdir(), 'forge-dir-audit-target-'))
    createdDirs.push(target)
    writeFileSync(join(target, 'inside.txt'), 'x')
    mkdirSync(join(root, 'pkg'), { recursive: true })
    symlinkSync(target, join(root, 'pkg', 'link'), 'junction')
    const entries = scanDirTree(root)
    expect(entries.map((entry) => entry.rel)).toContain('pkg/link')
    expect(entries.map((entry) => entry.rel)).not.toContain('pkg/link/inside.txt')
  })

  it('差异三类命中：缺失分区 / 越位目录 / 游离散件', () => {
    const root = workspaceOf('diff')
    // 初始化全部地图分区后删掉一个 → 缺失分区
    for (const dir of STORAGE_MAP_DIRS) mkdirSync(join(root, '.forge', ...dir.split('/')), { recursive: true })
    rmSync(join(root, '.forge', 'logs'), { recursive: true, force: true })
    // 越位目录：.forge 下非地图分区 + .forge/docs 下非地图分区
    mkdirSync(join(root, '.forge', 'extra-dir'), { recursive: true })
    mkdirSync(join(root, '.forge', 'docs', 'stray-docs'), { recursive: true })
    // 游离散件：.forge 直下散落文件 + 根目录临时文件
    writeFileSync(join(root, '.forge', 'loose.txt'), 'x')
    writeFileSync(join(root, 'debug.log'), 'x')
    const diff = auditDirTree(root)
    expect(diff.missingPartitions).toEqual(['logs'])
    expect(diff.misplacedDirs).toContain('.forge/extra-dir')
    expect(diff.misplacedDirs).toContain('.forge/docs/stray-docs')
    expect(diff.strayFiles).toContain('.forge/loose.txt')
    expect(diff.strayFiles).toContain('debug.log')
  })

  it('对齐工作区零差异：地图分区齐备 + 无越位无散件 → 三类皆空', () => {
    const root = workspaceOf('clean')
    for (const dir of STORAGE_MAP_DIRS) mkdirSync(join(root, '.forge', ...dir.split('/')), { recursive: true })
    mkdirSync(join(root, 'src'), { recursive: true }) // git 内交付树——零差异
    const diff = auditDirTree(root)
    expect(diff.missingPartitions).toEqual([])
    expect(diff.misplacedDirs).toEqual([])
    expect(diff.strayFiles).toEqual([])
  })
})

describe('forge-dir-audit handler（followup 同径——只建议不执行）', () => {
  it('差异在场：提交会话 agent 恰一个分析回合，载荷含三类差异与「只建议不执行」约束', async () => {
    const root = workspaceOf('handler')
    for (const dir of STORAGE_MAP_DIRS) mkdirSync(join(root, '.forge', ...dir.split('/')), { recursive: true })
    rmSync(join(root, '.forge', 'tmp'), { recursive: true, force: true })
    writeFileSync(join(root, '.forge', 'loose.txt'), 'x')
    const followups: unknown[] = []
    const handler = createForgeDirAuditHandler()
    const out = (await handler(invocationOf(root, (message) => followups.push(message)))) as { kind: string; text: string }
    expect(out.kind).toBe('success')
    expect(followups).toHaveLength(1) // 恰一个分析回合（followup 同径——/run-dag-tasks 先例）
    const payload = JSON.stringify(followups[0])
    expect(payload).toContain('.forge/tmp')
    expect(payload).toContain('.forge/loose.txt')
    expect(payload).toContain('只') // 建议约束在载荷内
  })

  it('audit 零文件系统变更：handler 前后全树快照逐位一致（不删除/不创建、零派发面）', async () => {
    const root = workspaceOf('readonly')
    for (const dir of STORAGE_MAP_DIRS) mkdirSync(join(root, '.forge', ...dir.split('/')), { recursive: true })
    writeFileSync(join(root, 'debug.log'), 'x')
    const before = treeSnapshot(root)
    const followups: unknown[] = []
    const handler = createForgeDirAuditHandler()
    await handler(invocationOf(root, (message) => followups.push(message)))
    expect(treeSnapshot(root)).toEqual(before)
    expect(followups).toHaveLength(1)
  })

  it('零差异：不提交分析回合（零 followup），回执明示零差异', async () => {
    const root = workspaceOf('nodiff')
    for (const dir of STORAGE_MAP_DIRS) mkdirSync(join(root, '.forge', ...dir.split('/')), { recursive: true })
    const followups: unknown[] = []
    const handler = createForgeDirAuditHandler()
    const out = (await handler(invocationOf(root, (message) => followups.push(message)))) as { kind: string; text: string }
    expect(out.kind).toBe('success')
    expect(out.text).toContain('零差异')
    expect(followups).toHaveLength(0)
  })

  it('followup 面缺席：error 回执不静默（扫描事实已在回执），零外抛', async () => {
    const root = workspaceOf('nofollowup')
    writeFileSync(join(root, 'debug.log'), 'x')
    const handler = createForgeDirAuditHandler()
    const out = await handler(invocationOf(root))
    expect(out.kind).toBe('error')
    expect((out as { text: string }).text).toContain('followup')
  })

  it('会话工作区根缺席：error 回执（fail-soft 不炸）', async () => {
    const handler = createForgeDirAuditHandler()
    const out = await handler({ agent: { session: { id: 's-x' } } as never, rawInput: '' })
    expect(out.kind).toBe('error')
    expect((out as { text: string }).text).toContain('工作区根')
  })
})
