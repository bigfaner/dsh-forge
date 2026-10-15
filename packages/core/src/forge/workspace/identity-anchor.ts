// 身份归并锚（1.5 流程一——worktree/branch 管理·集成层）：归并键 = realpath(git
// rev-parse --git-common-dir)。机制：附属 worktree 无自有 .git 目录（仅指针文件），
// 对象/引用/配置全仓一份——同仓任意 worktree 执行此命令输出恒同，不同仓库/子模块输出
// 不同；外层 realpath 规范化（消 8.3 短名/symlink/大小写），与 ws_path 落库 canonical
// 同口径保证字符串比对可靠（对比 --git-dir 每附属 worktree 各异、remote url 可缺失，
// 均不可作归并键）。定位：纯运行期解析键——不落库、不建表、不替代 ws_path。
//
// 三面：① 归并键（同锚 = 同逻辑项目）；② 边界判定（子模块自锚；命令失败 = 非 git →
// 能力位 false）；③ 主 worktree 判定作用域（判定只在一个锚的 worktree 集内做）。
// 消费面 = project-service 注册链归并层（attachExistingRow 之前）；GitIdentityPort
// 由装配侧注入（缺席 = 归并层缺席，注册行为零变化），createGitIdentityPort 为默认
// git CLI 实现（子模块：锚 = 子模块自身 common dir，天然归并到子模块项目）。
import { execFile } from 'node:child_process'
import { realpath } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { promisify } from 'node:util'
import { normalizeFsPath } from '@dsh-forge/path-key'

const execFileP = promisify(execFile)

/** git worktree list 条目（branch = 本地检出分支短名；detached/bare → null） */
export interface WorktreeEntry {
  readonly path: string
  readonly branch: string | null
}

/**
 * git 身份探针端口（归并层唯一 git 触点——集成层不写 git 命令，读命令封装在此）。
 * 全部查询 fail-soft 返回 null：非 git 目录 / git 缺席 / 命令失败——归并层据此退现行为。
 */
export interface GitIdentityPort {
  /** dir 所在仓库的 common dir realpath 锚；null = 非 git / 探测失败 */
  commonDirAnchor(dir: string): Promise<string | null>
  /** dir 所在仓库的在场 worktree 清单；null = 探测失败 */
  worktrees(dir: string): Promise<WorktreeEntry[] | null>
  /** dir 所在仓库 origin 默认分支（origin/HEAD 解析，如 'main'）；null = 无 origin/HEAD */
  originDefaultBranch(dir: string): Promise<string | null>
}

/** 主 worktree 判定候选（归并层从 projects 行 + worktree 清单投影的纯数据） */
export interface MainWorktreeCandidate {
  readonly id: string
  /** 该行 ws_path 的本地检出分支（不在场 worktree = null） */
  readonly branch: string | null
  /** 首观察时间（projects.created_at；git 无创建时间字段，缺省语义见判定④） */
  readonly createdAt: string | null
}

/**
 * 主 worktree 判定（纯函数——短路优先，以 origin 为准；裁决口径提案流程一）：
 * ① 同锚活跃行唯一 → 该行即主（短路——防单行场景根 worktree 切分支后被误判缺失）；
 * ② 检出 origin 默认分支（origin/HEAD 解析）者优先；
 * ③ 退本地 main 检出 > master 检出；
 * ④ 退首观察时间最早（created_at 缺省 = 当前时间——git 无创建时间字段）。
 * 返回主候选 id；空候选集 → null。
 */
export function selectMainWorktree(
  candidates: readonly MainWorktreeCandidate[],
  opts: { readonly originDefaultBranch: string | null; readonly now: string },
): string | null {
  const first = candidates[0]
  if (first === undefined) return null
  if (candidates.length === 1) return first.id
  const byBranch = (branch: string | null): MainWorktreeCandidate | undefined =>
    branch === null ? undefined : candidates.find((c) => c.branch !== null && c.branch === branch)
  const originHit = byBranch(opts.originDefaultBranch)
  if (originHit !== undefined) return originHit.id
  const mainHit = byBranch('main')
  if (mainHit !== undefined) return mainHit.id
  const masterHit = byBranch('master')
  if (masterHit !== undefined) return masterHit.id
  let best = first
  for (const c of candidates.slice(1)) {
    if ((c.createdAt ?? opts.now) < (best.createdAt ?? opts.now)) best = c
  }
  return best.id
}

/** git 命令只读封装（fail-soft：任何失败 → null） */
async function gitOut(dir: string, args: readonly string[]): Promise<string | null> {
  try {
    const r = await execFileP('git', [...args], { cwd: dir, windowsHide: true, maxBuffer: 4 * 1024 * 1024 })
    return r.stdout.trim()
  } catch {
    return null
  }
}

/** common dir 输出 → realpath 锚（相对输出按 dir 解析；realpath 失败退解析结果） */
async function anchorFromCommonDir(dir: string, out: string): Promise<string | null> {
  if (out.length === 0) return null
  const abs = isAbsolute(out) ? out : resolve(dir, out)
  try {
    return await realpath(abs)
  } catch {
    return abs
  }
}

/**
 * 默认 GitIdentityPort 实现（git CLI 只读）：锚 = realpath(git rev-parse
 * --git-common-dir)；worktree 清单 = git worktree list --porcelain（branch 行去
 * refs/heads/ 前缀，detached → null）；origin 默认分支 = git branch -r 解析
 * 'origin/HEAD -> origin/<分支>' 行。git 缺席/非 git 目录 → 全 null（能力位 false）。
 */
export function createGitIdentityPort(): GitIdentityPort {
  return {
    async commonDirAnchor(dir) {
      const out = await gitOut(dir, ['rev-parse', '--git-common-dir'])
      return out === null ? null : anchorFromCommonDir(dir, out)
    },
    async worktrees(dir) {
      const out = await gitOut(dir, ['worktree', 'list', '--porcelain'])
      if (out === null || out.length === 0) return out === null ? null : []
      const entries: { path: string; branch: string | null }[] = []
      let current: { path: string; branch: string | null } | undefined
      for (const line of out.split(/\r?\n/)) {
        if (line.startsWith('worktree ')) {
          current = { path: line.slice('worktree '.length), branch: null }
          entries.push(current)
        } else if (current !== undefined && line.startsWith('branch ')) {
          current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '')
        }
      }
      return entries
    },
    async originDefaultBranch(dir) {
      const out = await gitOut(dir, ['branch', '-r'])
      if (out === null) return null
      const line = out.split(/\r?\n/).find((l) => l.includes('origin/HEAD'))
      if (line === undefined) return null
      const m = line.match(/origin\/HEAD\s*->\s*origin\/(\S+)/)
      return m?.[1] ?? null
    },
  }
}

/** 归并键比对口径（normalizeFsPath 同源键——与注册链 ws_path 比对同基准） */
export function sameAnchor(a: string, b: string): boolean {
  return normalizeFsPath(a) === normalizeFsPath(b)
}
