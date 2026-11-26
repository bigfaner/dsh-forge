// @dsh-forge/lib-path · project-root —— 项目根归拢推导单源（2026-11-24 用户裁决：归拢逻辑
// 抽 lib 单源，task-loop/spec/project 三插件共享，禁插件各自复本）。语义：
//   `git worktree list --porcelain` 现查 → 空行分块解析 → 主检出根 = 清单首条目
//   （git 恒先列主检出/bare 行）；git 缺席 / 命令失败 / 空清单 = fail-soft
//   （root/entries = undefined + reason 可诊断错误面）。
// node-only 子面（node:child_process）——经 '@dsh-forge/lib-path/project-root' 子路径
// 导出；根入口经 project-key 引入 node:fs（realpath 规范化），已非浏览器安全——
// 浏览器安全子面仍走 '@dsh-forge/lib-path/path-key'（'./path-key' 安全子面先例同径）。
import { spawnSync } from 'node:child_process'
import { normalizeFsPath } from './path-key.js'

/** porcelain 条目（真实 `git worktree list --porcelain` 输出形状：空行分块，块 = worktree/HEAD/branch/detached/bare 行） */
export interface WorktreePorcelainEntry {
  /** worktree 绝对路径（git 输出原样，正斜杠口径） */
  readonly path: string
  /** HEAD commit（bare 下可能为空串） */
  readonly head: string
  /** branch 行原值（refs/heads/x；缺席 = undefined） */
  readonly branch?: string
  readonly detached: boolean
  readonly bare: boolean
}

/** git porcelain 探针缝（测试注入桩；生产 = spawnGitWorktreePorcelain 真探针） */
export type GitPorcelainRunner = (cwd: string) => string

/** 生产探针：run-once spawnSync，5s 上界；git 缺席/非零退出抛错（fail-soft 由调用方经 resolveMainCheckoutRoot 承担） */
export const spawnGitWorktreePorcelain: GitPorcelainRunner = (cwd) => {
  const result = spawnSync('git', ['worktree', 'list', '--porcelain'], {
    cwd,
    encoding: 'utf8',
    timeout: 5_000,
    windowsHide: true,
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`git worktree list --porcelain 退出码 ${String(result.status)}：${(result.stderr ?? '').trim()}`)
  }
  return result.stdout
}

/** porcelain 解析单源（空行分块；主检出行恒首条目；branch 保留原值 refs/heads/x——短名剥离归消费面） */
export function parseWorktreePorcelain(output: string): WorktreePorcelainEntry[] {
  const entries: WorktreePorcelainEntry[] = []
  let current: { path: string; head: string; branch?: string; detached: boolean; bare: boolean } | null = null
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
      current = { path: value, head: '', detached: false, bare: false }
    } else if (current) {
      if (key === 'HEAD') current.head = value
      else if (key === 'branch') current.branch = value
      else if (key === 'detached') current.detached = true
      else if (key === 'bare') current.bare = true
    }
  }
  flush()
  return entries
}

/** 主检出根归拢判定结果：root = 主检出根（entries 首条目）；fail-soft root/entries = undefined + reason 可诊断 */
export interface MainCheckoutResolution {
  readonly root?: string
  readonly entries?: readonly WorktreePorcelainEntry[]
  readonly reason?: string
}

/**
 * 主检出根归拢（单源入口）：现查 porcelain → 首条目即主根。git 探针抛错 / 清单为空
 * = fail-soft（root/entries 缺席 + reason 错误面，调用方留痕不静默）。
 */
export function resolveMainCheckoutRoot(cwd: string, run: GitPorcelainRunner = spawnGitWorktreePorcelain): MainCheckoutResolution {
  let entries: WorktreePorcelainEntry[]
  try {
    entries = parseWorktreePorcelain(run(cwd))
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    return { reason: `git porcelain 探针失败 fail-soft：${message}` }
  }
  if (entries.length === 0) return { reason: 'porcelain 清单为空（非 git 检出）' }
  return { root: entries[0]!.path, entries }
}

/** 目录是否落本仓 worktree 清单任一条目子树内（拼写归一走 normalizeFsPath 单源） */
export function isInWorktreeTree(entries: readonly WorktreePorcelainEntry[], dir: string): boolean {
  const dirKey = normalizeFsPath(dir)
  return entries.some((entry) => {
    const entryKey = normalizeFsPath(entry.path)
    return dirKey === entryKey || dirKey.startsWith(`${entryKey}/`)
  })
}

/** 主根拼写随调用方样本路径风格改写（project_key 拼写敏感——写读两侧键全等，task-loop 1.5 同径） */
export function matchPathSpelling(sample: string, path: string): string {
  return sample.includes('\\') ? path.replaceAll('/', '\\') : path.replaceAll('\\', '/')
}
