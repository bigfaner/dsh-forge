// git 只读查找——taskDetail actualFiles 回填源（任务 2.6；tech-design §Interface 1 taskDetail
// 「实际改动范围 = files_json → commit 只读 git 查询」+ §Dependencies「git = 可选环境依赖」+
// §Security Mitigations ③「execFile('git', [白名单子命令…]) 恒数组参、禁 shell 字符串、
// 2s 超时、ENOENT 同回退」）。单独文件落位 = 审计面（Implementation Notes：本文件 = 进程内
// git 唯一调用点——SC-NFR 单一写入路径代码审计锚，git 仅只读两子命令）。
//
// Hard Rule（任务 2.6）：白名单子命令封闭 ['show','diff-tree']——新增 = 契约面变更；
// ENOENT 与失败同路静默回退记录语（git 可选环境依赖——状态层不感知 git 存在性，
// submit 质量门不含 git；executor 遇缺席走 blocked fix 链，不属本读面职责）。
import { execFile as execFileCallback } from 'node:child_process'

/** git 白名单子命令（Hard Rule 封闭集；本查找恒用 'diff-tree'——'show' 为白名单预留位） */
export const GIT_WHITELIST_SUBCOMMANDS = ['show', 'diff-tree'] as const

export type GitWhitelistSubcommand = (typeof GIT_WHITELIST_SUBCOMMANDS)[number]

/** 只读查找超时（tech-design §Interface 1：timeout 2s） */
export const GIT_LOOKUP_TIMEOUT_MS = 2000

/** ENOENT/失败同路回退记录语（actualFiles 单元素回退形态——列表/抽屉直接呈现的审计行） */
export const GIT_LOOKUP_FALLBACK_ENTRY = '(实际改动范围未水化：git 只读查找缺席或失败——回退记录语)'

/**
 * execFile 注入面（生产 = node:child_process.execFile；测试桩记录调用形状/受控成败——
 * 同签名零特判）。恒 (command, args 数组, options, callback) 四参——禁 shell 字符串拼接。
 */
export type GitExecFile = (
  command: string,
  args: readonly string[],
  options: { cwd: string; timeout: number },
  callback: (
    error: (Error & { code?: string | number | null }) | null,
    stdout: string,
    stderr: string,
  ) => void,
) => void

/** 生产 execFile（[...args] 拷贝入参——数组参字面锚，node 类型面兼容） */
const defaultExecFile: GitExecFile = (command, args, options, callback) => {
  execFileCallback(command, [...args], options, callback)
}

/** 白名单守卫（防御收窄——未知子命令 fail-loud，禁动态拼装绕过封闭集） */
export function assertGitSubcommandAllowed(subcommand: string): asserts subcommand is GitWhitelistSubcommand {
  if (!(GIT_WHITELIST_SUBCOMMANDS as readonly string[]).includes(subcommand)) {
    throw new Error(
      `git 子命令不在封闭白名单 ['${GIT_WHITELIST_SUBCOMMANDS.join("', '")}']：${subcommand}`,
    )
  }
}

/**
 * commit 改动文件清单（`git diff-tree --no-commit-id --name-only -r <commit>`——输出 = 每行一
 * 正斜杠路径）。恒数组参零 shell 拼接；ENOENT（git 二进制缺席）与执行失败/超时同路 →
 * [回退记录语]（不区分形态——可选环境依赖语义）；commit 空串（数据面缺席）同回退；
 * 成功空输出（空 commit）→ []（真实零改动）。cwd = 工作区仓库根（装配层 routing.wsPath
 * 解析注入）。查找永不抛出——读面（taskDetail）不被 git 拖垮。
 */
export async function listCommitFiles(
  deps: { readonly execFile?: GitExecFile } = {},
  q: { readonly cwd: string; readonly commitHash: string },
): Promise<string[]> {
  const run = deps.execFile ?? defaultExecFile
  const commitHash = q.commitHash.trim()
  if (commitHash === '') return [GIT_LOOKUP_FALLBACK_ENTRY]
  const subcommand: GitWhitelistSubcommand = 'diff-tree'
  assertGitSubcommandAllowed(subcommand)
  const args = [subcommand, '--no-commit-id', '--name-only', '-r', commitHash]
  return new Promise<string[]>((resolve) => {
    try {
      run('git', args, { cwd: q.cwd, timeout: GIT_LOOKUP_TIMEOUT_MS }, (error, stdout) => {
        if (error !== null) {
          resolve([GIT_LOOKUP_FALLBACK_ENTRY])
          return
        }
        resolve(
          stdout
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line !== ''),
        )
      })
    } catch {
      resolve([GIT_LOOKUP_FALLBACK_ENTRY]) // 注入面同步异常同路回退
    }
  })
}
