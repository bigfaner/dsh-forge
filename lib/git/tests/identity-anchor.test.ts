// @dsh-forge/lib-git 单测：worktree 清单解析（多树/bare/detached）、git 缺席或非仓库
// 降级（fail-soft → null）、主 worktree 判定（短路/origin/main/master/首观察时间）。
// porcelain 探针缝用注入桩；末组为真 git CLI 冒烟（临时仓即建即删）。
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import {
  createGitIdentityPort,
  sameAnchor,
  selectMainWorktree,
  type GitIdentityPort,
  type MainWorktreeCandidate,
} from '../src/index.js'
import type { GitPorcelainRunner } from '@dsh-forge/lib-path/project-root'

const execFileP = promisify(execFile)

/** 多树 porcelain 夹具：主检出 + 附属树 + detached + bare（真实 git 输出形状：空行分块） */
const MULTI_PORCELAIN = [
  'worktree C:/repo',
  'HEAD abc123',
  'branch refs/heads/main',
  '',
  'worktree C:/repo/.wt/b1',
  'HEAD def456',
  'branch refs/heads/b1',
  '',
  'worktree C:/elsewhere/detached',
  'HEAD 789abc',
  'detached',
  '',
  'worktree C:/bare-repo',
  'bare',
  '',
].join('\n')

describe('worktrees（porcelain 清单解析，探针注入桩）', () => {
  it('多工作树解析：branch 去 refs/heads/ 前缀；detached/bare → null', async () => {
    const run: GitPorcelainRunner = () => MULTI_PORCELAIN
    const port = createGitIdentityPort(run)
    const entries = await port.worktrees('C:/repo')
    expect(entries).toEqual([
      { path: 'C:/repo', branch: 'main' },
      { path: 'C:/repo/.wt/b1', branch: 'b1' },
      { path: 'C:/elsewhere/detached', branch: null },
      { path: 'C:/bare-repo', branch: null },
    ])
  })

  it('探针抛错（git 缺席/命令失败语义）→ null', async () => {
    const run: GitPorcelainRunner = () => {
      throw new Error('spawn git ENOENT')
    }
    const port = createGitIdentityPort(run)
    expect(await port.worktrees('C:/repo')).toBeNull()
  })

  it('清单为空（非 git 检出语义）→ 空数组（非 null）', async () => {
    const port = createGitIdentityPort(() => '')
    expect(await port.worktrees('C:/repo')).toEqual([])
  })
})

describe('降级边界（真 git CLI：非 git 目录 fail-soft → null）', () => {
  it('非 git 目录：commonDirAnchor / originDefaultBranch 均 null', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lib-git-nongit-'))
    try {
      const port = createGitIdentityPort()
      expect(await port.commonDirAnchor(dir)).toBeNull()
      expect(await port.originDefaultBranch(dir)).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('selectMainWorktree（主 worktree 判定）', () => {
  const now = '2026-11-28T00:00:00Z'
  const c = (id: string, branch: string | null, createdAt: string | null): MainWorktreeCandidate => ({ id, branch, createdAt })

  it('空候选集 → null', () => {
    expect(selectMainWorktree([], { originDefaultBranch: 'main', now })).toBeNull()
  })

  it('单候选短路：根 worktree 切非默认分支仍即主', () => {
    expect(selectMainWorktree([c('a', 'feature-x', now)], { originDefaultBranch: 'main', now })).toBe('a')
  })

  it('origin 默认分支优先', () => {
    const candidates = [c('a', 'dev', '2020-01-01'), c('b', 'main', '2021-01-01'), c('c2', 'master', '2019-01-01')]
    expect(selectMainWorktree(candidates, { originDefaultBranch: 'main', now })).toBe('b')
  })

  it('无 origin 命中：退 main > master', () => {
    const candidates = [c('a', 'dev', '2020-01-01'), c('b', 'master', '2019-01-01')]
    expect(selectMainWorktree(candidates, { originDefaultBranch: null, now })).toBe('b')
    expect(selectMainWorktree([c('a', 'main', '2020-01-01'), c('b', 'master', '2019-01-01')], { originDefaultBranch: null, now })).toBe('a')
  })

  it('全不命中分支：退首观察时间最早（createdAt 缺省 = now）', () => {
    const candidates = [c('a', 'x', null), c('b', 'y', '2020-01-01'), c('c3', 'z', '2021-01-01')]
    expect(selectMainWorktree(candidates, { originDefaultBranch: null, now })).toBe('b')
  })
})

describe('sameAnchor（归并键比对）', () => {
  it('大小写/斜杠拼写差异同锚；不同路径异锚', () => {
    expect(sameAnchor('C:/Repo/X', 'c:\\repo\\x')).toBe(true)
    expect(sameAnchor('C:/repo/x', 'C:/repo/y')).toBe(false)
  })
})

describe('真 git CLI 冒烟（临时仓 + 附属 worktree）', () => {
  it('real spawn：清单含主树与附属树，commonDirAnchor = 主树 realpath', async (ctx) => {
    const root = await mkdtemp(join(tmpdir(), 'lib-git-smoke-'))
    const main = join(root, 'main')
    const peer = join(root, 'peer')
    // vitest worker PATH 实测不含 Git\cmd（spawn git ENOENT）——冒烟探针显式定位 git 可执行；
    // 沙箱禁 spawn 的执行环境探测失败即 skip（真机/普通环境恒真跑）
    const gitBin = await (async () => {
      if (process.platform !== 'win32') return 'git'
      const { existsSync } = await import('node:fs')
      const candidates = ['D:\\software\\Git\\cmd\\git.exe', 'C:\\Program Files\\Git\\cmd\\git.exe']
      const hit = candidates.find((p) => existsSync(p))
      if (hit !== undefined) return hit
      const where = await execFileP('where.exe', ['git']).catch(() => null)
      return where?.stdout.split(/\r?\n/)[0] ?? 'git'
    })()
    const git = (args: string[], cwd: string) => execFileP(gitBin, args, { cwd, windowsHide: true })
    const probe = await execFileP(gitBin, ['--version'], { windowsHide: true }).catch(() => null)
    if (probe === null) {
      ctx.skip()
      return
    }
    try {
      const { mkdir } = await import('node:fs/promises')
      await mkdir(main, { recursive: true })
      await mkdir(peer, { recursive: true })
      await git(['init', '-b', 'main'], main)
      await git(['config', 'user.email', 't@t'], main)
      await git(['config', 'user.name', 't'], main)
      await execFileP('node', ['-e', "require('node:fs').writeFileSync(process.argv[1], 'x')", join(main, 'f.txt')])
      await git(['add', '.'], main)
      await git(['commit', '-m', 'init'], main)
      await git(['worktree', 'add', peer, '-b', 'peer'], main)
      const port = createGitIdentityPort()
      const entries = await port.worktrees(main)
      expect(entries).not.toBeNull()
      expect(entries).toHaveLength(2)
      expect(entries?.[0]).toEqual({ path: expect.any(String), branch: 'main' })
      expect(entries?.some((e) => e.branch === 'peer')).toBe(true)
      const anchor = await port.commonDirAnchor(peer)
      const mainAnchor = await port.commonDirAnchor(main)
      expect(anchor).not.toBeNull()
      expect(mainAnchor).not.toBeNull()
      // 同仓任意 worktree 锚恒同（归并键机制）
      expect(sameAnchor(anchor!, mainAnchor!)).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {})
    }
  })
})

// 类型面 pin：GitIdentityPort 可注入装配面（缺席 = 归并层缺席）
const _portTypePin: GitIdentityPort | undefined = undefined
void _portTypePin
