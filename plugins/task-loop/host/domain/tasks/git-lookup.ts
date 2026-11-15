// git 只读查找——taskDetail actualFiles 回填源（core forge/tasks/git-lookup.ts 直迁——
// plugin-task-loop 1.7 内联，逐字直迁行为零变化）。
// Hard Rule：白名单子命令封闭 ['show','diff-tree']；ENOENT 与失败同路静默回退记录语。
import { execFile as execFileCallback } from "node:child_process";

/** git 白名单子命令（Hard Rule 封闭集） */
export const GIT_WHITELIST_SUBCOMMANDS = ["show", "diff-tree"] as const;

export type GitWhitelistSubcommand = (typeof GIT_WHITELIST_SUBCOMMANDS)[number];

/** 只读查找超时（timeout 2s） */
export const GIT_LOOKUP_TIMEOUT_MS = 2000;

/** ENOENT/失败同路回退记录语 */
export const GIT_LOOKUP_FALLBACK_ENTRY = "(实际改动范围未水化：git 只读查找缺席或失败——回退记录语)";

/** execFile 注入面（生产 = node:child_process.execFile；测试桩同签名零特判） */
export type GitExecFile = (
  command: string,
  args: readonly string[],
  options: { cwd: string; timeout: number },
  callback: (
    error: (Error & { code?: string | number | null }) | null,
    stdout: string,
    stderr: string,
  ) => void,
) => void;

/** 生产 execFile（[...args] 拷贝入参） */
const defaultExecFile: GitExecFile = (command, args, options, callback) => {
  execFileCallback(command, [...args], options, callback);
};

/** 白名单守卫（未知子命令 fail-loud） */
export function assertGitSubcommandAllowed(subcommand: string): asserts subcommand is GitWhitelistSubcommand {
  if (!(GIT_WHITELIST_SUBCOMMANDS as readonly string[]).includes(subcommand)) {
    throw new Error(`git 子命令不在封闭白名单 ['${GIT_WHITELIST_SUBCOMMANDS.join("', '")}']：${subcommand}`);
  }
}

/**
 * commit 改动文件清单（`git diff-tree --no-commit-id --name-only -r <commit>`）。恒数组参
 * 零 shell 拼接；ENOENT 与执行失败/超时同路 → [回退记录语]；commit 空串同回退；成功空输出
 * → []。查找永不抛出——读面不被 git 拖垮。
 */
export async function listCommitFiles(
  deps: { readonly execFile?: GitExecFile } = {},
  q: { readonly cwd: string; readonly commitHash: string },
): Promise<string[]> {
  const run = deps.execFile ?? defaultExecFile;
  const commitHash = q.commitHash.trim();
  if (commitHash === "") return [GIT_LOOKUP_FALLBACK_ENTRY];
  const subcommand: GitWhitelistSubcommand = "diff-tree";
  assertGitSubcommandAllowed(subcommand);
  const args = [subcommand, "--no-commit-id", "--name-only", "-r", commitHash];
  return new Promise<string[]>((resolve) => {
    try {
      run("git", args, { cwd: q.cwd, timeout: GIT_LOOKUP_TIMEOUT_MS }, (error, stdout) => {
        if (error !== null) {
          resolve([GIT_LOOKUP_FALLBACK_ENTRY]);
          return;
        }
        resolve(
          stdout
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line !== ""),
        );
      });
    } catch {
      resolve([GIT_LOOKUP_FALLBACK_ENTRY]);
    }
  });
}
