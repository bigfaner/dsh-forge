// @dsh-forge/git-worktree —— worktree 管理域（提案「数据源与命令面」节全部命令封装）。
// 读：list --porcelain / rev-list --left-right --count / status --porcelain / for-each-ref / branch -r。
// 写（封闭写集）：create = git fetch（前置刷新）→ worktree add -b 一体创建；delete = 确认回调通过后 worktree remove。
// 删除拦截数据（未提交变更/挂靠会话）由本域 status/list 提供、调用方持拦截语义。
import { existsSync } from 'node:fs'
import { GitCommandError, runGit, type GitRunner } from './git-anchor.js'

/** worktree 清单条目（porcelain 解析面） */
export interface WorktreeEntry {
  /** worktree 绝对路径（git 输出原样，正斜杠口径） */
  readonly path: string
  /** HEAD commit（bare 下可能为空） */
  readonly head: string
  /** 检出分支短名（refs/heads/x → x）；detached/bare 为 null */
  readonly branch: string | null
  readonly detached: boolean
  readonly bare: boolean
}

/** Windows 反斜杠路径 → git 输出正斜杠口径（条目比对用） */
const toGitPath = (path: string): string => path.replaceAll('\\', '/')

/** ahead/behind 计数（无 upstream 返回 null） */
export interface AheadBehind {
  /** 本地领先 upstream 的提交数 */
  readonly ahead: number
  /** 本地落后 upstream 的提交数 */
  readonly behind: number
}

/** 未提交变更计数（删除确认框检查项） */
export interface WorktreeStatus {
  readonly dirtyCount: number
}

/** 解析 `git worktree list --porcelain` 输出 */
export function parseWorktreeListPorcelain(output: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = []
  let current: { path: string; head: string; branch: string | null; detached: boolean; bare: boolean } | null = null
  const flush = () => {
    if (current) entries.push(current)
    current = null
  }
  for (const line of output.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') {
      flush()
      continue
    }
    const sep = trimmed.indexOf(' ')
    const key = sep === -1 ? trimmed : trimmed.slice(0, sep)
    const value = sep === -1 ? '' : trimmed.slice(sep + 1)
    if (key === 'worktree') {
      flush()
      current = { path: value, head: '', branch: null, detached: false, bare: false }
    } else if (current) {
      if (key === 'HEAD') current.head = value
      else if (key === 'branch') current.branch = value.replace(/^refs\/heads\//, '')
      else if (key === 'detached') current.detached = true
      else if (key === 'bare') current.bare = true
    }
  }
  flush()
  return entries
}

/** worktree 全量清单（含手工建；path/branch/detached/bare） */
export async function listWorktrees(cwd: string, runner?: GitRunner): Promise<WorktreeEntry[]> {
  const output = await runGit(['worktree', 'list', '--porcelain'], cwd, runner)
  return parseWorktreeListPorcelain(output)
}

/** create 前置校验失败（路径已存在 / 分支名非法） */
export class CreateWorktreeError extends Error {
  constructor(readonly reason: 'path-exists' | 'invalid-branch', message: string) {
    super(message)
    this.name = 'CreateWorktreeError'
  }
}

/** create 参数 */
export interface CreateWorktreeOptions {
  /** 新分支名（主输入） */
  readonly branch: string
  /** worktree 绝对路径 */
  readonly path: string
  /** 基准分支（默认 main 语义，调用方传入） */
  readonly base: string
}

/**
 * 新建 worktree：前置 `git fetch` 刷新 origin/HEAD 与远端分支（本地超前 origin 由 fetch 拉平；
 * 无 remote 的纯本地仓 fetch 失败为无害跳过），再 `git worktree add -b <新分支> <路径> <基准分支>` 一体创建。
 * 路径已存在 / 分支名非法 → CreateWorktreeError 明确报错。返回创建后的新清单条目。
 */
export async function createWorktree(cwd: string, options: CreateWorktreeOptions, runner?: GitRunner): Promise<WorktreeEntry> {
  const { branch, path, base } = options
  if (existsSync(path)) {
    throw new CreateWorktreeError('path-exists', `worktree path already exists: ${path}`)
  }
  // 分支名合法性预检（git 官方判据，含 Windows 保留名/魔法名）
  const check = await runGitLoose(['check-ref-format', '--branch', branch], cwd, runner)
  if (check.code !== 0) {
    throw new CreateWorktreeError('invalid-branch', `invalid branch name: ${branch}`)
  }
  // 前置 fetch：刷新远端引用；无 remote 等失败为 best-effort（本地创建不受阻）
  await runGitLoose(['fetch', '--prune'], cwd, runner)
  await runGit(['worktree', 'add', '-b', branch, path, base], cwd, runner)
  const created = (await listWorktrees(cwd, runner)).find((entry) => entry.path === toGitPath(path))
  if (!created) throw new Error(`worktree add succeeded but entry missing: ${path}`)
  return created
}

/** 确认回调入参（删除二次确认的状态清单数据面） */
export interface DeleteConfirmationContext {
  readonly path: string
  readonly branch: string | null
}

/** delete 结果 */
export interface DeleteWorktreeResult {
  /** 是否实际执行了 worktree remove */
  readonly removed: boolean
}

/**
 * 删除 worktree：仅经确认回调通过后执行 `git worktree remove`。
 * 未提交变更/挂靠会话的拦截语义由调用方持（本域只经 status/list 供数据）——
 * 确认回调收到条目上下文，返回 false/未通过即不执行删除。
 */
export async function deleteWorktree(
  cwd: string,
  path: string,
  confirm: (context: DeleteConfirmationContext) => Promise<boolean> | boolean,
  runner?: GitRunner,
): Promise<DeleteWorktreeResult> {
  const entries = await listWorktrees(cwd, runner)
  const entry = entries.find((candidate) => candidate.path === toGitPath(path))
  if (!entry) {
    throw new Error(`worktree not found: ${path}`)
  }
  const confirmed = await confirm({ path: entry.path, branch: entry.branch })
  if (!confirmed) return { removed: false }
  await runGit(['worktree', 'remove', path], cwd, runner)
  return { removed: true }
}

/**
 * ahead/behind：`git rev-list --left-right --count <upstream>...<branch>`。
 * 无 upstream（`@{upstream}` 解析失败）返回 null（懒加载语义由调用方持）。
 * left = upstream 侧独有提交 = behind；right = 本地独有 = ahead。
 */
export async function aheadBehind(cwd: string, branch: string, runner?: GitRunner): Promise<AheadBehind | null> {
  const upstreamProbe = await runGitLoose(['rev-parse', '--abbrev-ref', `${branch}@{upstream}`], cwd, runner)
  if (upstreamProbe.code !== 0) return null
  const upstream = upstreamProbe.stdout.trim()
  const output = (await runGit(['rev-list', '--left-right', '--count', `${upstream}...${branch}`], cwd, runner)).trim()
  const parts = output.split(/\s+/).map((part) => Number.parseInt(part, 10))
  const left = parts[0] ?? 0
  const right = parts[1] ?? 0
  return { ahead: Number.isFinite(right) ? right : 0, behind: Number.isFinite(left) ? left : 0 }
}

/** 未提交变更计数：`git status --porcelain` 行数 */
export async function worktreeStatus(cwd: string, runner?: GitRunner): Promise<WorktreeStatus> {
  const output = await runGit(['status', '--porcelain'], cwd, runner)
  const dirtyCount = output.split('\n').filter((line) => line.trim() !== '').length
  return { dirtyCount }
}

/** 本地分支清单：`git for-each-ref refs/heads --format='%(refname:short)'` */
export async function listBranches(cwd: string, runner?: GitRunner): Promise<string[]> {
  const output = await runGit(['for-each-ref', 'refs/heads', '--format=%(refname:short)'], cwd, runner)
  return output.split('\n').map((line) => line.trim()).filter((line) => line !== '')
}

/**
 * 默认分支：`git branch -r` 解析 `origin/HEAD -> origin/<分支>` 行；
 * 无 remote 退 `git config init.defaultBranch`，再退 `main`。
 */
export async function defaultBranch(cwd: string, runner?: GitRunner): Promise<string> {
  const remote = await runGitLoose(['branch', '-r'], cwd, runner)
  if (remote.code === 0) {
    for (const line of remote.stdout.split('\n')) {
      const match = line.trim().match(/^origin\/HEAD\s*->\s*origin\/(\S+)$/)
      const name = match?.[1]
      if (name) return name
    }
  }
  const configured = await runGitLoose(['config', '--get', 'init.defaultBranch'], cwd, runner)
  if (configured.code === 0) {
    const value = configured.stdout.trim()
    if (value !== '') return value
  }
  return 'main'
}

/** 低层执行：非零退出返回结果对象不抛（预检/best-effort 面） */
async function runGitLoose(args: readonly string[], cwd: string, runner?: GitRunner) {
  try {
    const stdout = await runGit(args, cwd, runner)
    return { code: 0, stdout, stderr: '' }
  } catch (error) {
    if (error instanceof GitCommandError) return { code: error.code, stdout: '', stderr: error.stderr }
    throw error
  }
}
