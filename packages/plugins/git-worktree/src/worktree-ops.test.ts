// @dsh-forge/git-worktree —— worktree 管理域 + 身份锚单测。
// 外部依赖取证门：全部用例跑真实 git 子进程 + 临时仓库 fixture（无 remote / 带 bare remote 两种形态）。
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { commonDirAnchor } from './git-anchor.js'
import {
  aheadBehind,
  createWorktree,
  defaultBranch,
  deleteWorktree,
  listBranches,
  listWorktrees,
  parseWorktreeListPorcelain,
  worktreeStatus,
} from './worktree-ops.js'

let root: string

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

function commitFile(cwd: string, file: string, content: string, message: string): void {
  mkdirSync(cwd, { recursive: true })
  writeFileSync(join(cwd, file), content)
  git(cwd, 'add', file)
  git(cwd, 'commit', '-m', message)
}

/** 纯本地仓库 fixture（无 remote）：main 分支 + 两个分支 + 一个手工 worktree */
function makeLocalRepo(name: string): string {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  git(dir, 'init', '-b', 'main')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'test')
  git(dir, 'config', 'commit.gpgsign', 'false')
  commitFile(dir, 'a.txt', 'a', 'init')
  git(dir, 'branch', 'feat/one')
  git(dir, 'branch', 'feat/two')
  // 手工建 worktree（非 DSH 通道，放仓库目录外避免污染 status）：应照列
  git(dir, 'worktree', 'add', join(root, `${name}-manual-wt`), 'feat/two')
  return dir
}

const norm = (p: string): string => p.replaceAll('\\', '/')

/** 带 bare remote 的仓库 fixture：clone 自 bare，可验证 fetch 前置刷新远端引用 */
function makeRemoteRepo(name: string): { origin: string; clone: string } {
  const origin = join(root, `${name}-origin.git`)
  mkdirSync(origin, { recursive: true })
  git(origin, 'init', '--bare', '-b', 'main')
  const seed = join(root, `${name}-seed`)
  mkdirSync(seed, { recursive: true })
  git(seed, 'init', '-b', 'main')
  git(seed, 'config', 'user.email', 'test@example.com')
  git(seed, 'config', 'user.name', 'test')
  git(seed, 'config', 'commit.gpgsign', 'false')
  commitFile(seed, 'base.txt', 'base', 'base')
  git(seed, 'remote', 'add', 'origin', origin)
  git(seed, 'push', 'origin', 'main')
  const clone = join(root, `${name}-clone`)
  git(root, 'clone', origin, clone)
  git(clone, 'config', 'user.email', 'test@example.com')
  git(clone, 'config', 'user.name', 'test')
  return { origin, clone }
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'dsh-git-worktree-ops-'))
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('listWorktrees（git worktree list --porcelain）', () => {
  it('返回全量 worktree：主仓 + 手工建条目，path/branch/detached/bare 齐备', async () => {
    const repo = makeLocalRepo('list-full')
    const entries = await listWorktrees(repo)
    expect(entries).toHaveLength(2)

    const main = entries[0]
    expect(norm(main.path)).toBe(norm(repo))
    expect(main.branch).toBe('main')
    expect(main.detached).toBe(false)
    expect(main.bare).toBe(false)
    expect(main.head).toMatch(/^[0-9a-f]{40}$/)

    const manual = entries.find((entry) => entry.path.endsWith('manual-wt'))
    expect(manual).toBeDefined()
    expect(manual?.branch).toBe('feat/two')
    expect(manual?.detached).toBe(false)
    expect(manual?.bare).toBe(false)
  })

  it('bare 仓与 detached 检出照列', async () => {
    const repo = makeLocalRepo('list-bare')
    const bareDir = join(root, 'list-bare-bare.git')
    git(root, 'clone', '--bare', repo, bareDir)
    const detachedWt = join(root, 'list-bare-detached')
    git(repo, 'worktree', 'add', '--detach', detachedWt, 'HEAD')

    const bareEntries = await listWorktrees(bareDir)
    expect(bareEntries).toHaveLength(1)
    expect(bareEntries[0].bare).toBe(true)
    expect(bareEntries[0].branch).toBeNull()

    const entries = await listWorktrees(repo)
    const detached = entries.find((entry) => entry.path.endsWith('list-bare-detached'))
    expect(detached?.detached).toBe(true)
    expect(detached?.branch).toBeNull()
  })

  it('porcelain 解析器：块分隔与字段映射（纯函数面）', () => {
    const output = [
      'worktree Z:/r/main',
      'HEAD 0123456789abcdef0123456789abcdef01234567',
      'branch refs/heads/main',
      '',
      'worktree Z:/r/wt',
      'HEAD fedcba9876543210fedcba9876543210fedcba98',
      'detached',
      '',
      '',
    ].join('\n')
    const entries = parseWorktreeListPorcelain(output)
    expect(entries).toEqual([
      { path: 'Z:/r/main', head: '0123456789abcdef0123456789abcdef01234567', branch: 'main', detached: false, bare: false },
      { path: 'Z:/r/wt', head: 'fedcba9876543210fedcba9876543210fedcba98', branch: null, detached: true, bare: false },
    ])
  })
})

describe('createWorktree（前置 fetch + worktree add -b 一体创建）', () => {
  it('纯本地仓：一体创建成功并返回新条目（fetch 无 remote 为 best-effort 不受阻）', async () => {
    const repo = makeLocalRepo('create-local')
    const wtPath = join(root, 'create-local-wt')
    const entry = await createWorktree(repo, { branch: 'feat/new', path: wtPath, base: 'main' })
    expect(entry.branch).toBe('feat/new')
    expect(existsSync(wtPath)).toBe(true)
    const listed = await listWorktrees(repo)
    expect(listed.some((candidate) => norm(candidate.path) === norm(wtPath) && candidate.branch === 'feat/new')).toBe(true)
  })

  it('带 remote 仓：前置 fetch 刷新远端引用后，基准分支可用 fetch 后才出现的远端分支', async () => {
    const { origin, clone } = makeRemoteRepo('create-remote')
    // clone 时远端还没有 feat/remote-base——fetch 前基准分支不存在
    const seed = join(root, 'create-remote-seed')
    commitFile(seed, 'remote.txt', 'later', 'remote base')
    git(seed, 'push', origin, 'HEAD:refs/heads/feat/remote-base')

    const wtPath = join(root, 'create-remote-wt')
    const entry = await createWorktree(clone, { branch: 'feat/from-remote', path: wtPath, base: 'origin/feat/remote-base' })
    expect(entry.branch).toBe('feat/from-remote')
    expect(existsSync(join(wtPath, 'remote.txt'))).toBe(true)
  })

  it('路径已存在 → CreateWorktreeError(path-exists) 明确报错', async () => {
    const repo = makeLocalRepo('create-dup')
    const wtPath = join(root, 'create-dup-wt')
    await createWorktree(repo, { branch: 'feat/first', path: wtPath, base: 'main' })
    await expect(createWorktree(repo, { branch: 'feat/second', path: wtPath, base: 'main' })).rejects.toMatchObject({
      name: 'CreateWorktreeError',
      reason: 'path-exists',
    })
  })

  it('分支名非法 → CreateWorktreeError(invalid-branch) 明确报错', async () => {
    const repo = makeLocalRepo('create-badbranch')
    const wtPath = join(root, 'create-badbranch-wt')
    await expect(createWorktree(repo, { branch: 'bad..name', path: wtPath, base: 'main' })).rejects.toMatchObject({
      name: 'CreateWorktreeError',
      reason: 'invalid-branch',
    })
    expect(existsSync(wtPath)).toBe(false)
  })
})

describe('deleteWorktree（确认回调门 + worktree remove）', () => {
  it('确认回调通过 → remove 执行，清单中消失', async () => {
    const repo = makeLocalRepo('delete-ok')
    const wtPath = join(root, 'delete-ok-wt')
    git(repo, 'worktree', 'add', wtPath, '-b', 'feat/del')
    const seen: string[] = []
    const result = await deleteWorktree(repo, wtPath, async (context) => {
      seen.push(context.path)
      expect(context.branch).toBe('feat/del')
      return true
    })
    expect(result).toEqual({ removed: true })
    expect(seen).toEqual([norm(wtPath)])
    expect((await listWorktrees(repo)).some((entry) => entry.path === wtPath)).toBe(false)
  })

  it('确认回调拒绝 → 不执行 remove，条目仍在', async () => {
    const repo = makeLocalRepo('delete-no')
    const wtPath = join(root, 'delete-no-wt')
    git(repo, 'worktree', 'add', wtPath, '-b', 'feat/keep')
    const result = await deleteWorktree(repo, wtPath, () => false)
    expect(result).toEqual({ removed: false })
    expect((await listWorktrees(repo)).some((entry) => norm(entry.path) === norm(wtPath))).toBe(true)
  })

  it('目标不存在 → 明确报错', async () => {
    const repo = makeLocalRepo('delete-missing')
    await expect(deleteWorktree(repo, join(root, 'never-existed'), () => true)).rejects.toThrow(/not found/)
  })

  it('本域只供数据：脏 worktree 计数可见，remove 由调用方拦截后才执行（git 原生拒删脏仓为兜底）', async () => {
    const repo = makeLocalRepo('delete-dirty-data')
    const wtPath = join(root, 'delete-dirty-data-wt')
    git(repo, 'worktree', 'add', wtPath, '-b', 'feat/dirty')
    writeFileSync(join(wtPath, 'a.txt'), 'modified')
    expect((await worktreeStatus(wtPath)).dirtyCount).toBe(1)
    // 调用方未拦截（确认误放行）时：git 原生拒绝删脏 worktree——明确报错，不静默 --force
    await expect(deleteWorktree(repo, wtPath, () => true)).rejects.toMatchObject({ name: 'GitCommandError' })
    expect((await listWorktrees(repo)).some((entry) => norm(entry.path) === norm(wtPath))).toBe(true)
  })
})

describe('aheadBehind（rev-list --left-right --count）', () => {
  it('无 upstream → null', async () => {
    const repo = makeLocalRepo('ab-none')
    expect(await aheadBehind(repo, 'main')).toBeNull()
  })

  it('有 upstream：ahead/behind 计数正确', async () => {
    const { origin, clone } = makeRemoteRepo('ab')
    const branch = 'feat/ab'
    git(clone, 'worktree', 'add', join(root, 'ab-wt'), '-b', branch)
    const wt = join(root, 'ab-wt')
    git(clone, 'push', '-u', 'origin', branch)
    // 本地 +2（ahead 2）
    commitFile(wt, 'x1.txt', '1', 'ahead 1')
    commitFile(wt, 'x2.txt', '2', 'ahead 2')
    expect(await aheadBehind(wt, branch)).toEqual({ ahead: 2, behind: 0 })
    // 远端 +1、本地未拉 → 先 fetch 刷 remote-tracking（懒加载语义由调用方持）→ behind 1
    commitFile(join(root, 'ab-seed'), 'y.txt', 'y', 'behind 1')
    git(join(root, 'ab-seed'), 'push', origin, 'HEAD:refs/heads/feat/ab')
    git(wt, 'fetch')
    expect(await aheadBehind(wt, branch)).toEqual({ ahead: 2, behind: 1 })
  })
})

describe('worktreeStatus（git status --porcelain 计数）', () => {
  it('干净仓 → 0；写入未提交文件 → 1', async () => {
    const repo = makeLocalRepo('status')
    expect((await worktreeStatus(repo)).dirtyCount).toBe(0)
    writeFileSync(join(repo, 'a.txt'), 'changed')
    writeFileSync(join(repo, 'untracked.txt'), 'new')
    expect((await worktreeStatus(repo)).dirtyCount).toBe(2)
  })
})

describe('listBranches（for-each-ref refs/heads）', () => {
  it('返回全量本地分支短名', async () => {
    const repo = makeLocalRepo('branches')
    git(repo, 'branch', 'feat/three')
    const branches = await listBranches(repo)
    expect(branches.sort()).toEqual(['feat/one', 'feat/three', 'feat/two', 'main'].sort())
  })
})

describe('defaultBranch（branch -r origin/HEAD → init.defaultBranch → 检出分支 → 本地首分支 → main，均带本地存在性校验）', () => {
  it('有 origin/HEAD → 解析其指向分支', async () => {
    const { clone } = makeRemoteRepo('db-head')
    git(clone, 'remote', 'set-head', 'origin', '-a')
    expect(await defaultBranch(clone)).toBe('main')
  })

  it('origin/HEAD 指向分支本地不存在 → 跳过，退 init.defaultBranch', async () => {
    const { origin, clone } = makeRemoteRepo('db-head-ghost')
    git(clone, 'branch', 'local-b')
    git(clone, 'config', 'init.defaultBranch', 'local-b')
    // 远端造一条 clone 未拉取的分支，并令 origin/HEAD 指向它（本地无对应分支）
    git(join(root, 'db-head-ghost-seed'), 'branch', 'trunk')
    git(join(root, 'db-head-ghost-seed'), 'push', origin, 'trunk')
    git(clone, 'fetch', 'origin', 'trunk')
    git(clone, 'remote', 'set-head', 'origin', 'trunk')
    expect(await defaultBranch(clone)).toBe('local-b')
  })

  it('无 remote → init.defaultBranch 存在于本地分支集 → 退之', async () => {
    const repo = makeLocalRepo('db-config')
    git(repo, 'branch', 'trunk')
    git(repo, 'config', 'init.defaultBranch', 'trunk')
    expect(await defaultBranch(repo)).toBe('trunk')
  })

  it('bug 75726bd0：origin/HEAD 缺失 + init.defaultBranch 指向不存在分支 → 退当前检出分支', async () => {
    const repo = makeLocalRepo('db-invalid-config')
    git(repo, 'config', 'init.defaultBranch', 'master')
    expect(await defaultBranch(repo)).toBe('main')
  })

  it('无 remote 无配置 → 退 main（隔离机器 global/system git 配置）', async () => {
    const repo = makeLocalRepo('db-fallback')
    const emptyConfig = join(root, 'empty.gitconfig')
    writeFileSync(emptyConfig, '')
    const isolatedRunner = (args: readonly string[], cwd: string) =>
      Promise.resolve(((): { code: number; stdout: string; stderr: string } => {
        try {
          return { code: 0, stdout: execFileSync('git', [...args], { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: emptyConfig, GIT_CONFIG_NOSYSTEM: '1' } }), stderr: '' }
        } catch (error) {
          const e = error as { status?: number; stdout?: string; stderr?: string }
          return { code: e.status ?? 1, stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? '') }
        }
      })())
    expect(await defaultBranch(repo, isolatedRunner)).toBe('main')
  })
})

describe('commonDirAnchor（rev-parse --git-common-dir + realpath）', () => {
  it('同一仓库的任意 worktree 锚恒同；子目录调用也同锚', async () => {
    const repo = makeLocalRepo('anchor')
    const wt = join(root, 'anchor-wt')
    git(repo, 'worktree', 'add', wt, '-b', 'feat/anchor')
    const sub = join(wt, 'sub')
    mkdirSync(sub, { recursive: true })
    const anchorMain = await commonDirAnchor(repo)
    const anchorWt = await commonDirAnchor(wt)
    const anchorSub = await commonDirAnchor(sub)
    expect(anchorWt).toBe(anchorMain)
    expect(anchorSub).toBe(anchorMain)
  })

  it('不同仓库锚不同', async () => {
    const a = makeLocalRepo('anchor-a')
    const b = makeLocalRepo('anchor-b')
    expect(await commonDirAnchor(a)).not.toBe(await commonDirAnchor(b))
  })

  it('非 git 目录 → GitCommandError（能力位 false 的边界判定面）', async () => {
    const plain = join(root, 'anchor-plain')
    mkdirSync(plain, { recursive: true })
    await expect(commonDirAnchor(plain)).rejects.toMatchObject({ name: 'GitCommandError' })
  })
})
