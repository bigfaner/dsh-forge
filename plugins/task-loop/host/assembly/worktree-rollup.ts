// host/assembly · worktree-rollup.ts —— worktree 归拢主根推导（2026-11-24 用户裁决：
// git 命令现查，禁自造路径剥取规则）。marker `.forge/worktrees` 段仅作**触发条件**（零 git
// 调用省费的廉价预检——forge 派发的 worker cwd 恒在该形态下），主根一律由
// `git worktree list --porcelain` 输出推导：命中本仓 worktree 清单任一条目路径 ⇒ 主根 =
// 清单首条目（git 恒先列主检出/bare 行）。git 缺席 / 命令失败 / cwd 不属清单任一条目 =
// fail-soft 回退 `deriveProjectKey(cwd)`（worktree 键——行为同修口前），回退原因由调用方
// 经诊断面留痕（AGENTS §7 不静默）。纯解析函数与 git 探针经 runner 缝分离，单测注入桩。
import { spawnSync } from "node:child_process";
import { deriveProjectKey } from "../db/repositories/project-key.js";

/** worktree 归拢结果（rolledUp = git 推导成功；fallbackReason = fail-soft 回退原因） */
export interface WorktreeRollupResult {
  readonly key: string;
  readonly rolledUp: boolean;
  /** git 现查推导出的主检出根（rolledUp = true 时在场，deriveProjectKey 原文口径） */
  readonly mainRoot?: string;
  readonly fallbackReason?: string;
}

/** git porcelain 探针缝（测试注入桩；生产 = spawnSync 真探针） */
export type GitPorcelainRunner = (cwd: string) => string;

export const MARKER_PATTERN = /[\\/]\.forge[\\/]worktrees[\\/]/;

/** 生产 git 探针：run-once spawnSync，5s 上界，git 缺席/非零退出 = 抛错（fail-soft 由调用方承担） */
export const spawnGitPorcelain: GitPorcelainRunner = (cwd) => {
  const result = spawnSync("git", ["worktree", "list", "--porcelain"], {
    cwd,
    encoding: "utf8",
    timeout: 5_000,
    windowsHide: true,
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`git worktree list --porcelain 退出码 ${String(result.status)}：${(result.stderr ?? "").trim()}`);
  }
  return result.stdout;
};

/** Windows 反斜杠 → 正斜杠 + 去尾分隔符（条目比对口径，worktree-ops.ts toGitPath 同径） */
const normalizeKey = (path: string): string => path.replaceAll("\\", "/").replace(/\/+$/, "");

/** porcelain 解析（worktree-ops.ts parseWorktreeListPorcelain 同构窄版——只取 worktree 路径行） */
export function parseWorktreePaths(output: string): string[] {
  const paths: string[] = [];
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("worktree ")) paths.push(trimmed.slice("worktree ".length));
  }
  return paths;
}

/**
 * worktree 归拢主根推导（git 现查版——AC 用户裁决 2026-11-24）：
 * ① marker 不命中 → 零 git 调用，原样 deriveProjectKey(cwd)；
 * ② marker 命中 → porcelain 现查；cwd 归属清单任一条目子树 → 主根 = 首条目（git 主行恒先列）
 *    → deriveProjectKey(主根)；③ git 失败/非本仓清单 → fail-soft 回退 cwd 键 + 回退原因。
 * 空 cwd 派生拒绝由 deriveProjectKey 原样上抛（marker 不命中径）。
 */
export function deriveProjectKeyRolledUpGit(cwd: string, runner: GitPorcelainRunner = spawnGitPorcelain): WorktreeRollupResult {
  if (!MARKER_PATTERN.test(cwd)) {
    return { key: deriveProjectKey(cwd), rolledUp: false };
  }
  let output: string;
  try {
    output = runner(cwd);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { key: deriveProjectKey(cwd), rolledUp: false, fallbackReason: `git porcelain 探针失败 fail-soft：${message}` };
  }
  const cwdKey = normalizeKey(cwd);
  const paths = parseWorktreePaths(output).map(normalizeKey);
  const inTree = paths.some((p) => cwdKey === p || cwdKey.startsWith(`${p}/`));
  if (!inTree) {
    return { key: deriveProjectKey(cwd), rolledUp: false, fallbackReason: "porcelain 清单不含 cwd（非本仓 worktree）——回退 cwd 键" };
  }
  const mainRoot = paths[0]!;
  // git 输出恒正斜杠；project_key 拼写敏感（deriveDirName canonical path 原样入参）——主根
  // 改写为 cwd 同分隔符拼写，保证写（worktree cwd）读（主根 cwd）两侧键全等。
  const canonicalRoot = cwd.includes("\\") ? mainRoot.replaceAll("/", "\\") : mainRoot.replaceAll("\\", "/");
  return { key: deriveProjectKey(canonicalRoot), rolledUp: true, mainRoot: canonicalRoot };
}
