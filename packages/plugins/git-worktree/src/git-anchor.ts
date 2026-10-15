// @dsh-forge/git-worktree —— 仓库身份锚（提案「流程一 · 要点」节）。
// `git rev-parse --git-common-dir` 回答共享仓库数据（对象库/引用/配置）所在目录：
// 同一仓库任意 worktree 输出恒同，不同仓库/子模块输出不同——git 官方的「同仓判等」接口。
// 锚 = realpath(输出按 cwd 解析)：消除 8.3 短名/符号链接/大小写差异，与 ws_path canonical 同口径。
import { execFile } from 'node:child_process'
import { realpath } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'

/** 单条 git 命令的执行结果 */
export interface GitCommandResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

/**
 * git 命令执行器（注入缝）：执行 `git <args>`（cwd 指定工作目录）。
 * 默认实现 node:child_process execFile，非零退出折叠为结果对象——不抛，判定面见 code。
 */
export type GitRunner = (args: readonly string[], cwd: string) => Promise<GitCommandResult>

const defaultRunner: GitRunner = (args, cwd) =>
  new Promise((resolvePromise) => {
    execFile('git', [...args], { cwd, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        // PATH 无 git：无法判定的执行层失败——以非零结果呈现，调用方按需 fail-soft
        resolvePromise({ code: 1, stdout: '', stderr: 'spawn git ENOENT' })
        return
      }
      if (error) {
        resolvePromise({ code: typeof error.code === 'number' ? error.code : 1, stdout: String(stdout), stderr: String(stderr) })
        return
      }
      resolvePromise({ code: 0, stdout: String(stdout), stderr: String(stderr) })
    })
  })

/** git 命令非零退出错误（stderr 携带 git 的明确报错文案） */
export class GitCommandError extends Error {
  constructor(readonly args: readonly string[], readonly code: number, readonly stderr: string) {
    super(`git ${args.join(' ')} failed (exit ${code}): ${stderr.trim()}`)
    this.name = 'GitCommandError'
  }
}

/** 执行 git 命令，非零退出抛 GitCommandError（预期失败面由调用方先行探测或捕获） */
export async function runGit(args: readonly string[], cwd: string, runner: GitRunner = defaultRunner): Promise<string> {
  const result = await runner(args, cwd)
  if (result.code !== 0) throw new GitCommandError(args, result.code, result.stderr)
  return result.stdout
}

/**
 * 仓库身份锚：`git rev-parse --git-common-dir` + realpath。
 * 同锚 = 同逻辑项目（归并键）；命令失败 = 非 git → 能力位 false 的边界判定面。
 * 抛 GitCommandError（非 git 目录 / PATH 无 git），由调用方决定 fail-soft 语义。
 */
export async function commonDirAnchor(cwd: string, runner: GitRunner = defaultRunner): Promise<string> {
  const out = (await runGit(['rev-parse', '--git-common-dir'], cwd, runner)).trim()
  if (out.length === 0) throw new GitCommandError(['rev-parse', '--git-common-dir'], 1, 'empty output')
  const absolute = isAbsolute(out) ? out : resolve(cwd, out)
  return realpath(absolute)
}
