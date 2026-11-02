// workspace-artifact-governance §2.5 —— /forge-dir-init handler 单测：
// 纯机械 command plane 直执行零模型消息（/stop-dag-tasks 先例单测形态）；地图分区目录
// 初始化（已存在跳过，幂等取证）+ git 仓库 .gitignore 缺失条目去重追加（已有条目零重复）。
// 真实临时目录承载（node:fs IO 面——handler 即 IO 语义本体，纯桩无意义）。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createForgeDirInitHandler,
  FORGE_DIR_INIT_NAME,
  GITIGNORE_ENTRIES,
  missingGitignoreEntries,
  STORAGE_MAP_DIRS,
} from './forge-dir-init.js'
import type { ForgeCommandInvocation } from '../faces.js'

const createdDirs: string[] = []

function workspaceOf(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `forge-dir-init-${label}-`))
  createdDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of createdDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** 敲指令会话桩（header.cwd = 工作区根——stop-dag-tasks.test agentOf 同形） */
function invocationOf(root: string): ForgeCommandInvocation {
  return { agent: { session: { id: 's-main', header: { cwd: root } } } as never, rawInput: '' }
}

/** 目录快照（相对 workspace 根的存在性集合——幂等取证用） */
function snapshot(root: string): string[] {
  const out: string[] = []
  const walk = (abs: string, rel: string): void => {
    for (const name of ['docs/proposals', 'docs/probes', 'docs/roundtables', 'docs/features', 'worktrees', 'tmp', 'logs']) {
      if (existsSync(join(abs, '.forge', ...name.split('/')))) out.push(name)
    }
    void rel
  }
  walk(root, '')
  return out.sort()
}

function allMapDirsExist(root: string): boolean {
  return snapshot(root).length === STORAGE_MAP_DIRS.length
}

describe('forge-dir-init handler（workspace-artifact-governance §2.5）', () => {
  it(`指令名 pin：${FORGE_DIR_INIT_NAME}（无 input 描述符——无参指令）`, () => {
    expect(FORGE_DIR_INIT_NAME).toBe('forge-dir-init')
  })

  it('handler 直执行零模型消息：success 回执为纯文本（UI command plane 语义，对齐 /stop-dag-tasks 形态）', async () => {
    const root = workspaceOf('plane')
    const handler = createForgeDirInitHandler()
    const out = await handler(invocationOf(root))
    expect(out.kind).toBe('success')
    expect(typeof (out as { text?: string }).text).toBe('string')
    expect(Object.keys(out).sort()).toEqual(['kind', 'text'])
  })

  it('空工作区执行：地图分区目录全部在场（docs 四类 + worktrees/tmp/logs），回执列出新建目录', async () => {
    const root = workspaceOf('fresh')
    const handler = createForgeDirInitHandler()
    const out = (await handler(invocationOf(root))) as { kind: string; text: string }
    expect(allMapDirsExist(root)).toBe(true)
    for (const dir of STORAGE_MAP_DIRS) expect(out.text).toContain(dir)
  })

  it('幂等：重复执行零变更（目录零新建 + gitignore 零追加，回执明示零变更）', async () => {
    const root = workspaceOf('idem')
    mkdirSync(join(root, '.git'), { recursive: true }) // git 仓库——gitignore 径同场取证
    const handler = createForgeDirInitHandler()
    const first = (await handler(invocationOf(root))) as { text: string }
    const gitignoreAfterFirst = readFileSync(join(root, '.gitignore'), 'utf8')
    const treeAfterFirst = snapshot(root)
    const second = (await handler(invocationOf(root))) as { kind: string; text: string }
    expect(second.kind).toBe('success')
    expect(second.text).toContain('零变更')
    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toBe(gitignoreAfterFirst) // 逐字节相等
    expect(snapshot(root)).toEqual(treeAfterFirst)
    expect(first.text).not.toContain('零变更')
  })

  it('git 仓库：.gitignore 缺失条目去重追加；已有条目零重复', async () => {
    const root = workspaceOf('git')
    mkdirSync(join(root, '.git'), { recursive: true })
    writeFileSync(join(root, '.gitignore'), 'node_modules/\n', 'utf8')
    const handler = createForgeDirInitHandler()
    const out = (await handler(invocationOf(root))) as { text: string }
    const content = readFileSync(join(root, '.gitignore'), 'utf8')
    for (const entry of GITIGNORE_ENTRIES) {
      expect(content).toContain(entry)
      expect(out.text).toContain(entry)
      expect(content.split('\n').filter((line) => line === entry)).toHaveLength(1) // 零重复
    }
    expect(content).toContain('node_modules/') // 既有内容原样保留
  })

  it('判等区分注释与生效条目：仅出现在注释里的路径不算已有，仍追加（formal-verification §4.3）', async () => {
    const root = workspaceOf('comment')
    mkdirSync(join(root, '.git'), { recursive: true })
    writeFileSync(join(root, '.gitignore'), `# 曾议及 .forge/tmp/ 但从未生效\n`, 'utf8')
    const handler = createForgeDirInitHandler()
    await handler(invocationOf(root))
    const content = readFileSync(join(root, '.gitignore'), 'utf8')
    expect(content.split('\n').filter((line) => line === '.forge/tmp/')).toHaveLength(1)
  })

  it('归一化判重：尾斜杠/锚定前导斜杠差异不算缺失（已有条目零重复）', () => {
    expect(missingGitignoreEntries('.forge/tmp\n.forge/worktrees\n', ['.forge/tmp/', '.forge/worktrees/'])).toEqual([])
    expect(missingGitignoreEntries('.forge/logs/\n', GITIGNORE_ENTRIES)).toEqual(['.forge/worktrees/', '.forge/tmp/', '.forge/docs/probes/'])
  })

  it('非 git 仓库：零 .gitignore 创建（地图条目无承载面），目录照常初始化', async () => {
    const root = workspaceOf('nogit')
    const handler = createForgeDirInitHandler()
    const out = (await handler(invocationOf(root))) as { text: string }
    expect(allMapDirsExist(root)).toBe(true)
    expect(existsSync(join(root, '.gitignore'))).toBe(false)
    expect(out.text).not.toContain('.gitignore')
  })

  it('会话工作区根缺席（header.cwd 与顶层 cwd 皆空）：error 回执零写入（fail-soft 不炸）', async () => {
    const handler = createForgeDirInitHandler()
    const out = await handler({ agent: { session: { id: 's-x' } } as never, rawInput: '' })
    expect(out.kind).toBe('error')
    expect((out as { text: string }).text).toContain('工作区根')
  })
})
