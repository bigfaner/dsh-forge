// @dsh-forge/git-worktree —— git 在场性启动检测（提案「启动检测」节）。
// 经 `git --version` 探测 PATH 中的 git；检测动作与判定解耦——命令执行器经工厂注入，
// 单测以 fake runner 覆盖（真机取证见 git-presence.test.ts 真机探测用例）。
import { execFile } from 'node:child_process'

/** 单条 git 命令的执行结果（子面：只暴露判定所需字段） */
export interface GitCommandResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

/**
 * git 命令执行器（注入缝）：签名语义 = 执行 `git --version`。
 * 默认实现用 node:child_process execFile（'git' 走 PATH 解析）。
 */
export type GitCommandRunner = () => Promise<GitCommandResult>

const defaultRunner: GitCommandRunner = () =>
  new Promise((resolve) => {
    execFile('git', ['--version'], (error, stdout, stderr) => {
      if (error) {
        // ENOENT（PATH 无 git）/ 其它执行失败统一折叠为非零结果——不抛，判定面见 code
        resolve({ code: error.code != null ? Number(error.code) || 1 : 1, stdout: '', stderr: String(stderr ?? error.message) })
        return
      }
      resolve({ code: 0, stdout: String(stdout), stderr: String(stderr) })
    })
  })

/**
 * git 在场性检测：`git --version` 退出 0 即在场。
 * 失败（ENOENT / 非零退出 / runner 抛错）一律返回 false——检测本身 fail-soft，不抛断宿主。
 */
export async function checkGitPresence(runner: GitCommandRunner = defaultRunner): Promise<boolean> {
  try {
    const result = await runner()
    return result.code === 0
  } catch {
    return false
  }
}
