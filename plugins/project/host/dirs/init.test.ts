// workspace-artifact-governance §2.5 —— /forge-dir-init handler 单测：
// 纯机械 command plane 直执行零模型消息（/stop-dag-tasks 先例单测形态）；分区目录由
// ForgeDirs 键表派生（workspacePartitionsOf 单源——docs/tmp/worktrees 三员，已存在跳过，
// 幂等取证）+ git 仓库 .gitignore 缺失条目去重追加（git 外分区派生条目，已有零重复）。
// 真实临时目录承载（node:fs IO 面——handler 即 IO 语义本体，纯桩无意义）。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FORGE_DIR_KEYS } from './anchors.js'
import {
  createForgeDirInitHandler,
  declaredDeclarationsOf,
  FORGE_DIR_INIT_NAME,
  gitignoreEntriesOf,
  missingGitignoreEntries,
  type DirCommandInvocation,
} from './init.js'

const createdDirs: string[] = []

/** 键表派生分区（docs/tmp/worktrees——与 handler 同一派生函数的事实对齐基准） */
const PARTITIONS = ['.forge/docs', '.forge/tmp', '.forge/worktrees'] as const

function workspaceOf(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `forge-dir-init-${label}-`))
  createdDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of createdDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** 敲指令会话桩（header.cwd = 工作区根——stop-dag-tasks.test agentOf 同形） */
function invocationOf(root: string): DirCommandInvocation {
  return { agent: { session: { id: 's-main', header: { cwd: root } } } as never, rawInput: '' }
}

/** 目录快照（相对 workspace 根的存在性集合——幂等取证用） */
function snapshot(root: string): string[] {
  const out: string[] = []
  for (const name of ['docs', 'docs/proposals', 'worktrees', 'tmp', 'logs']) {
    if (existsSync(join(root, '.forge', ...name.split('/')))) out.push(name)
  }
  return out.sort()
}

describe('forge-dir-init handler（workspace-artifact-governance §2.5）', () => {
  it(`指令名 pin：${FORGE_DIR_INIT_NAME}（无 input 描述符——无参指令）`, () => {
    expect(FORGE_DIR_INIT_NAME).toBe('forge-dir-init')
  })

  it('声明拉取缝：reflect 缺席 = 仅本体声明（键序 = FORGE_DIR_KEYS）', () => {
    expect(declaredDeclarationsOf({}).map((d) => Object.keys(d.entries))).toEqual([FORGE_DIR_KEYS])
  })

  it('分区与 gitignore 条目由键表派生：gitignoreEntriesOf 排除 docs 文档树', () => {
    expect(gitignoreEntriesOf(PARTITIONS)).toEqual(['.forge/tmp/', '.forge/worktrees/'])
    expect(gitignoreEntriesOf(['.forge/docs', '.forge/docs/probes', '.forge/tmp'])).toEqual(['.forge/tmp/'])
  })

  it('空工作区执行：键表分区目录全部在场（docs/tmp/worktrees），回执列出新建目录', async () => {
    const root = workspaceOf('fresh')
    const handler = createForgeDirInitHandler()
    const out = (await handler(invocationOf(root))) as { kind: string; text: string }
    expect(out.kind).toBe('success')
    for (const partition of PARTITIONS) {
      expect(existsSync(join(root, ...partition.split('/')))).toBe(true)
      expect(out.text).toContain(partition)
    }
    expect(snapshot(root)).toEqual(['docs', 'tmp', 'worktrees'])
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
    for (const entry of gitignoreEntriesOf(PARTITIONS)) {
      expect(content).toContain(entry)
      expect(out.text).toContain(entry)
      expect(content.split('\n').filter((line) => line === entry)).toHaveLength(1) // 零重复
    }
    expect(content).toContain('node_modules/') // 既有内容原样保留
    expect(content).not.toContain('.forge/docs') // docs 文档树可提交，不设条目
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
    expect(missingGitignoreEntries('.forge/logs/\n', ['.forge/tmp/', '.forge/worktrees/'])).toEqual(['.forge/tmp/', '.forge/worktrees/'])
  })

  it('非 git 仓库：零 .gitignore 创建（地图条目无承载面），目录照常初始化', async () => {
    const root = workspaceOf('nogit')
    const handler = createForgeDirInitHandler()
    const out = (await handler(invocationOf(root))) as { text: string }
    expect(snapshot(root)).toEqual(['docs', 'tmp', 'worktrees'])
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
