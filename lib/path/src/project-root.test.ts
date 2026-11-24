// @dsh-forge/lib-path · project-root pin —— 项目根归拢推导单源（2026-11-24 用户裁决：
// porcelain 解析/主检出判定/fail-soft 三插件共享单源）。porcelain 夹具与真实 git 输出
// 形状一致（空行分块，块 = worktree/HEAD/branch/detached/bare 行，主检出行恒先列）。
import { describe, expect, it } from 'vitest'
import {
  isInWorktreeTree,
  matchPathSpelling,
  parseWorktreePorcelain,
  resolveMainCheckoutRoot,
  spawnGitWorktreePorcelain,
  type GitPorcelainRunner,
} from './project-root.js'

/** 真实 git worktree list --porcelain 输出形状夹具（主检出 + detached + bare + 附属树） */
const PORCELAIN = [
  'worktree C:/repo',
  'HEAD abc123',
  'branch refs/heads/main',
  '',
  'worktree C:/repo/.forge/worktrees/plugins',
  'HEAD def456',
  'branch refs/heads/b1',
  '',
  'worktree C:/elsewhere/detached',
  'HEAD 789abc',
  'detached',
  '',
  'worktree C:/bare-repo (bare)',
  'bare',
  '',
].join('\n')

describe('parseWorktreePorcelain（porcelain 解析边界 pin）', () => {
  it('多 worktree 全字段解析：主检出行判定 = 首条目', () => {
    const entries = parseWorktreePorcelain(PORCELAIN)
    expect(entries).toHaveLength(4)
    expect(entries[0]).toEqual({ path: 'C:/repo', head: 'abc123', branch: 'refs/heads/main', detached: false, bare: false })
    expect(entries[1]).toEqual({ path: 'C:/repo/.forge/worktrees/plugins', head: 'def456', branch: 'refs/heads/b1', detached: false, bare: false })
  })

  it('detached / bare 条目（branch 缺席）', () => {
    const entries = parseWorktreePorcelain(PORCELAIN)
    expect(entries[2]).toEqual({ path: 'C:/elsewhere/detached', head: '789abc', detached: true, bare: false })
    expect(entries[3]).toEqual({ path: 'C:/bare-repo (bare)', head: '', detached: false, bare: true })
  })

  it('空输出 / 纯空白 → 空清单', () => {
    expect(parseWorktreePorcelain('')).toEqual([])
    expect(parseWorktreePorcelain('\n\n')).toEqual([])
  })
})

describe('resolveMainCheckoutRoot（主检出判定 + fail-soft 错误面 pin）', () => {
  it('正常清单 → root = 首条目（主检出行恒先列）', () => {
    const probe = resolveMainCheckoutRoot('C:/repo/.forge/worktrees/plugins', () => PORCELAIN)
    expect(probe.root).toBe('C:/repo')
    expect(probe.entries).toHaveLength(4)
    expect(probe.reason).toBeUndefined()
  })

  it('git 探针抛错（git 缺席）→ fail-soft root/entries undefined + reason 可诊断', () => {
    const failing: GitPorcelainRunner = () => {
      throw new Error('git not found')
    }
    const probe = resolveMainCheckoutRoot('C:/repo', failing)
    expect(probe.root).toBeUndefined()
    expect(probe.entries).toBeUndefined()
    expect(probe.reason).toContain('git not found')
  })

  it('空清单 → fail-soft（非 git 检出）', () => {
    const probe = resolveMainCheckoutRoot('C:/plain', () => '')
    expect(probe.root).toBeUndefined()
    expect(probe.reason).toContain('porcelain 清单为空')
  })
})

describe('isInWorktreeTree（归属判定 pin）', () => {
  const entries = parseWorktreePorcelain(PORCELAIN)
  it('精确命中 / 子树命中 / 缺席', () => {
    expect(isInWorktreeTree(entries, 'C:/repo')).toBe(true)
    expect(isInWorktreeTree(entries, 'C:/repo/.forge/worktrees/plugins/host/src')).toBe(true)
    expect(isInWorktreeTree(entries, 'C:/not-in-list')).toBe(false)
    expect(isInWorktreeTree(entries, 'C:/repo-sibling')).toBe(false) // 前缀非边界不误判
  })

  it('Windows 反斜杠拼写归一比对', () => {
    expect(isInWorktreeTree(entries, 'C:\\repo\\.forge\\worktrees\\plugins')).toBe(true)
  })
})

describe('matchPathSpelling（主根拼写随调用方风格改写 pin）', () => {
  it('样本含反斜杠 → 主根改写反斜杠；样本正斜杠 → 主根改写正斜杠', () => {
    expect(matchPathSpelling('C:\\repo\\wt', 'C:/repo')).toBe('C:\\repo')
    expect(matchPathSpelling('C:/repo/wt', 'C:\\repo')).toBe('C:/repo')
  })
})

describe('spawnGitWorktreePorcelain（生产探针口径冒烟——真 git CLI）', () => {
  it('git 仓内返回 porcelain 清单（首条目 = 检出根）', () => {
    const entries = parseWorktreePorcelain(spawnGitWorktreePorcelain(process.cwd()))
    expect(entries.length).toBeGreaterThanOrEqual(1)
    expect(entries[0]!.path.length).toBeGreaterThan(0)
  })
})
